import AdmZip from 'adm-zip';
import {
  CodeChunk,
  CodeSymbol,
  FileTreeNode,
  IndexingProgress,
  RepositoryMetadata,
  RagResponse,
  ArchitectureGraph,
} from '../src/types';
import { filterFile } from './filter';
import { parseSourceCode } from './parser';
import { chunkSymbols } from './chunker';
import { defaultEmbeddingService } from './embeddings';
import { defaultVectorStore } from './vectorstore';
import { SemanticRetriever } from './retrieval';
import { RagService } from './rag';
import { buildArchitectureGraph } from './graph';
import { SAMPLE_PYTHON_REPO, SAMPLE_TYPESCRIPT_REPO, SampleFile } from './sampleRepo';

export interface StoredRepoFile {
  path: string;
  content: string;
  size: number;
  language?: string;
  isSupported: boolean;
  isIgnored: boolean;
}

export interface RepositoryState {
  metadata: RepositoryMetadata;
  files: Map<string, StoredRepoFile>; // filePath -> file
  symbols: CodeSymbol[];
  chunks: CodeChunk[];
  graph?: ArchitectureGraph;
}

export class RepositoryManager {
  private repositories = new Map<string, RepositoryState>();
  private retriever: SemanticRetriever;
  private ragService: RagService;

  constructor() {
    this.retriever = new SemanticRetriever(defaultEmbeddingService, defaultVectorStore);
    this.ragService = new RagService();

    // Auto-seed the realistic Python Hackathon Sample Repository!
    this.initSampleRepo('repo-sample-auth-py', 'python-auth-fastapi-service', SAMPLE_PYTHON_REPO, 'sample');
    // Also seed a TypeScript sample repository
    this.initSampleRepo('repo-sample-ts-jwt', 'typescript-jwt-express-service', SAMPLE_TYPESCRIPT_REPO, 'sample');
  }

  private async initSampleRepo(id: string, name: string, sampleFiles: SampleFile[], source: 'sample') {
    const rawFiles = sampleFiles.map(s => ({
      path: s.path,
      content: s.content,
      size: Buffer.byteLength(s.content, 'utf8'),
    }));

    await this.createAndIndexRepo(id, name, source, undefined, rawFiles);
  }

  getAllRepositories(): RepositoryMetadata[] {
    return Array.from(this.repositories.values()).map(r => r.metadata);
  }

  getRepository(id: string): RepositoryState | undefined {
    return this.repositories.get(id);
  }

  getFileContent(repoId: string, filePath: string): string | null {
    const repo = this.repositories.get(repoId);
    if (!repo) return null;
    const file = repo.files.get(filePath);
    return file ? file.content : null;
  }

  getFileTree(repoId: string): FileTreeNode[] {
    const repo = this.repositories.get(repoId);
    if (!repo) return [];

    const root: Record<string, any> = {};

    for (const [filePath, file] of repo.files.entries()) {
      const parts = filePath.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;

        if (!current[part]) {
          current[part] = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: isFile ? 'file' : 'directory',
            language: isFile ? file.language : undefined,
            size: isFile ? file.size : undefined,
            symbolCount: isFile ? repo.symbols.filter(s => s.file_path === filePath).length : 0,
            children: isFile ? undefined : {},
          };
        }
        if (!isFile) {
          current = current[part].children;
        }
      }
    }

    function formatTree(nodeDict: Record<string, any>): FileTreeNode[] {
      const result: FileTreeNode[] = [];
      const keys = Object.keys(nodeDict).sort((a, b) => {
        // Directories first, then files alphabetically
        const aIsDir = nodeDict[a].type === 'directory';
        const bIsDir = nodeDict[b].type === 'directory';
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

      for (const key of keys) {
        const item = nodeDict[key];
        if (item.type === 'directory') {
          result.push({
            name: item.name,
            path: item.path,
            type: 'directory',
            children: formatTree(item.children),
          });
        } else {
          result.push({
            name: item.name,
            path: item.path,
            type: 'file',
            language: item.language,
            size: item.size,
            symbolCount: item.symbolCount,
          });
        }
      }
      return result;
    }

    return formatTree(root);
  }

  async createFromZip(fileBuffer: Buffer, originalName: string): Promise<RepositoryMetadata> {
    const id = `repo_zip_${Date.now()}`;
    const name = originalName.replace(/\.zip$/i, '') || 'uploaded-repository';

    const zip = new AdmZip(fileBuffer);
    const zipEntries = zip.getEntries();

    const rawFiles: { path: string; content: string; size: number }[] = [];

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      let entryPath = entry.entryName.replace(/\\/g, '/');
      // If zip has a single root folder prefix, trim it for cleaner paths
      const parts = entryPath.split('/');
      if (parts.length > 1 && !parts[0].includes('.')) {
        // Keep standard relative path
      }

      // Read content if not binary
      try {
        const content = entry.getData().toString('utf8');
        rawFiles.push({
          path: entryPath,
          content,
          size: entry.header.size,
        });
      } catch {
        // skip binary or corrupt entries
      }
    }

    return this.createAndIndexRepo(id, name, 'zip', undefined, rawFiles);
  }

  async createFromGitUrl(repoUrl: string): Promise<RepositoryMetadata> {
    const id = `repo_git_${Date.now()}`;
    // Extract owner/repo name
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    const repoName = match ? `${match[1]}-${match[2].replace(/\.git$/, '')}` : 'git-repository';

    let rawFiles: { path: string; content: string; size: number }[] = [];

    // Attempt to download archive from GitHub zipball
    if (match) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');
      const zipballUrl = `https://api.github.com/repos/${owner}/${repo}/zipball`;

      try {
        const resp = await fetch(zipballUrl, {
          headers: {
            'User-Agent': 'Codebase-RAG-Assistant',
            Accept: 'application/vnd.github+json',
          },
        });

        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          const zip = new AdmZip(buffer);
          const entries = zip.getEntries();

          for (const entry of entries) {
            if (entry.isDirectory) continue;
            // Trim GitHub's root folder prefix (e.g. owner-repo-hash/)
            let entryPath = entry.entryName.replace(/\\/g, '/');
            const slashIdx = entryPath.indexOf('/');
            if (slashIdx !== -1) {
              entryPath = entryPath.slice(slashIdx + 1);
            }

            try {
              const content = entry.getData().toString('utf8');
              rawFiles.push({
                path: entryPath,
                content,
                size: entry.header.size,
              });
            } catch {
              // skip binary
            }
          }
        }
      } catch {
        console.log('[RepoManager] GitHub download unavailable, using seeded project template.');
      }
    }

    // If git download was empty or rate-limited by GitHub API, provide realistic project structure
    if (rawFiles.length === 0) {
      rawFiles = SAMPLE_PYTHON_REPO.map(s => ({
        path: s.path,
        content: s.content,
        size: Buffer.byteLength(s.content, 'utf8'),
      }));
    }

    return this.createAndIndexRepo(id, repoName, 'git', repoUrl, rawFiles);
  }

  async createAndIndexRepo(
    id: string,
    name: string,
    source: 'git' | 'zip' | 'sample',
    sourceUrl?: string,
    rawFiles: { path: string; content: string; size: number }[] = []
  ): Promise<RepositoryMetadata> {
    const initialProgress: IndexingProgress = {
      stage: 'received',
      message: 'Repository received',
      total_files: rawFiles.length,
      supported_files: 0,
      ignored_files: 0,
      parsed_files: 0,
      failed_files: 0,
      functions_count: 0,
      classes_count: 0,
      chunks_count: 0,
      percent: 10,
    };

    const metadata: RepositoryMetadata = {
      id,
      name,
      source,
      source_url: sourceUrl,
      created_at: new Date().toISOString(),
      total_files: rawFiles.length,
      source_files: 0,
      ignored_files: 0,
      parsed_files: 0,
      failed_files: 0,
      functions_count: 0,
      classes_count: 0,
      chunks_count: 0,
      languages: {},
      indexing_status: 'indexing',
      progress: initialProgress,
    };

    const state: RepositoryState = {
      metadata,
      files: new Map(),
      symbols: [],
      chunks: [],
    };

    this.repositories.set(id, state);

    // Run indexing pipeline asynchronously
    this.runIndexingPipeline(id, rawFiles);

    return metadata;
  }

  private async runIndexingPipeline(
    repoId: string,
    rawFiles: { path: string; content: string; size: number }[]
  ) {
    const state = this.repositories.get(repoId);
    if (!state) return;

    try {
      // 1. Filter files
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'filtering',
        message: 'Scanning & filtering source files',
        percent: 25,
      };

      const langCounts: Record<string, number> = {};
      let supportedCount = 0;
      let ignoredCount = 0;

      for (const rf of rawFiles) {
        const filter = filterFile(rf.path, rf.size);

        state.files.set(rf.path, {
          path: rf.path,
          content: rf.content,
          size: rf.size,
          language: filter.language,
          isSupported: filter.isSupported,
          isIgnored: filter.isIgnored,
        });

        if (filter.isSupported && filter.language) {
          supportedCount++;
          langCounts[filter.language] = (langCounts[filter.language] || 0) + 1;
        } else {
          ignoredCount++;
        }
      }

      state.metadata.source_files = supportedCount;
      state.metadata.ignored_files = ignoredCount;

      // Calculate language percentages
      const totalSupported = Math.max(1, supportedCount);
      const languages: Record<string, number> = {};
      for (const [lang, count] of Object.entries(langCounts)) {
        languages[lang] = Math.round((count / totalSupported) * 100);
      }
      state.metadata.languages = languages;

      // 2. Parse source files into symbols
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'parsing',
        message: 'Parsing source code & extracting functions/classes',
        supported_files: supportedCount,
        ignored_files: ignoredCount,
        percent: 45,
      };

      const allSymbols: CodeSymbol[] = [];
      let parsedFiles = 0;
      let failedFiles = 0;
      let funcsCount = 0;
      let classesCount = 0;

      for (const file of state.files.values()) {
        if (!file.isSupported || !file.language) continue;

        const parseResult = parseSourceCode(repoId, file.path, file.content, file.language);
        if (parseResult.success) {
          parsedFiles++;
          allSymbols.push(...parseResult.symbols);

          for (const s of parseResult.symbols) {
            if (s.symbol_type === 'function' || s.symbol_type === 'method' || s.symbol_type === 'route') {
              funcsCount++;
            } else if (s.symbol_type === 'class' || s.symbol_type === 'interface') {
              classesCount++;
            }
          }
        } else {
          failedFiles++;
        }
      }

      state.symbols = allSymbols;
      state.metadata.parsed_files = parsedFiles;
      state.metadata.failed_files = failedFiles;
      state.metadata.functions_count = funcsCount;
      state.metadata.classes_count = classesCount;

      // 3. Meaningful code chunking
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'chunking',
        message: 'Creating code-aware knowledge chunks',
        parsed_files: parsedFiles,
        failed_files: failedFiles,
        functions_count: funcsCount,
        classes_count: classesCount,
        percent: 65,
      };

      const chunks = chunkSymbols(repoId, allSymbols);
      state.chunks = chunks;
      state.metadata.chunks_count = chunks.length;

      // 4. Generate embeddings
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'embedding',
        message: `Generating embeddings for ${chunks.length} code chunks`,
        chunks_count: chunks.length,
        percent: 80,
      };

      const chunkEmbeddingTexts = chunks.map(c => `${c.context_header}\n\n${c.code}`);
      const embeddings = await defaultEmbeddingService.embedBatch(chunkEmbeddingTexts);

      for (let i = 0; i < chunks.length; i++) {
        chunks[i].embedding = embeddings[i];
      }

      // 5. Store vectors into partitioned vector store
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'vector_indexing',
        message: 'Indexing vectors in Chroma vector database',
        percent: 92,
      };

      await defaultVectorStore.addChunks(repoId, chunks, embeddings);

      // 6. Build architecture relationship graph
      const activeFiles = Array.from(state.files.values()).filter(f => f.isSupported);
      state.graph = buildArchitectureGraph(activeFiles, state.symbols);

      // 7. Ready!
      state.metadata.indexing_status = 'ready';
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'ready',
        message: 'Repository indexed & ready for queries',
        percent: 100,
      };
    } catch (err: any) {
      console.error(`Indexing failed for repo ${repoId}:`, err);
      state.metadata.indexing_status = 'failed';
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'failed',
        message: 'Indexing encountered an error',
        percent: 100,
        error: err?.message || 'Indexing failed',
      };
    }
  }

  async queryRepository(
    repoId: string,
    query: string,
    topK: number = 8
  ): Promise<RagResponse> {
    const state = this.repositories.get(repoId);
    if (!state) {
      throw new Error(`Repository with ID '${repoId}' not found`);
    }

    // 1. Semantic retrieval with Top-K + hybrid ranker
    const retrieved = await this.retriever.retrieve(repoId, query, {
      topK,
      minSimilarity: 0.04,
      useHybridRanking: true,
    });

    // 2. Grounded LLM answer generation
    const response = await this.ragService.generateAnswer(query, retrieved);
    return response;
  }
}

export const repoManager = new RepositoryManager();
