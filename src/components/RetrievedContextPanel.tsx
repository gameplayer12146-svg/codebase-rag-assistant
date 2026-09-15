import React from 'react';
import { Layers, FileCode, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';
import { RetrievedChunkPreview } from '../types';

interface RetrievedContextPanelProps {
  chunks: RetrievedChunkPreview[];
  onSelectChunk: (filePath: string, startLine: number, endLine: number) => void;
  activeChunkRef?: { filePath: string; startLine: number } | null;
}

export const RetrievedContextPanel: React.FC<RetrievedContextPanelProps> = ({
  chunks,
  onSelectChunk,
  activeChunkRef,
}) => {
  return (
    <div className="h-full flex flex-col bg-neutral-900 border-l border-neutral-800 select-none">
      {/* Header */}
      <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>Retrieved Context ({chunks.length})</span>
        </div>
        <span className="text-[10px] text-neutral-400 font-mono">Chroma Vector Store</span>
      </div>

      {/* Chunks List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {chunks.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-xs text-neutral-400 space-y-2">
            <Layers className="w-6 h-6 text-neutral-700" />
            <p>No chunks retrieved yet.</p>
            <p className="text-neutral-500 text-[11px]">
              Ask a question in the AI panel to inspect the vector retrieval candidates.
            </p>
          </div>
        ) : (
          chunks.map((item, idx) => {
            const isTargeted =
              activeChunkRef?.filePath === item.file_path &&
              activeChunkRef?.startLine === item.start_line;

            return (
              <div
                key={idx}
                onClick={() => onSelectChunk(item.file_path, item.start_line, item.end_line)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                  isTargeted
                    ? 'bg-neutral-800 border-emerald-500/80 shadow-md shadow-emerald-950/40'
                    : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-850'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="truncate font-mono text-xs text-emerald-400 font-medium group-hover:text-emerald-300 flex items-center gap-1">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.symbol_name}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 shrink-0 border border-neutral-700/60">
                    {(item.similarity * 100).toFixed(1)}% match
                  </span>
                </div>

                {/* Path & Line span */}
                <div className="text-[11px] text-neutral-400 font-mono truncate mb-2">
                  {item.file_path} : {item.start_line}-{item.end_line}
                </div>

                {/* Code preview snippet */}
                <div className="bg-neutral-950 rounded-lg p-2 font-mono text-[11px] text-neutral-300 overflow-x-auto max-h-32 border border-neutral-800/60 leading-relaxed scrollbar-thin">
                  <pre>{item.code_preview.slice(0, 240)}{item.code_preview.length > 240 ? '...' : ''}</pre>
                </div>

                {/* Click CTA */}
                <div className="mt-2 flex items-center justify-end text-[10px] text-neutral-400 group-hover:text-emerald-400 transition-colors">
                  <span>View in Editor</span>
                  <ChevronRight className="w-3 h-3 ml-0.5" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
