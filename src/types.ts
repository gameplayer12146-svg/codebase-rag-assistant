export type SymbolType =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'route'
  | 'module'
  | 'import_block'
  | 'config';

export interface CodeSymbol {
  id: string;
  repository_id: string;
  file_path: string;
  language: string;
  symbol_type: SymbolType;
  symbol_name: string;
  start_line: number;
  end_line: number;
  code: string;
  parent_symbol?: string | null;
  signature?: string;
  docstring?: string;
}

export interface CodeChunk {
  id: string;
  repository_id: string;
  file_path: string;
  language: string;
  symbol_name: string;
  symbol_type: SymbolType;
  start_line: number;
  end_line: number;
  parent_symbol?: string | null;
  code: string;
  context_header: string;
  embedding?: number[];
}

export interface RetrievedChunk {
  chunk: CodeChunk;
  similarity: number;
  keywordScore?: number;
  combinedScore: number;
}

export interface SourceReference {
  file_path: string;
  symbol_name: string;
  symbol_type?: string;
  start_line: number;
  end_line: number;
  reason?: string;
}

export interface RetrievedChunkPreview {
  file_path: string;
  symbol_name: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
  similarity: number;
  code_preview: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ragResponse?: RagResponse;
  timestamp: string;
}

export interface RagResponse {
  answer: string;
  relevant_files: string[];
  relevant_functions: string[];
  how_it_works: string[];
  source_references: SourceReference[];
  retrieved_chunks: RetrievedChunkPreview[];
  query: string;
  latency_ms: number;
}

export type IndexingStage =
  | 'idle'
  | 'received'
  | 'scanning'
  | 'filtering'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'vector_indexing'
  | 'ready'
  | 'failed';

export interface IndexingProgress {
  stage: IndexingStage;
  message: string;
  total_files: number;
  supported_files: number;
  ignored_files: number;
  parsed_files: number;
  failed_files: number;
  functions_count: number;
  classes_count: number;
  chunks_count: number;
  percent: number;
  error?: string;
}

export interface RepositoryMetadata {
  id: string;
  name: string;
  source: 'git' | 'zip' | 'sample';
  source_url?: string;
  created_at: string;
  total_files: number;
  source_files: number;
  ignored_files: number;
  parsed_files: number;
  failed_files: number;
  functions_count: number;
  classes_count: number;
  chunks_count: number;
  languages: Record<string, number>; // language -> percentage
  indexing_status: 'ready' | 'indexing' | 'failed' | 'idle';
  progress?: IndexingProgress;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  size?: number;
  children?: FileTreeNode[];
  symbolCount?: number;
}

export interface ArchitectureNode {
  id: string;
  name: string;
  type: 'file' | 'service' | 'module' | 'database' | 'router';
  filePath?: string;
  symbols: string[];
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
  relationship: 'imports' | 'calls' | 'queries' | 'routes_to';
}

export interface ArchitectureGraph {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}
