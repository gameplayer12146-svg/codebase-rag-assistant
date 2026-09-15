import { CodeChunk, RetrievedChunk } from '../src/types';

export interface IVectorStore {
  addChunks(repositoryId: string, chunks: CodeChunk[], embeddings: number[][]): Promise<void>;
  search(repositoryId: string, queryEmbedding: number[], topK: number, minSimilarity?: number): Promise<RetrievedChunk[]>;
  getChunks(repositoryId: string): Promise<CodeChunk[]>;
  deleteRepository(repositoryId: string): Promise<void>;
  name: string;
}

// ----------------------------------------------------
// ChromaDB-Compatible Partitioned In-Memory Vector Store
// With Strict Repository Isolation
// ----------------------------------------------------
interface VectorRecord {
  id: string;
  repositoryId: string;
  chunk: CodeChunk;
  embedding: number[];
  norm: number;
}

export class MemoryVectorStore implements IVectorStore {
  name = 'Chroma-Isolated-MemoryStore';
  // Repository ID -> Vector Records
  private repositories = new Map<string, VectorRecord[]>();

  async addChunks(repositoryId: string, chunks: CodeChunk[], embeddings: number[][]): Promise<void> {
    if (!this.repositories.has(repositoryId)) {
      this.repositories.set(repositoryId, []);
    }
    const store = this.repositories.get(repositoryId)!;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const emb = embeddings[i] || [];
      const norm = this.computeNorm(emb);

      store.push({
        id: chunk.id,
        repositoryId,
        chunk,
        embedding: emb,
        norm,
      });
    }
  }

  async search(
    repositoryId: string,
    queryEmbedding: number[],
    topK: number = 10,
    minSimilarity: number = 0.05
  ): Promise<RetrievedChunk[]> {
    const store = this.repositories.get(repositoryId);
    if (!store || store.length === 0) {
      return [];
    }

    const queryNorm = this.computeNorm(queryEmbedding);
    if (queryNorm === 0) return [];

    const scored: { record: VectorRecord; sim: number }[] = [];

    for (const record of store) {
      // STRICT ISOLATION GUARANTEE: Never compare cross-repo
      if (record.repositoryId !== repositoryId) continue;

      const sim = this.cosineSimilarity(queryEmbedding, queryNorm, record.embedding, record.norm);
      if (sim >= minSimilarity) {
        scored.push({ record, sim });
      }
    }

    // Sort descending by similarity
    scored.sort((a, b) => b.sim - a.sim);

    const topResults = scored.slice(0, topK);

    return topResults.map(item => ({
      chunk: item.record.chunk,
      similarity: Number(item.sim.toFixed(4)),
      combinedScore: Number(item.sim.toFixed(4)),
    }));
  }

  async getChunks(repositoryId: string): Promise<CodeChunk[]> {
    const store = this.repositories.get(repositoryId);
    if (!store) return [];
    return store.map(s => s.chunk);
  }

  async deleteRepository(repositoryId: string): Promise<void> {
    this.repositories.delete(repositoryId);
  }

  private computeNorm(vec: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    return Math.sqrt(sum);
  }

  private cosineSimilarity(v1: number[], norm1: number, v2: number[], norm2: number): number {
    if (norm1 === 0 || norm2 === 0) return 0;
    const len = Math.min(v1.length, v2.length);
    let dot = 0;
    for (let i = 0; i < len; i++) {
      dot += v1[i] * v2[i];
    }
    const sim = dot / (norm1 * norm2);
    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, sim));
  }
}

export const defaultVectorStore = new MemoryVectorStore();
