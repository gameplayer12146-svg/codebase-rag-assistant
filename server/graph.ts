import { ArchitectureGraph, ArchitectureNode, ArchitectureEdge, CodeSymbol } from '../src/types';

export function buildArchitectureGraph(
  files: { path: string; content: string }[],
  symbols: CodeSymbol[]
): ArchitectureGraph {
  const nodes: ArchitectureNode[] = [];
  const edges: ArchitectureEdge[] = [];
  const fileNodeMap = new Map<string, ArchitectureNode>();

  // 1. Create file/module nodes
  for (const f of files) {
    const symbolsInFile = symbols.filter(s => s.file_path === f.path).map(s => s.symbol_name);
    let type: ArchitectureNode['type'] = 'module';

    if (f.path.includes('auth') || f.path.includes('login')) {
      type = 'service';
    } else if (f.path.includes('db') || f.path.includes('database')) {
      type = 'database';
    } else if (f.path.includes('main') || f.path.includes('server') || f.path.includes('router')) {
      type = 'router';
    } else if (f.path.includes('user') || f.path.includes('service')) {
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
    fileNodeMap.set(f.path, node);
  }

  // 2. Extract import relationships and function call relationships
  for (const f of files) {
    const lines = f.content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Check imports: from src.auth.login import ... or import ... from './...'
      for (const targetFile of files) {
        if (targetFile.path === f.path) continue;

        const targetBase = targetFile.path.replace(/\.[^/.]+$/, ''); // remove ext
        const targetParts = targetBase.split('/');
        const targetName = targetParts[targetParts.length - 1];

        // Python import match
        const pyImportMatch = trimmed.includes(targetBase.replace(/\//g, '.')) ||
          (trimmed.startsWith('from ') && trimmed.includes(targetName)) ||
          (trimmed.startsWith('import ') && trimmed.includes(targetName));

        // TS/JS import match
        const tsImportMatch = (trimmed.startsWith('import ') || trimmed.includes('require(')) &&
          (trimmed.includes(`/${targetName}`) || trimmed.includes(`./${targetName}`));

        if (pyImportMatch || tsImportMatch) {
          const edgeId = `${f.path}->${targetFile.path}`;
          if (!edges.some(e => `${e.from}->${e.to}` === edgeId)) {
            edges.push({
              from: f.path,
              to: targetFile.path,
              label: 'imports',
              relationship: 'imports',
            });
          }
        }
      }

      // Check symbol calls: e.g. login_user(...), get_db_connection(...)
      for (const s of symbols) {
        if (s.file_path !== f.path && s.symbol_name.length > 3) {
          const callPattern = new RegExp(`\\b${s.symbol_name}\\s*\\(`, 'g');
          if (callPattern.test(trimmed)) {
            const edgeId = `${f.path}->${s.file_path}`;
            if (!edges.some(e => `${e.from}->${e.to}` === edgeId)) {
              edges.push({
                from: f.path,
                to: s.file_path,
                label: `calls ${s.symbol_name}()`,
                relationship: s.file_path.includes('database') || s.file_path.includes('db') ? 'queries' : 'calls',
              });
            }
          }
        }
      }
    }
  }

  return { nodes, edges };
}
