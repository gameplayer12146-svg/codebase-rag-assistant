import { RetrievedChunk } from '../src/types';
import { IEmbeddingService } from './embeddings';
import { IVectorStore } from './vectorstore';

export interface RetrievalOptions {
  topK?: number;
  minSimilarity?: number;
  useHybridRanking?: boolean;
}

export class SemanticRetriever {
  constructor(
    private embeddingService: IEmbeddingService,
    private vectorStore: IVectorStore
  ) {}

  async retrieve(
    repositoryId: string,
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievedChunk[]> {
    const topK = options.topK || 10;
    const minSimilarity = options.minSimilarity ?? 0.05;
    const useHybrid = options.useHybridRanking !== false;

    // 1. Generate query embedding
    const queryEmbedding = await this.embeddingService.embedQuery(query);

    // 2. Vector search (strictly filtered by repositoryId)
    const candidates = await this.vectorStore.search(
      repositoryId,
      queryEmbedding,
      Math.max(topK * 2, 15),
      minSimilarity
    );

    if (!useHybrid || candidates.length === 0) {
      return candidates.slice(0, topK);
    }

    // 3. Hybrid search: calculate lexical/keyword match for symbol and file paths
    const queryTerms = query
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);

    const reranked = candidates.map(item => {
      const c = item.chunk;
      const haystack = `${c.file_path} ${c.symbol_name} ${c.symbol_type} ${c.code}`.toLowerCase();
      let matchedTerms = 0;

      for (const term of queryTerms) {
        // Boost symbol exact match
        if (c.symbol_name.toLowerCase().includes(term)) {
          matchedTerms += 2.0;
        } else if (c.file_path.toLowerCase().includes(term)) {
          matchedTerms += 1.5;
        } else if (haystack.includes(term)) {
          matchedTerms += 0.5;
        }
      }

      const keywordScore = queryTerms.length > 0 ? Math.min(1, matchedTerms / (queryTerms.length * 1.5)) : 0;
      // Hybrid combined score: 70% vector semantic similarity + 30% lexical match
      const combinedScore = Number((item.similarity * 0.7 + keywordScore * 0.3).toFixed(4));

      return {
        ...item,
        keywordScore: Number(keywordScore.toFixed(3)),
        combinedScore,
      };
    });

    // Sort by combined score descending
    reranked.sort((a, b) => b.combinedScore - a.combinedScore);

    return reranked.slice(0, topK);
  }
}
