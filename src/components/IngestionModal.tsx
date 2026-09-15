import React, { useState } from 'react';
import {
  X,
  FolderGit2,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { RepositoryMetadata } from '../types';

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode: 'git' | 'zip';
  onIngestComplete: (repo: RepositoryMetadata) => void;
}

// Safely parse API responses and gracefully handle HTML/proxy error pages
async function safeReadJson<T = any>(resp: Response, fallbackError: string): Promise<T> {
  const text = await resp.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Response is NOT valid JSON (e.g. HTML or gateway error)
    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error('Repository or endpoint resource was not found (404). Please verify the GitHub URL or repository name, or try uploading the codebase directly as a ZIP archive.');
      }
      if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        throw new Error('The service is momentarily busy or restarting. Please try again in a few seconds.');
      }
      if (resp.status === 413) {
        throw new Error('The file exceeds the maximum allowed upload limit. Please upload a smaller repository archive.');
      }
      if (text.includes('<html') || text.startsWith('The page') || text.includes('Error')) {
        throw new Error(
          `Unable to complete repository ingestion (${resp.status} ${resp.statusText || 'Error'}). Please check the repository URL or try uploading as a ZIP file.`
        );
      }
      throw new Error(text.slice(0, 160) || `${fallbackError} (HTTP ${resp.status})`);
    }
    throw new Error('Received unexpected non-JSON response from server.');
  }

  if (!resp.ok) {
    throw new Error(parsed?.error || parsed?.message || `${fallbackError} (HTTP ${resp.status})`);
  }

  return parsed as T;
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  defaultMode,
  onIngestComplete,
}) => {
  const [mode, setMode] = useState<'git' | 'zip'>(defaultMode);
  const [gitUrl, setGitUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real pipeline progress tracker
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  if (!isOpen) return null;

  const handleGitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gitUrl.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setCurrentStage('Connecting to repository & downloading files...');
    setProgressPercent(20);

    try {
      const resp = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: gitUrl.trim() }),
      });

      const repo = await safeReadJson<RepositoryMetadata>(resp, 'Failed to ingest repository');
      trackIndexing(repo.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to ingest repository');
      setIsSubmitting(false);
    }
  };

  const handleZipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    setError(null);
    setCurrentStage('Uploading and unpacking ZIP archive...');
    setProgressPercent(25);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/repositories/upload', {
        method: 'POST',
        body: formData,
      });

      const repo = await safeReadJson<RepositoryMetadata>(resp, 'Failed to upload ZIP archive');
      trackIndexing(repo.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload ZIP archive');
      setIsSubmitting(false);
    }
  };

  const trackIndexing = (repoId: string) => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/repositories/${repoId}`);
        if (resp.ok) {
          const text = await resp.text();
          let data: RepositoryMetadata;
          try {
            data = JSON.parse(text);
          } catch {
            return; // Skip transient non-JSON poll
          }

          if (data.progress) {
            setCurrentStage(data.progress.message);
            setProgressPercent(data.progress.percent);
          }

          if (data.indexing_status === 'ready') {
            clearInterval(interval);
            setIsSubmitting(false);
            onIngestComplete(data);
            onClose();
          } else if (data.indexing_status === 'failed') {
            clearInterval(interval);
            setError(data.progress?.error || 'Indexing failed');
            setIsSubmitting(false);
          }
        }
      } catch {
        // continue polling
      }
    }, 800);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (droppedFile.name.endsWith('.zip')) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('Please drop a valid .zip file archive.');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              {mode === 'git' ? <FolderGit2 className="w-4 h-4" /> : <UploadCloud className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-100">Add Repository to RAG</h3>
              <p className="text-xs text-neutral-400">Clone from Git or upload a project archive</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="grid grid-cols-2 p-3 gap-2 bg-neutral-950/60 border-b border-neutral-800">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setMode('git')}
            className={`py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
              mode === 'git'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            Git URL
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setMode('zip')}
            className={`py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
              mode === 'zip'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            ZIP Upload
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isSubmitting ? (
            <div className="space-y-4 py-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center animate-pulse">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h4 className="font-semibold text-sm text-neutral-200">{currentStage}</h4>
                <p className="text-xs text-neutral-400 mt-1">
                  Parsing symbols, generating embeddings, and indexing vector database...
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-neutral-950 rounded-full h-2 overflow-hidden border border-neutral-800">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="text-[11px] font-mono text-neutral-500 text-right">
                {progressPercent}% completed
              </div>
            </div>
          ) : mode === 'git' ? (
            <form onSubmit={handleGitSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  GitHub / Git Repository URL or Owner/Repo
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/expressjs/express or pallets/flask"
                  value={gitUrl}
                  onChange={e => setGitUrl(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <div className="flex items-center gap-1.5 pt-1 text-[11px] text-neutral-400">
                  <span>Quick try:</span>
                  {['expressjs/express', 'pallets/flask', 'tiangolo/fastapi'].map(example => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setGitUrl(`https://github.com/${example}`)}
                      className="text-emerald-400 hover:text-emerald-300 underline font-mono text-[10px]"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-500">
                  Public Git repositories will be cloned and code-aware parsed automatically.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-xs transition-colors shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5"
              >
                <span>Clone & Index Codebase</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleZipSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300">
                  Upload Codebase ZIP Archive
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-emerald-400 bg-emerald-500/10'
                      : 'border-neutral-800 hover:border-emerald-500/50 bg-neutral-950/60'
                  }`}
                >
                  <input
                    type="file"
                    accept=".zip"
                    onChange={e => {
                      if (e.target.files?.[0]) {
                        setFile(e.target.files[0]);
                        setError(null);
                      }
                    }}
                    className="hidden"
                    id="zip-file-input"
                  />
                  <label htmlFor="zip-file-input" className="cursor-pointer space-y-2 block">
                    <UploadCloud className={`w-8 h-8 mx-auto ${isDragging ? 'text-emerald-400' : 'text-neutral-500'}`} />
                    <div className="text-xs text-neutral-300 font-medium">
                      {file ? file.name : isDragging ? 'Drop the ZIP archive here' : 'Click to select or drop ZIP file here'}
                    </div>
                    {file ? (
                      <div className="text-[11px] text-emerald-400 font-mono">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB selected
                      </div>
                    ) : (
                      <div className="text-[11px] text-neutral-500">
                        Supports .zip archives containing Python, TypeScript, Go, Java, or C/C++ source code (up to 50MB)
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={!file}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium rounded-xl text-xs transition-colors shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5"
              >
                <span>Upload & Index Archive</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
