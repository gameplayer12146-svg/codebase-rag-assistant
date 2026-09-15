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
        throw new Error(
          'The repository could not be located or is private. Please check the URL spelling, ensure the repository is public, or upload it as a ZIP file.'
        );
      }
      if (resp.status === 502 || resp.status === 503 || resp.status === 504) {
        throw new Error('The indexing service is briefly restarting or busy. Please retry in a few moments.');
      }
      if (resp.status === 413) {
        throw new Error('The archive exceeds the maximum upload limit (50MB). Please select a smaller codebase archive.');
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
  const pollTimerRef = React.useRef<any>(null);

  // Clear polling timer on unmount or close
  React.useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Reset states whenever modal opens or defaultMode changes
  React.useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
      setError(null);
      setIsSubmitting(false);
      setCurrentStage(null);
      setProgressPercent(0);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [isOpen, defaultMode]);

  if (!isOpen) return null;

  const handleModeChange = (newMode: 'git' | 'zip') => {
    if (isSubmitting) return;
    setMode(newMode);
    setError(null); // Clear previous tab's error
  };

  const handleGitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = gitUrl.trim();
    if (!targetUrl) return;

    setIsSubmitting(true);
    setError(null);
    setCurrentStage('Connecting to repository & downloading files...');
    setProgressPercent(20);

    try {
      const resp = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: targetUrl }),
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

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Please select a valid .zip file archive.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError(`Archive exceeds the 50MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please choose a smaller archive.`);
      return;
    }

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
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = setInterval(async () => {
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
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setIsSubmitting(false);
            onIngestComplete(data);
            onClose();
          } else if (data.indexing_status === 'failed') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
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
      if (!droppedFile.name.toLowerCase().endsWith('.zip')) {
        setError('Please drop a valid .zip file archive.');
        return;
      }
      if (droppedFile.size > 50 * 1024 * 1024) {
        setError(`Archive exceeds the 50MB limit (${(droppedFile.size / (1024 * 1024)).toFixed(1)}MB). Please choose a smaller archive.`);
        return;
      }
      setFile(droppedFile);
      setError(null);
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
            onClick={() => handleModeChange('git')}
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
            onClick={() => handleModeChange('zip')}
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
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-400/70 hover:text-red-300 p-0.5 rounded transition-colors"
                title="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
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
                  placeholder="https://github.com/expressjs/express or owner/repo"
                  value={gitUrl}
                  onChange={e => {
                    setGitUrl(e.target.value);
                    if (error) setError(null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-neutral-400">
                  <span>Quick try:</span>
                  {[
                    'gameplayer12146-svg/codebase-rag-assistant',
                    'expressjs/express',
                    'pallets/flask',
                    'tiangolo/fastapi',
                    'iam-veeramalla/Docker-Zero-to-Hero',
                  ].map(example => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => {
                        setGitUrl(`https://github.com/${example}`);
                        if (error) setError(null);
                      }}
                      className="text-emerald-400 hover:text-emerald-300 underline font-mono text-[10px]"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-500">
                  Works with GitHub, GitLab, Bitbucket, and any public Git repository URL or <span className="font-mono text-neutral-400">owner/repo</span> format.
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
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-neutral-300">
                    Upload Codebase ZIP Archive
                  </label>
                  {file && (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (error) setError(null);
                      }}
                      className="text-[11px] text-neutral-400 hover:text-red-400 underline"
                    >
                      Remove file
                    </button>
                  )}
                </div>
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
                        const selected = e.target.files[0];
                        if (!selected.name.toLowerCase().endsWith('.zip')) {
                          setError('Please select a valid .zip file archive.');
                          return;
                        }
                        if (selected.size > 50 * 1024 * 1024) {
                          setError(`Archive exceeds the 50MB limit (${(selected.size / (1024 * 1024)).toFixed(1)}MB).`);
                          return;
                        }
                        setFile(selected);
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
