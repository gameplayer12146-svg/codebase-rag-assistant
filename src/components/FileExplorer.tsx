import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode,
  ChevronRight,
  ChevronDown,
  Search,
  FileText,
  Boxes,
} from 'lucide-react';
import { FileTreeNode } from '../types';

interface FileExplorerProps {
  tree: FileTreeNode[];
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
  repoName: string;
}

const TreeNodeItem: React.FC<{
  node: FileTreeNode;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
}> = ({ node, depth, selectedFilePath, onSelectFile }) => {
  const [isOpen, setIsOpen] = useState(depth < 2); // Auto-expand top levels

  const isDirectory = node.type === 'directory';
  const isSelected = node.path === selectedFilePath;

  const handleClick = () => {
    if (isDirectory) {
      setIsOpen(!isOpen);
    } else {
      onSelectFile(node.path);
    }
  };

  const getLanguageColor = (lang?: string) => {
    switch (lang) {
      case 'python':
        return 'text-blue-400';
      case 'typescript':
        return 'text-sky-400';
      case 'javascript':
        return 'text-yellow-400';
      case 'go':
        return 'text-cyan-400';
      case 'java':
        return 'text-amber-500';
      default:
        return 'text-neutral-400';
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
        className={`flex items-center gap-2 py-1.5 pr-3 text-xs cursor-pointer select-none transition-colors group ${
          isSelected
            ? 'bg-neutral-800 text-white font-medium border-l-2 border-emerald-500'
            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
        }`}
      >
        {isDirectory ? (
          <>
            <span className="text-neutral-500 group-hover:text-neutral-300">
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <span className="text-amber-400">
              {isOpen ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
            </span>
            <span className="truncate font-medium">{node.name}</span>
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <span className={getLanguageColor(node.language)}>
              <FileCode className="w-3.5 h-3.5" />
            </span>
            <span className="truncate flex-1">{node.name}</span>
            {node.symbolCount !== undefined && node.symbolCount > 0 && (
              <span className="text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.2 rounded font-mono">
                {node.symbolCount}
              </span>
            )}
          </>
        )}
      </div>

      {isDirectory && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileExplorer: React.FC<FileExplorerProps> = ({
  tree,
  selectedFilePath,
  onSelectFile,
  repoName,
}) => {
  const [filterText, setFilterText] = useState('');

  // Recursive search filter
  const filterTree = (nodes: FileTreeNode[], query: string): FileTreeNode[] => {
    if (!query) return nodes;
    const lower = query.toLowerCase();

    return nodes.reduce<FileTreeNode[]>((acc, node) => {
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
          acc.push(node);
        }
      } else if (node.type === 'directory' && node.children) {
        const filteredChildren = filterTree(node.children, query);
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(lower)) {
          acc.push({
            ...node,
            children: filteredChildren,
          });
        }
      }
      return acc;
    }, []);
  };

  const filtered = filterTree(tree, filterText);

  return (
    <div className="h-full flex flex-col bg-neutral-900 border-r border-neutral-800 select-none">
      {/* Explorer Header */}
      <div className="p-3 border-b border-neutral-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            <Boxes className="w-3.5 h-3.5 text-emerald-400" />
            <span>Files & Symbols</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400 truncate max-w-[110px]" title={repoName}>
            {repoName}
          </span>
        </div>

        {/* Search filter input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-md pl-8 pr-2.5 py-1 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-neutral-400">
            No matching files found
          </div>
        ) : (
          filtered.map(node => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              selectedFilePath={selectedFilePath}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  );
};
