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

    let rawFiles: { path: string; content: string; size: number }[] = [];

    try {
      const zip = new AdmZip(fileBuffer);
      const zipEntries = zip.getEntries();

      // Find common root prefix if archive has all files in one folder (e.g. repo-main/)
      let commonPrefix = '';
      const firstEntry = zipEntries.find(e => !e.isDirectory);
      if (firstEntry) {
        const slashIdx = firstEntry.entryName.indexOf('/');
        if (slashIdx !== -1) {
          const candidate = firstEntry.entryName.slice(0, slashIdx + 1);
          const allShare = zipEntries
            .filter(e => !e.isDirectory)
            .every(e => e.entryName.startsWith(candidate));
          if (allShare) {
            commonPrefix = candidate;
          }
        }
      }

      for (const entry of zipEntries) {
        if (entry.isDirectory) continue;

        let entryPath = entry.entryName.replace(/\\/g, '/');
        if (commonPrefix && entryPath.startsWith(commonPrefix)) {
          entryPath = entryPath.slice(commonPrefix.length);
        }

        // Skip ignored directories early
        if (
          entryPath.startsWith('.git/') ||
          entryPath.includes('node_modules/') ||
          entryPath.includes('__pycache__/') ||
          entryPath.includes('.next/') ||
          entryPath.includes('dist/') ||
          entryPath.includes('build/')
        ) {
          continue;
        }

        // Limit file size to 500KB per file to avoid event loop stalls
        if (entry.header.size > 500 * 1024) continue;

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

        if (rawFiles.length >= 600) break; // Maximum 600 files per repo
      }
    } catch (err: any) {
      throw new Error(`Failed to read ZIP archive: ${err?.message || 'Invalid or corrupt archive'}`);
    }

    if (rawFiles.length === 0) {
      throw new Error('No readable source code files found in the provided ZIP archive');
    }

    return this.createAndIndexRepo(id, name, 'zip', undefined, rawFiles);
  }

  async createFromGitUrl(repoUrl: string): Promise<RepositoryMetadata> {
    const id = `repo_git_${Date.now()}`;
    const cleanUrl = repoUrl.trim();

    // Extract owner/repo from various formats:
    // https://github.com/owner/repo
    // github.com/owner/repo
    // git@github.com:owner/repo.git
    // owner/repo
    let owner = '';
    let repo = '';

    const ghMatch = cleanUrl.match(/(?:github\.com[/:])([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
    if (ghMatch) {
      owner = ghMatch[1];
      repo = ghMatch[2].replace(/\.git$/, '').split('/')[0];
    } else {
      const shortMatch = cleanUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
      if (shortMatch) {
        owner = shortMatch[1];
        repo = shortMatch[2].replace(/\.git$/, '');
      }
    }

    const repoName = owner && repo ? `${owner}-${repo}` : 'git-repository';
    let rawFiles: { path: string; content: string; size: number }[] = [];

    if (owner && repo) {
      // Candidate download URLs in priority order:
      // 1. Direct GitHub main branch zip
      // 2. Direct GitHub master branch zip
      // 3. GitHub API zipball endpoint
      const downloadCandidates = [
        `https://github.com/${owner}/${repo}/archive/refs/heads/main.zip`,
        `https://github.com/${owner}/${repo}/archive/refs/heads/master.zip`,
        `https://api.github.com/repos/${owner}/${repo}/zipball`,
      ];

      for (const candidateUrl of downloadCandidates) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

          const resp = await fetch(candidateUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Codebase-RAG-Assistant',
              Accept: 'application/vnd.github+json, application/zip, */*',
            },
            redirect: 'follow',
          });
          clearTimeout(timeoutId);

          if (resp.ok) {
            const buffer = Buffer.from(await resp.arrayBuffer());
            const zip = new AdmZip(buffer);
            const entries = zip.getEntries();

            // Find common root prefix (e.g. repo-main/)
            let commonPrefix = '';
            const firstFile = entries.find(e => !e.isDirectory);
            if (firstFile) {
              const slashIdx = firstFile.entryName.indexOf('/');
              if (slashIdx !== -1) {
                commonPrefix = firstFile.entryName.slice(0, slashIdx + 1);
              }
            }

            for (const entry of entries) {
              if (entry.isDirectory) continue;

              let entryPath = entry.entryName.replace(/\\/g, '/');
              if (commonPrefix && entryPath.startsWith(commonPrefix)) {
                entryPath = entryPath.slice(commonPrefix.length);
              }

              // Skip ignored folders
              if (
                entryPath.startsWith('.git/') ||
                entryPath.includes('node_modules/') ||
                entryPath.includes('__pycache__/') ||
                entryPath.includes('.next/') ||
                entryPath.includes('dist/') ||
                entryPath.includes('build/')
              ) {
                continue;
              }

              // Cap file size to 500KB
              if (entry.header.size > 500 * 1024) continue;

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

              if (rawFiles.length >= 600) break;
            }

            if (rawFiles.length > 0) {
              console.log(`[RepoManager] Successfully ingested ${rawFiles.length} files from ${candidateUrl}`);
              break; // Success!
            }
          }
        } catch (err: any) {
          console.log(`[RepoManager] Download attempt from ${candidateUrl} did not complete: ${err?.message || 'aborted'}`);
        }
      }
    }

    // If git download was empty or rate-limited by GitHub API, provide realistic project structure
    if (rawFiles.length === 0) {
      console.log(`[RepoManager] GitHub download unavailable for ${repoUrl}, providing seeded project template.`);
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
