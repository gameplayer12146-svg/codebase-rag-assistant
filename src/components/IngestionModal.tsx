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
    setCurrentStage('Receiving Git repository...');
    setProgressPercent(20);

    try {
      const resp = await fetch('/api/repositories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: gitUrl.trim() }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to ingest repository');
      }

      const repo: RepositoryMetadata = await resp.json();
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
    setCurrentStage('Uploading and extracting ZIP archive...');
    setProgressPercent(25);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/repositories/upload', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to upload ZIP archive');
      }

      const repo: RepositoryMetadata = await resp.json();
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
          const data: RepositoryMetadata = await resp.json();
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
      } catch (err) {
        // continue polling
      }
    }, 800);
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
                  GitHub / Git Repository URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://github.com/tiangolo/fastapi"
                  value={gitUrl}
                  onChange={e => setGitUrl(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500"
                />
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
                <div className="border-2 border-dashed border-neutral-800 hover:border-emerald-500/50 rounded-xl p-6 text-center cursor-pointer bg-neutral-950/60 transition-colors">
                  <input
                    type="file"
                    accept=".zip"
                    required
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="zip-file-input"
                  />
                  <label htmlFor="zip-file-input" className="cursor-pointer space-y-2 block">
                    <UploadCloud className="w-8 h-8 mx-auto text-neutral-500" />
                    <div className="text-xs text-neutral-300 font-medium">
                      {file ? file.name : 'Click to select or drop ZIP file here'}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Supports .zip files containing Python, TypeScript, Go, Java, or C/C++ source code
                    </div>
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
