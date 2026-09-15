import path from 'path';

export const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.github',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.venv',
  'venv',
  'env',
  'target',
  'vendor',
  '.idea',
  '.vscode',
  'bin',
  'obj',
  '.turbo',
  '.cache',
  'tmp',
]);

export const IGNORED_EXTENSIONS = new Set([
  // Images & media
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.mp4', '.mp3', '.wav', '.mov',
  // Binaries & archives
  '.exe', '.dll', '.so', '.dylib', '.bin', '.zip', '.tar', '.gz', '.7z', '.rar', '.pdf', '.class', '.pyc', '.o',
  // Minified or map
  '.min.js', '.min.css', '.map',
  // Secrets & local environment
  '.pem', '.key', '.crt', '.p12', '.keystore',
  // Lockfiles & databases
  '.db', '.sqlite', '.sqlite3'
]);

export const IGNORED_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'poetry.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'credentials.json',
  '.DS_Store',
  'Thumbs.db'
]);

export const SUPPORTED_EXTENSIONS: Record<string, string> = {
  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.ipynb': 'python',
  // TypeScript & JavaScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Systems & compiled
  '.go': 'go',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.scala': 'scala',
  '.dart': 'dart',
  // Scripting & shells
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.php': 'php',
  '.lua': 'lua',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  // Web & UI
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.sass': 'css',
  '.less': 'css',
  // Documentation & text
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.mdown': 'markdown',
  '.mdx': 'markdown',
  '.txt': 'text',
  '.rst': 'text',
  // Config & Data schemas
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.xml': 'xml',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.prisma': 'prisma',
};

export const SPECIAL_FILENAMES: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'containerfile': 'dockerfile',
  'makefile': 'makefile',
  'jenkinsfile': 'jenkinsfile',
  'procfile': 'procfile',
  'gemfile': 'ruby',
  'rakefile': 'ruby',
  'vagrantfile': 'ruby',
  'readme': 'markdown',
  'license': 'text',
  'contributing': 'markdown',
  'changelog': 'markdown',
};

export interface FilterResult {
  isSupported: boolean;
  isIgnored: boolean;
  language?: string;
  reason?: string;
}

export function filterFile(filePath: string, fileSize?: number): FilterResult {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1];
  const lowerName = fileName.toLowerCase();
  const ext = path.extname(fileName).toLowerCase();

  // Check ignored directories
  for (const part of parts.slice(0, -1)) {
    if (IGNORED_DIRECTORIES.has(part)) {
      return { isSupported: false, isIgnored: true, reason: `Directory '${part}' is ignored` };
    }
  }

  // Check specific ignored filenames
  if (IGNORED_FILENAMES.has(fileName)) {
    return { isSupported: false, isIgnored: true, reason: `File '${fileName}' is excluded` };
  }

  // Check ignored extensions
  if (IGNORED_EXTENSIONS.has(ext)) {
    return { isSupported: false, isIgnored: true, reason: `Extension '${ext}' is ignored` };
  }

  // Check minified filenames
  if (fileName.endsWith('.min.js') || fileName.endsWith('.min.css')) {
    return { isSupported: false, isIgnored: true, reason: 'Minified file' };
  }

  // Check size: skip files larger than 1.5MB to prevent memory exhaustion
  if (fileSize && fileSize > 1.5 * 1024 * 1024) {
    return { isSupported: false, isIgnored: true, reason: 'File exceeds 1.5MB limit' };
  }

  // Check special filenames (e.g. Dockerfile, Makefile, README)
  if (SPECIAL_FILENAMES[lowerName]) {
    return {
      isSupported: true,
      isIgnored: false,
      language: SPECIAL_FILENAMES[lowerName],
    };
  }

  if (lowerName.startsWith('dockerfile.')) {
    return { isSupported: true, isIgnored: false, language: 'dockerfile' };
  }

  if (lowerName.startsWith('readme.') && !IGNORED_EXTENSIONS.has(ext)) {
    return { isSupported: true, isIgnored: false, language: 'markdown' };
  }

  // Check supported extension
  if (SUPPORTED_EXTENSIONS[ext]) {
    return {
      isSupported: true,
      isIgnored: false,
      language: SUPPORTED_EXTENSIONS[ext]
    };
  }

  return { isSupported: false, isIgnored: true, reason: `Unsupported extension: ${ext || 'none'}` };
}
