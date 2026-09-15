import React from 'react';
import {
  Code2,
  FolderGit2,
  UploadCloud,
  Layers,
  Sparkles,
  BarChart3,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import { RepositoryMetadata } from '../types';

interface NavbarProps {
  repositories: RepositoryMetadata[];
  activeRepoId: string | null;
  onSelectRepo: (id: string) => void;
  onOpenConnectModal: () => void;
  onOpenZipModal: () => void;
  onOpenStatsModal: () => void;
  currentView: 'workspace' | 'landing' | 'graph';
  onChangeView: (view: 'workspace' | 'landing' | 'graph') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  repositories,
  activeRepoId,
  onSelectRepo,
  onOpenConnectModal,
  onOpenZipModal,
  onOpenStatsModal,
  currentView,
  onChangeView,
}) => {
  const activeRepo = repositories.find(r => r.id === activeRepoId);

  return (
    <header className="h-14 bg-neutral-900/90 border-b border-neutral-800 backdrop-blur px-4 flex items-center justify-between select-none z-30 sticky top-0">
      {/* Brand & Mode Switcher */}
      <div className="flex items-center gap-6">
        <div
          onClick={() => onChangeView('landing')}
          className="flex items-center gap-2.5 cursor-pointer group"
          id="nav-brand-logo"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-900/20 group-hover:scale-105 transition-transform">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-neutral-100">
                Codebase RAG
              </span>
              <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono hidden sm:block">
              Semantic Search & Analysis
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="hidden md:flex items-center gap-1 bg-neutral-950/60 p-1 rounded-lg border border-neutral-800/80">
          <button
            id="nav-tab-workspace"
            onClick={() => onChangeView('workspace')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              currentView === 'workspace'
                ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Workspace & AI
          </button>
          <button
            id="nav-tab-graph"
            onClick={() => onChangeView('graph')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
              currentView === 'graph'
                ? 'bg-neutral-800 text-neutral-100 shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Architecture Graph
          </button>
        </div>
      </div>

      {/* Repository Selector & Ingestion Actions */}
      <div className="flex items-center gap-2.5">
        {/* Repo Picker Dropdown */}
        {repositories.length > 0 && (
          <div className="flex items-center gap-2 bg-neutral-950/80 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs">
            <span className="text-neutral-500 font-medium">Repo:</span>
            <select
              id="nav-repo-select"
              value={activeRepoId || ''}
              onChange={e => onSelectRepo(e.target.value)}
              aria-label="Select Repository"
              className="bg-transparent text-neutral-200 font-mono text-xs focus:outline-none cursor-pointer pr-1"
            >
              {repositories.map(r => (
                <option key={r.id} value={r.id} className="bg-neutral-900 text-neutral-200">
                  {r.name} ({r.source_files} files)
                </option>
              ))}
            </select>
            {activeRepo && (
              <button
                id="nav-view-stats-btn"
                onClick={onOpenStatsModal}
                title="View Ingestion & Indexing Stats"
                className="text-neutral-400 hover:text-emerald-400 transition-colors ml-1 p-0.5"
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <button
          id="nav-connect-git-btn"
          onClick={onOpenConnectModal}
          className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg border border-neutral-700/60 transition-all flex items-center gap-1.5 shadow-sm"
        >
          <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Connect Repository</span>
          <span className="sm:hidden">Git</span>
        </button>

        <button
          id="nav-upload-zip-btn"
          onClick={onOpenZipModal}
          className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-900/30"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload ZIP</span>
        </button>
      </div>
    </header>
  );
};
