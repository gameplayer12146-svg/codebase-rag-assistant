import { ArchitectureGraph, ArchitectureNode, ArchitectureEdge, CodeSymbol } from '../src/types';

export function buildArchitectureGraph(
  files: { path: string; content: string }[],
  symbols: CodeSymbol[]
): ArchitectureGraph {
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];

  // Limit to top 50 most relevant files to keep visualization clean and fast
  const targetFiles = files.slice(0, 50);
  const fileLookup = new Map<string, string>(); // basename -> fullPath

  // 1. Create file/module nodes
  for (const f of targetFiles) {
    const symbolsInFile = symbols
      .filter(s => s.file_path === f.path)
      .slice(0, 8)
      .map(s => s.symbol_name);

    let type: ArchitectureNode['type'] = 'module';
    const lower = f.path.toLowerCase();
    if (lower.includes('auth') || lower.includes('login') || lower.includes('session')) {
      type = 'service';
    } else if (lower.includes('db') || lower.includes('database') || lower.includes('model') || lower.includes('schema')) {
      type = 'database';
    } else if (lower.includes('main') || lower.includes('server') || lower.includes('router') || lower.includes('api') || lower.includes('controller')) {
      type = 'router';
    } else if (lower.includes('service') || lower.includes('util') || lower.includes('helper')) {
      type = 'service';
    }

    const node: ArchitectureNode = {
      id: f.path,
      name: f.path.split('/').pop() || f.path,
      type,
      filePath: f.path,
      symbols: symbolsInFile,
    };

    nodes.push(node);

    // Register by base name without extension
    const baseName = (f.path.split('/').pop() || '').replace(/\.[^/.]+$/, '').toLowerCase();
    if (baseName) {
      fileLookup.set(baseName, f.path);
    }
  }

  // 2. Extract import relationships fast (only inspect import lines)
  const existingEdgeSet = new Set<string>();

  for (const f of targetFiles) {
    const lines = f.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Fast check: only process lines that look like imports
      const isImport =
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.includes('require(') ||
        trimmed.startsWith('use ') ||
        trimmed.startsWith('include ');

      if (!isImport) continue;

      // Check if any target file's base name appears in this import line
      for (const [baseName, targetPath] of fileLookup.entries()) {
        if (targetPath === f.path) continue;
        if (baseName.length < 3) continue;

        if (trimmed.toLowerCase().includes(baseName)) {
          const edgeKey = `${f.path}->${targetPath}`;
          if (!existingEdgeSet.has(edgeKey)) {
            existingEdgeSet.add(edgeKey);
            edges.push({
              from: f.path,
              to: targetPath,
              label: 'imports',
              relationship: 'imports',
            });
            if (edges.length >= 60) break; // Cap edges for graph readability
          }
        }
      }

      if (edges.length >= 60) break;
    }
  }

  return { nodes, edges };
}

