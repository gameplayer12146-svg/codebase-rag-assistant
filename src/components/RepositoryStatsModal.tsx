import React from 'react';
import {
  X,
  BarChart3,
  CheckCircle2,
  FileCode,
  Layers,
  Binary,
  Database,
  Cpu,
  ShieldCheck,
} from 'lucide-react';
import { RepositoryMetadata } from '../types';

interface RepositoryStatsModalProps {
  repo: RepositoryMetadata | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RepositoryStatsModal: React.FC<RepositoryStatsModalProps> = ({
  repo,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !repo) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-100">Repository Analysis & Indexing Metrics</h3>
              <p className="text-xs text-neutral-400">{repo.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-200 rounded-lg hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* Key Metric Numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-neutral-950/80 border border-neutral-800 p-3 rounded-xl">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Source Files</div>
              <div className="text-xl font-bold text-neutral-100 mt-1">{repo.source_files}</div>
              <div className="text-[10px] text-neutral-400 font-mono mt-0.5">{repo.total_files} total files</div>
            </div>

            <div className="bg-neutral-950/80 border border-neutral-800 p-3 rounded-xl">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Functions</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{repo.functions_count}</div>
              <div className="text-[10px] text-neutral-400 font-mono mt-0.5">AST Parsed</div>
            </div>

            <div className="bg-neutral-950/80 border border-neutral-800 p-3 rounded-xl">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Classes</div>
              <div className="text-xl font-bold text-blue-400 mt-1">{repo.classes_count}</div>
              <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Declarations</div>
            </div>

            <div className="bg-neutral-950/80 border border-neutral-800 p-3 rounded-xl">
              <div className="text-[11px] font-mono text-neutral-400 uppercase">Code Chunks</div>
              <div className="text-xl font-bold text-purple-400 mt-1">{repo.chunks_count}</div>
              <div className="text-[10px] text-neutral-400 font-mono mt-0.5">Context-aware</div>
            </div>
          </div>

          {/* Language Breakdown */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Language Composition
            </div>
            <div className="space-y-2 bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl">
              {Object.entries(repo.languages).map(([lang, pct]) => (
                <div key={lang} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="capitalize text-neutral-200">{lang}</span>
                    <span className="text-emerald-400">{pct}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vector Pipeline Status */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              RAG Pipeline Subsystem Status
            </div>
            <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl divide-y divide-neutral-800/80">
              <div className="p-3 flex items-center justify-between text-xs">
                <span className="text-neutral-300 flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  Code-Aware AST Parser
                </span>
                <span className="text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active & Parsed
                </span>
              </div>

              <div className="p-3 flex items-center justify-between text-xs">
                <span className="text-neutral-300 flex items-center gap-2">
                  <Binary className="w-4 h-4 text-teal-400" />
                  Gemini Embedding Generation
                </span>
                <span className="text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> gemini-embedding-2-preview
                </span>
              </div>

              <div className="p-3 flex items-center justify-between text-xs">
                <span className="text-neutral-300 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  Vector Database
                </span>
                <span className="text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Chroma Isolated Partition
                </span>
              </div>

              <div className="p-3 flex items-center justify-between text-xs">
                <span className="text-neutral-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  Repository Partition Isolation
                </span>
                <span className="text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enforced (No Cross-Repo Bleed)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
