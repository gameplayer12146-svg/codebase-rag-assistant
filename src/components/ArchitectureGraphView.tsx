import React, { useState } from 'react';
import { ArchitectureGraph, ArchitectureNode, ArchitectureEdge } from '../types';
import { Layers, Database, Globe, Cpu, ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';

interface ArchitectureGraphViewProps {
  graph: ArchitectureGraph | null;
  onSelectFile: (filePath: string) => void;
  repoName: string;
}

export const ArchitectureGraphView: React.FC<ArchitectureGraphViewProps> = ({
  graph,
  onSelectFile,
  repoName,
}) => {
  const [selectedNode, setSelectedNode] = useState<ArchitectureNode | null>(null);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-neutral-950 text-neutral-500 text-xs p-6 space-y-2">
        <Layers className="w-8 h-8 text-neutral-700" />
        <p className="font-semibold text-neutral-400">Architecture graph generating</p>
        <p>No dependency relationships extracted yet for this repository.</p>
      </div>
    );
  }

  // Calculate layout coordinates for nodes in a clean pipeline layout
  const getNodeColor = (type: ArchitectureNode['type']) => {
    switch (type) {
      case 'router':
        return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' };
      case 'service':
        return { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' };
      case 'database':
        return { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' };
      default:
        return { bg: 'bg-purple-500/10', border: 'border-purple-500/40', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300' };
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-950 text-neutral-200 select-none overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-sm text-neutral-100">Architecture & Dependency View</h2>
            <span className="text-[11px] font-mono bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">
              {repoName}
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Structural relationship diagram mapping imports, function invocations, and database queries.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Router / API
          </span>
          <span className="flex items-center gap-1 text-blue-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-400" /> Service
          </span>
          <span className="flex items-center gap-1 text-amber-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Database
          </span>
        </div>
      </div>

      {/* Main Graph Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Nodes Visual Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {graph.nodes.map(node => {
              const style = getNodeColor(node.type);
              const isSelected = selectedNode?.id === node.id;
              const outgoing = graph.edges.filter(e => e.from === node.id);
              const incoming = graph.edges.filter(e => e.to === node.id);

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${style.bg} ${
                    isSelected
                      ? `${style.border} ring-2 ring-emerald-500/50 shadow-lg`
                      : 'border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="font-mono font-bold text-sm text-neutral-200">
                      {node.name}
                    </div>
                    <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${style.badge}`}>
                      {node.type}
                    </span>
                  </div>

                  <div className="text-[11px] text-neutral-400 font-mono mt-1 truncate">
                    {node.filePath}
                  </div>

                  {/* Symbols preview */}
                  {node.symbols.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-neutral-800/60">
                      <div className="text-[10px] font-mono text-neutral-400 mb-1">
                        Exported Symbols ({node.symbols.length}):
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {node.symbols.slice(0, 4).map((s, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 border border-neutral-800"
                          >
                            {s}()
                          </span>
                        ))}
                        {node.symbols.length > 4 && (
                          <span className="text-[10px] text-neutral-400">+{node.symbols.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Relationship counts */}
                  <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-2 border-t border-neutral-800/60">
                    <span>Calls {outgoing.length} files</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFile(node.filePath);
                      }}
                      className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      Inspect Source <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Relationship Edge Table */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
            <h3 className="font-semibold text-xs text-neutral-300 uppercase tracking-wider mb-3">
              Direct Invocations & Import Table ({graph.edges.length} connections)
            </h3>
            <div className="divide-y divide-neutral-800/60 font-mono text-xs">
              {graph.edges.map((edge, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-neutral-300">
                    <span className="text-emerald-400 font-medium">{edge.from.split('/').pop()}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-500" />
                    <span className="text-blue-400 font-medium">{edge.to.split('/').pop()}</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-neutral-950 text-neutral-400 border border-neutral-800">
                    {edge.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Node Detail Sidebar */}
        {selectedNode && (
          <div className="w-full md:w-80 bg-neutral-900 border-t md:border-t-0 md:border-l border-neutral-800 p-5 space-y-4 overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-sm text-neutral-100">{selectedNode.name}</h3>
                <span className="text-xs text-neutral-400 font-mono">{selectedNode.filePath}</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-neutral-500 hover:text-neutral-300 text-xs"
              >
                Close
              </button>
            </div>

            <button
              onClick={() => onSelectFile(selectedNode.filePath)}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              Open In Monaco Editor <ExternalLink className="w-3.5 h-3.5" />
            </button>

            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Dependencies (Outward)
              </div>
              <div className="space-y-1">
                {graph.edges
                  .filter(e => e.from === selectedNode.id)
                  .map((e, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectFile(e.to)}
                      className="text-xs p-2 bg-neutral-950 rounded border border-neutral-800 hover:border-emerald-500/50 cursor-pointer font-mono text-neutral-300 truncate"
                    >
                      &rarr; {e.to} ({e.label})
                    </div>
                  ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-800">
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Referenced By (Inward)
              </div>
              <div className="space-y-1">
                {graph.edges
                  .filter(e => e.to === selectedNode.id)
                  .map((e, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectFile(e.from)}
                      className="text-xs p-2 bg-neutral-950 rounded border border-neutral-800 hover:border-emerald-500/50 cursor-pointer font-mono text-neutral-300 truncate"
                    >
                      &larr; {e.from} ({e.label})
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
