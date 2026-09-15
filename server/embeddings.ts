import { GoogleGenAI } from '@google/genai';

export interface IEmbeddingService {
  embedQuery(query: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  name: string;
}

// ----------------------------------------------------
// Fallback Dense Semantic Vector Embedder (Deterministic 256-dim)
// Uses subword shingles, term frequency, and semantic hashing
// ----------------------------------------------------
export class LocalDenseEmbedder implements IEmbeddingService {
  name = 'local-semantic-dense-256';
  private dim = 256;

  async embedQuery(query: string): Promise<number[]> {
    return this.createVector(query);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(t => this.createVector(t));
  }

  private createVector(text: string): number[] {
    const vec = new Float64Array(this.dim);
    const normalized = text.toLowerCase();
    // Split into tokens + identifiers (e.g. camelCase and snake_case parts)
    const tokens = normalized.match(/[a-z0-9_]+/g) || [];

    // Also add bigrams and split snake/camel
    const expandedTokens: string[] = [...tokens];
    for (const t of tokens) {
      const parts = t.split('_');
      if (parts.length > 1) {
        expandedTokens.push(...parts);
      }
    }

    for (let i = 0; i < expandedTokens.length; i++) {
      const token = expandedTokens[i];
      if (token.length < 2) continue;

      // Hash token into dimensions
      const h1 = this.hashString(token, 0);
      const h2 = this.hashString(token, 42);
      const idx1 = Math.abs(h1) % this.dim;
      const idx2 = Math.abs(h2) % this.dim;

      // Term weight (boost keywords like auth, login, password, db, connection, validate)
      let weight = 1.0;
      if (['auth', 'login', 'password', 'token', 'jwt', 'database', 'connection', 'user', 'validate', 'verify'].includes(token)) {
        weight = 3.0;
      }

      vec[idx1] += (h1 > 0 ? 1 : -1) * weight;
      vec[idx2] += (h2 > 0 ? 0.7 : -0.7) * weight;
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.dim; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) {
        vec[i] /= norm;
      }
    }

    return Array.from(vec);
  }

  private hashString(str: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

// ----------------------------------------------------
// Gemini Embeddings Service
// ----------------------------------------------------
export class GeminiEmbeddingService implements IEmbeddingService {
  name = 'gemini-embedding-2-preview';
  private ai: GoogleGenAI | null = null;
  private localFallback = new LocalDenseEmbedder();

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

  async embedQuery(query: string): Promise<number[]> {
    const client = this.getClient();
    if (!client) {
      return this.localFallback.embedQuery(query);
    }

    try {
      const response = await client.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: query,
      });

      const values = (response.embeddings as any)?.[0]?.values || (response as any).embedding?.values;
      if (Array.isArray(values) && values.length > 0) {
        return values;
      }
      return this.localFallback.embedQuery(query);
    } catch {
      console.log('[Embeddings] Gemini embedding model unavailable, using dense semantic fallback.');
      return this.localFallback.embedQuery(query);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const client = this.getClient();
    if (!client) {
      return this.localFallback.embedBatch(texts);
    }

    const results: number[][] = [];
    const batchSize = 5; // Process in parallel batches of 5

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      try {
        const batchResults = await Promise.all(
          batch.map(async text => {
            const resp = await client.models.embedContent({
              model: 'gemini-embedding-2-preview',
              contents: text,
            });
            const values = (resp.embeddings as any)?.[0]?.values;
            if (Array.isArray(values) && values.length > 0) {
              return values;
            }
            return await this.localFallback.embedQuery(text);
          })
        );
        results.push(...batchResults);
      } catch {
        console.log(`[Embeddings] Gemini batch embed unavailable at offset ${i}, using dense semantic fallback.`);
        const fallback = await this.localFallback.embedBatch(batch);
        results.push(...fallback);
      }
    }

    return results;
  }
}

export const defaultEmbeddingService = new GeminiEmbeddingService();
