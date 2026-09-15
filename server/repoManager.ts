import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  CodeChunk,
  CodeSymbol,
  FileTreeNode,
  IndexingProgress,
  RepositoryMetadata,
  RagResponse,
  ArchitectureGraph,
} from '../src/types';

const execFileAsync = promisify(execFile);
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

  private extractFilesFromZip(fileBuffer: Buffer): { path: string; content: string; size: number }[] {
    const rawFiles: { path: string; content: string; size: number }[] = [];
    const zip = new AdmZip(fileBuffer);
    const zipEntries = zip.getEntries();

    // Find common root prefix if archive has all files in one folder (e.g. repo-HEAD/ or repo-main/)
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

      if (!entryPath || entryPath.endsWith('/')) continue;

      // Skip ignored directories early
      const parts = entryPath.split('/');
      const isIgnoredDir = parts.some(p =>
        p === '.git' ||
        p === '.github' ||
        p === 'node_modules' ||
        p === '__pycache__' ||
        p === '.next' ||
        p === 'dist' ||
        p === 'build' ||
        p === '.venv' ||
        p === 'venv' ||
        p === 'target'
      );
      if (isIgnoredDir) continue;

      // Limit file size to 500KB per file to avoid event loop stalls
      if (entry.header.size > 500 * 1024) continue;

      try {
        const buf = entry.getData();
        // Check for binary null byte in first 512 bytes
        const checkLen = Math.min(buf.length, 512);
        let isBinary = false;
        for (let b = 0; b < checkLen; b++) {
          if (buf[b] === 0) {
            isBinary = true;
            break;
          }
        }
        if (isBinary) continue;

        const content = buf.toString('utf8');
        rawFiles.push({
          path: entryPath,
          content,
          size: entry.header.size,
        });
      } catch {
        // Skip binary or corrupt entries
      }

      if (rawFiles.length >= 600) break; // Maximum 600 files per repo
    }

    return rawFiles;
  }

  async createFromZip(fileBuffer: Buffer, originalName: string): Promise<RepositoryMetadata> {
    const id = `repo_zip_${Date.now()}`;
    const name = originalName.replace(/\.zip$/i, '') || 'uploaded-repository';

    let rawFiles: { path: string; content: string; size: number }[] = [];

    try {
      rawFiles = this.extractFilesFromZip(fileBuffer);
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

    if (!cleanUrl) {
      throw new Error('Please provide a valid repository URL or owner/repository name.');
    }

    // 1. Normalize and extract git information
    let owner = '';
    let repo = '';
    let branch = '';
    let cloneUrl = '';

    // Strip hash, query, trailing slashes
    let sanitized = cleanUrl.split('?')[0].split('#')[0].replace(/\/+$/, '');

    // Check for branch specified in URL, e.g. /tree/<branch> or /blob/<branch>
    const treeMatch = sanitized.match(/\/(?:tree|blob)\/([^\/]+)(?:\/(.*))?$/);
    if (treeMatch) {
      branch = treeMatch[1];
      sanitized = sanitized.replace(/\/(?:tree|blob)\/[^\/]+(?:\/.*)?$/, '');
    }

    // Strip protocols for matching
    const stripped = sanitized
      .replace(/^https?:\/\//i, '')
      .replace(/^git@github\.com:/i, 'github.com/')
      .replace(/^git@gitlab\.com:/i, 'gitlab.com/')
      .replace(/^git@bitbucket\.org:/i, 'bitbucket.org/')
      .replace(/^git:\/\//i, '');

    const ghMatch = stripped.match(/(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
    const glMatch = stripped.match(/(?:www\.)?gitlab\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
    const bbMatch = stripped.match(/(?:www\.)?bitbucket\.org\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);

    let isGitHub = false;
    if (ghMatch) {
      isGitHub = true;
      owner = ghMatch[1];
      repo = ghMatch[2].replace(/\.git$/, '');
      cloneUrl = `https://github.com/${owner}/${repo}.git`;
    } else if (glMatch) {
      owner = glMatch[1];
      repo = glMatch[2].replace(/\.git$/, '');
      cloneUrl = `https://gitlab.com/${owner}/${repo}.git`;
    } else if (bbMatch) {
      owner = bbMatch[1];
      repo = bbMatch[2].replace(/\.git$/, '');
      cloneUrl = `https://bitbucket.org/${owner}/${repo}.git`;
    } else {
      // Check for shorthand owner/repo (e.g. expressjs/express or pallets/flask)
      const shortMatch = stripped.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
      if (shortMatch) {
        isGitHub = true;
        owner = shortMatch[1];
        repo = shortMatch[2].replace(/\.git$/, '');
        cloneUrl = `https://github.com/${owner}/${repo}.git`;
      } else if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') || cleanUrl.startsWith('git://')) {
        cloneUrl = cleanUrl;
      }
    }

    if (!cloneUrl) {
      throw new Error(
        `Invalid repository format: "${cleanUrl}". Please provide a GitHub URL (e.g. https://github.com/expressjs/express) or owner/repo format.`
      );
    }

    const repoName = owner && repo ? `${owner}-${repo}` : 'git-repository';
    let rawFiles: { path: string; content: string; size: number }[] = [];

    // TIER 1: If it's a GitHub repository, download zip archive directly via HTTP.
    // This is instant (<2s), bypasses git process execution, avoids git authentication prompts,
    // and correctly resolves default branches (HEAD) without branch mismatch failures.
    if (isGitHub && owner && repo) {
      const candidates: string[] = [];
      if (branch) {
        candidates.push(
          `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`,
          `https://codeload.github.com/${owner}/${repo}/zip/${branch}`,
          `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`
        );
      }
      candidates.push(
        `https://codeload.github.com/${owner}/${repo}/zip/HEAD`,
        `https://github.com/${owner}/${repo}/archive/HEAD.zip`,
        `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/main`,
        `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/master`
      );

      for (const candidate of candidates) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 20000);
          const resp = await fetch(candidate, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Codebase-RAG-Assistant' },
          });
          clearTimeout(tid);

          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const extracted = this.extractFilesFromZip(buf);
            if (extracted.length > 0) {
              rawFiles = extracted;
              console.log(`[RepoManager] Successfully ingested ${rawFiles.length} files via GitHub archive from ${candidate}`);
              break;
            }
          }
        } catch (err: any) {
          // Continue to next candidate
        }
      }
    }

    // TIER 2: If HTTP download did not produce files (or for GitLab/Bitbucket/other git URLs),
    // use Git CLI shallow clone with fallback options.
    if (rawFiles.length === 0) {
      const tempDir = path.join(
        os.tmpdir(),
        `rag_repo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      );

      let cloneError: any = null;
      try {
        const gitArgs = ['clone', '--depth', '1'];
        if (branch) {
          gitArgs.push('--branch', branch);
        }
        gitArgs.push(cloneUrl, tempDir);

        try {
          await execFileAsync('git', gitArgs, {
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            timeout: 60000,
          });
        } catch (initialErr: any) {
          // If cloning with specific branch failed, retry without --branch to get default HEAD
          if (branch) {
            console.log(`[RepoManager] Branch '${branch}' clone failed, retrying default branch for ${cloneUrl}...`);
            await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, tempDir], {
              env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
              timeout: 60000,
            });
          } else {
            throw initialErr;
          }
        }

        // Recursively walk tempDir and collect source files
        const walk = (dir: string, rel: string) => {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            if (
              item.name === '.git' ||
              item.name === 'node_modules' ||
              item.name === '__pycache__' ||
              item.name === '.next' ||
              item.name === 'dist' ||
              item.name === 'build' ||
              item.name === '.venv' ||
              item.name === 'venv' ||
              item.name === 'target'
            ) {
              continue;
            }

            const fullPath = path.join(dir, item.name);
            const relPath = rel ? `${rel}/${item.name}` : item.name;

            if (item.isDirectory()) {
              walk(fullPath, relPath);
            } else if (item.isFile()) {
              const stat = fs.statSync(fullPath);
              if (stat.size <= 500 * 1024) {
                try {
                  const content = fs.readFileSync(fullPath, 'utf8');
                  rawFiles.push({
                    path: relPath,
                    content,
                    size: stat.size,
                  });
                } catch {
                  // Skip binary or unreadable file
                }
              }
            }

            if (rawFiles.length >= 600) break;
          }
        };

        walk(tempDir, '');
        console.log(`[RepoManager] Successfully cloned ${rawFiles.length} files from ${cloneUrl}`);
      } catch (err: any) {
        cloneError = err;
        console.warn(`[RepoManager] Git clone failed for ${cloneUrl}:`, err?.message || err);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }

      // TIER 3: If Git clone failed and this is GitLab, try GitLab archive fallback
      if (rawFiles.length === 0 && owner && repo && !isGitHub) {
        const glCandidates = [
          `https://gitlab.com/${owner}/${repo}/-/archive/${branch || 'main'}/${repo}-${branch || 'main'}.zip`,
          `https://gitlab.com/${owner}/${repo}/-/archive/master/${repo}-master.zip`,
        ];
        for (const candidate of glCandidates) {
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 15000);
            const resp = await fetch(candidate, {
              signal: controller.signal,
              headers: { 'User-Agent': 'Codebase-RAG-Assistant' },
            });
            clearTimeout(tid);
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              const extracted = this.extractFilesFromZip(buf);
              if (extracted.length > 0) {
                rawFiles = extracted;
                break;
              }
            }
          } catch {}
        }
      }

      // If still no files, throw informative error
      if (rawFiles.length === 0) {
        const errMsg = ((cloneError?.message || '') + (cloneError?.stderr || '')).toLowerCase();
        if (
          errMsg.includes('not found') ||
          errMsg.includes('could not read username') ||
          errMsg.includes('terminal prompts disabled') ||
          errMsg.includes('repository not found')
        ) {
          throw new Error(
            `Repository "${cleanUrl}" could not be found or is private. Please ensure the repository is public and the link is spelled correctly (or upload it as a ZIP archive).`
          );
        }
        throw new Error(
          `Unable to download repository "${cleanUrl}". Please confirm the repository is public and accessible, or download it and upload directly as a ZIP file.`
        );
      }
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

      // Yield event loop
      await new Promise(r => setImmediate(r));

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

      // Yield event loop
      await new Promise(r => setImmediate(r));

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

      // Fallback: If no chunks produced by symbols, create module chunks for all supported files
      if (chunks.length === 0) {
        for (const file of state.files.values()) {
          if (!file.isSupported || !file.content) continue;
          chunks.push({
            id: `${repoId}_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}_chunk`,
            repository_id: repoId,
            file_path: file.path,
            language: file.language || 'text',
            symbol_name: file.path.split('/').pop() || 'file',
            symbol_type: 'module',
            start_line: 1,
            end_line: file.content.split('\n').length,
            parent_symbol: null,
            code: file.content.slice(0, 4000),
            context_header: `File: ${file.path}\nLanguage: ${file.language || 'text'}\nLines: 1-${file.content.split('\n').length}`,
          });
        }
      }

      state.chunks = chunks;
      state.metadata.chunks_count = chunks.length;

      // Yield event loop
      await new Promise(r => setImmediate(r));

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

      // Yield event loop
      await new Promise(r => setImmediate(r));

      // 5. Store vectors into partitioned vector store
      state.metadata.progress = {
        ...state.metadata.progress!,
        stage: 'vector_indexing',
        message: 'Indexing vectors in Chroma vector database',
        percent: 92,
      };

      await defaultVectorStore.addChunks(repoId, chunks, embeddings);

      // Yield event loop
      await new Promise(r => setImmediate(r));

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
