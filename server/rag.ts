import { GoogleGenAI, Type } from '@google/genai';
import { RagResponse, RetrievedChunk, SourceReference } from '../src/types';

const SYSTEM_INSTRUCTION = `You are an AI assistant that explains software repositories.
Answer questions ONLY using the supplied repository context.
Do not invent files, functions, classes, APIs, dependencies, or behavior.
If the supplied context is insufficient, clearly say that there is not enough evidence in the indexed codebase.

You must return your output adhering to the requested JSON schema with:
1. answer: A concise, direct summary of the answer (2-4 sentences).
2. relevant_files: An array of exact file paths present in the context.
3. relevant_functions: An array of function/method names (e.g. ["login_user()", "authenticate_request()"]).
4. how_it_works: An array of step-by-step bullet points explaining the execution flow.
5. source_references: An array of specific references with:
   - file_path
   - symbol_name
   - symbol_type
   - start_line
   - end_line
   - reason: brief note on what this reference does.`;

export class RagService {
  private ai: GoogleGenAI | null = null;
  // Model cooldown tracking (timestamp until which a model is deprioritized)
  private modelCooldowns: Map<string, number> = new Map();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  private getClient(): GoogleGenAI | null {
    if (this.ai) return this.ai;
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      return this.ai;
    }
    return null;
  }

  // Helper to execute with timeout to prevent hanging on congested models
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private getPrioritizedModels(): string[] {
    const defaultModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    const now = Date.now();

    // Sort so models currently in cooldown are pushed to the back
    return [...defaultModels].sort((a, b) => {
      const aCooldown = (this.modelCooldowns.get(a) || 0) > now ? 1 : 0;
      const bCooldown = (this.modelCooldowns.get(b) || 0) > now ? 1 : 0;
      return aCooldown - bCooldown;
    });
  }

  async generateAnswer(
    query: string,
    retrievedChunks: RetrievedChunk[]
  ): Promise<RagResponse> {
    const startTime = Date.now();

    // Map the retrieved chunks into clean preview objects
    const chunkPreviews = retrievedChunks.map(c => ({
      file_path: c.chunk.file_path,
      symbol_name: c.chunk.symbol_name,
      symbol_type: c.chunk.symbol_type,
      start_line: c.chunk.start_line,
      end_line: c.chunk.end_line,
      similarity: c.similarity,
      code_preview: c.chunk.code,
    }));

    // If no context was retrieved or similarities are negligible
    if (retrievedChunks.length === 0) {
      return {
        answer: 'There is not enough evidence in the indexed codebase to answer this question. No matching files or symbols were found.',
        relevant_files: [],
        relevant_functions: [],
        how_it_works: ['No matching code chunks were located in the repository.'],
        source_references: [],
        retrieved_chunks: [],
        query,
        latency_ms: Date.now() - startTime,
      };
    }

    // Format retrieved context for prompt
    const contextText = retrievedChunks
      .map((item, idx) => {
        const c = item.chunk;
        return `--- CODE CHUNK ${idx + 1} (Score: ${item.combinedScore}) ---
File: ${c.file_path}
Symbol: ${c.symbol_name} (${c.symbol_type})
Lines: ${c.start_line}-${c.end_line}
Code:
${c.code}
`;
      })
      .join('\n\n');

    const prompt = `User Question: ${query}

Retrieved Code Context from Repository:
${contextText}

Analyze this context and answer the user question strictly using the provided code. If the question cannot be answered from this code, state that there is not enough evidence in the indexed codebase.`;

    const client = this.getClient();

    if (client) {
      const modelsToTry = this.getPrioritizedModels();

      for (const modelName of modelsToTry) {
        try {
          const response = await this.executeWithTimeout(
            client.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    answer: { type: Type.STRING },
                    relevant_files: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    relevant_functions: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    how_it_works: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    source_references: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          file_path: { type: Type.STRING },
                          symbol_name: { type: Type.STRING },
                          symbol_type: { type: Type.STRING },
                          start_line: { type: Type.INTEGER },
                          end_line: { type: Type.INTEGER },
                          reason: { type: Type.STRING },
                        },
                        required: ['file_path', 'symbol_name', 'start_line', 'end_line'],
                      },
                    },
                  },
                  required: ['answer', 'relevant_files', 'relevant_functions', 'how_it_works', 'source_references'],
                },
              },
            }),
            14000
          );

          const text = response.text?.trim() || '';
          if (text) {
            const parsed = JSON.parse(text);

            return {
              answer: parsed.answer || 'Answer generated based on retrieved repository context.',
              relevant_files: parsed.relevant_files || [],
              relevant_functions: parsed.relevant_functions || [],
              how_it_works: parsed.how_it_works || [],
              source_references: parsed.source_references || [],
              retrieved_chunks: chunkPreviews,
              query,
              latency_ms: Date.now() - startTime,
            };
          }
        } catch (err: any) {
          const errMsg = String(err?.message || err);
          const isHighDemandOrTransient =
            errMsg.includes('503') ||
            errMsg.includes('high demand') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('429') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('timed out');

          if (isHighDemandOrTransient) {
            // Set 60-second cooldown on this model so alternative models are chosen first
            this.modelCooldowns.set(modelName, Date.now() + 60000);
            console.log(`[RAG Service] ${modelName} in high demand or timed out; switching to fallback model...`);
          } else {
            console.log(`[RAG Service] Model ${modelName} did not complete; switching to fallback model...`);
          }
        }
      }
    }

    // Deterministic grounded fallback response
    return this.generateGroundedFallback(query, retrievedChunks, chunkPreviews, startTime);
  }

  private generateGroundedFallback(
    query: string,
    chunks: RetrievedChunk[],
    chunkPreviews: any[],
    startTime: number
  ): RagResponse {
    const top = chunks.slice(0, 4);
    const files = Array.from(new Set(top.map(t => t.chunk.file_path)));
    const symbols = Array.from(new Set(top.map(t => `${t.chunk.symbol_name}()`)));

    const references: SourceReference[] = top.map(t => ({
      file_path: t.chunk.file_path,
      symbol_name: t.chunk.symbol_name,
      symbol_type: t.chunk.symbol_type,
      start_line: t.chunk.start_line,
      end_line: t.chunk.end_line,
      reason: `Implements ${t.chunk.symbol_name} (${t.chunk.symbol_type}) in ${t.chunk.file_path}`,
    }));

    const primaryChunk = top[0]?.chunk;
    const answer = primaryChunk
      ? `Based on the retrieved repository code, this functionality is primarily implemented in \`${primaryChunk.file_path}\` within the symbol \`${primaryChunk.symbol_name}\` (${primaryChunk.symbol_type}), spanning lines ${primaryChunk.start_line}–${primaryChunk.end_line}.`
      : 'There is not enough evidence in the indexed codebase.';

    const steps = top.map((t, idx) => {
      return `${idx + 1}. \`${t.chunk.symbol_name}\` in \`${t.chunk.file_path}\` (lines ${t.chunk.start_line}–${t.chunk.end_line}) handles ${t.chunk.symbol_type} logic.`;
    });

    return {
      answer,
      relevant_files: files,
      relevant_functions: symbols,
      how_it_works: steps,
      source_references: references,
      retrieved_chunks: chunkPreviews,
      query,
      latency_ms: Date.now() - startTime,
    };
  }
}
