import { CodeSymbol, SymbolType } from '../src/types';

export interface ParsedFileResult {
  filePath: string;
  language: string;
  symbols: CodeSymbol[];
  success: boolean;
  error?: string;
}

export function parseSourceCode(
  repositoryId: string,
  filePath: string,
  code: string,
  language: string
): ParsedFileResult {
  try {
    const symbols: CodeSymbol[] = [];
    const lines = code.split('\n');

    switch (language) {
      case 'python':
        parsePython(repositoryId, filePath, lines, symbols);
        break;
      case 'typescript':
      case 'javascript':
        parseTypeScript(repositoryId, filePath, lines, symbols);
        break;
      case 'go':
        parseGo(repositoryId, filePath, lines, symbols);
        break;
      case 'java':
        parseJava(repositoryId, filePath, lines, symbols);
        break;
      case 'c':
      case 'cpp':
        parseCpp(repositoryId, filePath, lines, symbols);
        break;
      case 'markdown':
        parseMarkdown(repositoryId, filePath, lines, symbols);
        break;
      case 'shell':
        parseShell(repositoryId, filePath, lines, symbols);
        break;
      default:
        parseGeneric(repositoryId, filePath, lines, language, symbols);
        break;
    }

    // If no specific symbols were extracted (e.g. simple script or configuration),
    // treat the entire module or logical subsections as symbols
    if (symbols.length === 0) {
      symbols.push({
        id: `${repositoryId}_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}_module`,
        repository_id: repositoryId,
        file_path: filePath,
        language,
        symbol_type: 'module',
        symbol_name: filePath.split('/').pop() || 'module',
        start_line: 1,
        end_line: Math.max(1, lines.length),
        code: code.slice(0, 5000),
      });
    }

    return {
      filePath,
      language,
      symbols,
      success: true,
    };
  } catch (err: any) {
    return {
      filePath,
      language,
      symbols: [],
      success: false,
      error: err?.message || 'Unknown parsing error',
    };
  }
}

// ----------------------------------------------------
// Python Parser
// ----------------------------------------------------
function parsePython(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let i = 0;
  let currentClass: string | null = null;
  let classIndent = 0;

  // Track imports block
  let importStart = -1;
  let importEnd = -1;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check imports
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      if (importStart === -1) importStart = i + 1;
      importEnd = i + 1;
      i++;
      continue;
    }

    // If we left imports, record import symbol
    if (importStart !== -1 && !trimmed.startsWith('#') && trimmed.length > 0) {
      const codeSlice = lines.slice(importStart - 1, importEnd).join('\n');
      out.push({
        id: `${repoId}_${filePath}_imports_${importStart}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'python',
        symbol_type: 'import_block',
        symbol_name: 'imports',
        start_line: importStart,
        end_line: importEnd,
        code: codeSlice,
      });
      importStart = -1;
      importEnd = -1;
    }

    // Check indentation level to reset currentClass
    const indent = rawLine.search(/\S/);
    if (indent !== -1 && currentClass && indent <= classIndent && !trimmed.startsWith('#')) {
      currentClass = null;
    }

    // Class definition
    const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(\s*\(.*?\))?:/);
    if (classMatch) {
      const className = classMatch[1];
      const startLine = i + 1;
      classIndent = indent !== -1 ? indent : 0;
      currentClass = className;

      // Find end of class by indentation
      let endLine = startLine;
      let j = i + 1;
      while (j < lines.length) {
        const nextRaw = lines[j];
        const nextTrim = nextRaw.trim();
        if (nextTrim.length > 0 && !nextTrim.startsWith('#')) {
          const nextIndent = nextRaw.search(/\S/);
          if (nextIndent <= classIndent) break;
        }
        endLine = j + 1;
        j++;
      }

      out.push({
        id: `${repoId}_${filePath}_class_${className}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'python',
        symbol_type: 'class',
        symbol_name: className,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i++;
      continue;
    }

    // Route decorator pattern (e.g. @app.get(...), @router.post(...))
    const isRouteDecorator = trimmed.startsWith('@app.') || trimmed.startsWith('@router.');

    // Function or method definition
    const defMatch = trimmed.match(/^def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)(\s*->\s*.*?)?:/);
    if (defMatch) {
      const funcName = defMatch[1];
      let startLine = i + 1;

      // Check if preceded by decorator(s)
      let lookback = i - 1;
      let hasRoute = isRouteDecorator;
      while (lookback >= 0 && lines[lookback].trim().startsWith('@')) {
        if (lines[lookback].trim().startsWith('@app.') || lines[lookback].trim().startsWith('@router.')) {
          hasRoute = true;
        }
        startLine = lookback + 1;
        lookback--;
      }

      const funcIndent = indent !== -1 ? indent : 0;
      let endLine = i + 1;
      let j = i + 1;
      while (j < lines.length) {
        const nextRaw = lines[j];
        const nextTrim = nextRaw.trim();
        if (nextTrim.length > 0 && !nextTrim.startsWith('#')) {
          const nextIndent = nextRaw.search(/\S/);
          if (nextIndent <= funcIndent) break;
        }
        endLine = j + 1;
        j++;
      }

      const symbolType: SymbolType = hasRoute ? 'route' : currentClass ? 'method' : 'function';

      out.push({
        id: `${repoId}_${filePath}_${symbolType}_${funcName}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'python',
        symbol_type: symbolType,
        symbol_name: funcName,
        parent_symbol: currentClass,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });

      i = j;
      continue;
    }

    i++;
  }

  // Flush remaining imports if file ended during imports
  if (importStart !== -1) {
    out.push({
      id: `${repoId}_${filePath}_imports_${importStart}`,
      repository_id: repoId,
      file_path: filePath,
      language: 'python',
      symbol_type: 'import_block',
      symbol_name: 'imports',
      start_line: importStart,
      end_line: Math.max(importStart, importEnd),
      code: lines.slice(importStart - 1, Math.max(importStart, importEnd)).join('\n'),
    });
  }
}

// ----------------------------------------------------
// TypeScript & JavaScript Parser
// ----------------------------------------------------
function parseTypeScript(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let i = 0;
  let currentParent: string | null = null;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Interface
    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/);
    if (interfaceMatch) {
      const name = interfaceMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_interface_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'typescript',
        symbol_type: 'interface',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    // Class
    const classMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?class\s+([a-zA-Z0-9_]+)/);
    if (classMatch) {
      const name = classMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      currentParent = name;
      out.push({
        id: `${repoId}_${filePath}_class_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'typescript',
        symbol_type: 'class',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i++;
      continue;
    }

    // Express route pattern e.g. app.get('/...', ...), router.post('/...', ...)
    const routeMatch = trimmed.match(/^(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`](.*?)['"`]/);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const routePath = routeMatch[2];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_route_${method}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'typescript',
        symbol_type: 'route',
        symbol_name: `${method} ${routePath}`,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: `${method} ${routePath}`,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    // Standard function declaration
    const funcMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_]*)\s*\((.*?)\)/
    );
    if (funcMatch) {
      const name = funcMatch[1] || 'anonymousFunction';
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_function_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'typescript',
        symbol_type: currentParent ? 'method' : 'function',
        symbol_name: name,
        parent_symbol: currentParent,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    // Arrow function variable assignment: const funcName = async (...) => {
    const arrowMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/
    );
    if (arrowMatch) {
      const name = arrowMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_function_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'typescript',
        symbol_type: 'function',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    i++;
  }
}

// ----------------------------------------------------
// Go Parser
// ----------------------------------------------------
function parseGo(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Struct or Interface
    const typeMatch = trimmed.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const kind = typeMatch[2];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_${kind}_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'go',
        symbol_type: kind === 'struct' ? 'class' : 'interface',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    // Function or Method
    // func (r *Receiver) MethodName(...) ...
    const methodMatch = trimmed.match(/^func\s+\(\s*[^)]+\s*\)\s+([a-zA-Z0-9_]+)\s*\(/);
    if (methodMatch) {
      const name = methodMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_method_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'go',
        symbol_type: 'method',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    // func FunctionName(...) ...
    const funcMatch = trimmed.match(/^func\s+([a-zA-Z0-9_]+)\s*\(/);
    if (funcMatch) {
      const name = funcMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_func_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'go',
        symbol_type: 'function',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    i++;
  }
}

// ----------------------------------------------------
// Java Parser
// ----------------------------------------------------
function parseJava(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let i = 0;
  let currentClass: string | null = null;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Class / Interface
    const classMatch = trimmed.match(/(?:public|protected|private)?\s*(?:static)?\s*(?:final)?\s*(class|interface)\s+([a-zA-Z0-9_]+)/);
    if (classMatch) {
      const kind = classMatch[1];
      const name = classMatch[2];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      currentClass = name;
      out.push({
        id: `${repoId}_${filePath}_${kind}_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'java',
        symbol_type: kind === 'class' ? 'class' : 'interface',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i++;
      continue;
    }

    // Method pattern
    const methodMatch = trimmed.match(
      /(?:public|protected|private|static|\s)+[\w<>\[\]]+\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/
    );
    if (methodMatch) {
      const name = methodMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_method_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'java',
        symbol_type: currentClass ? 'method' : 'function',
        symbol_name: name,
        parent_symbol: currentClass,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    i++;
  }
}

// ----------------------------------------------------
// C & C++ Parser
// ----------------------------------------------------
function parseCpp(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Struct / Class
    const classMatch = trimmed.match(/^(?:class|struct)\s+([a-zA-Z0-9_]+)/);
    if (classMatch && !trimmed.endsWith(';')) {
      const name = classMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_class_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'cpp',
        symbol_type: 'class',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    // Function definition
    const funcMatch = trimmed.match(/^[\w:*&<>\s]+\s+([a-zA-Z0-9_]+)\s*\([^;]*\)\s*(?:const)?\s*\{/);
    if (funcMatch) {
      const name = funcMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_func_${name}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'cpp',
        symbol_type: 'function',
        symbol_name: name,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }

    i++;
  }
}

// ----------------------------------------------------
// Markdown / Documentation Parser
// ----------------------------------------------------
function parseMarkdown(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let currentHeading = filePath.split('/').pop() || 'README';
  let sectionStart = 1;
  let sectionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,4})\s+(.+)$/);

    if (match && sectionLines.length > 0) {
      out.push({
        id: `${repoId}_${filePath}_sec_${sectionStart}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'markdown',
        symbol_type: 'document',
        symbol_name: currentHeading,
        start_line: sectionStart,
        end_line: i,
        code: sectionLines.join('\n'),
      });
      sectionLines = [];
      sectionStart = i + 1;
      currentHeading = match[2].trim();
    }

    sectionLines.push(line);
  }

  if (sectionLines.length > 0) {
    out.push({
      id: `${repoId}_${filePath}_sec_${sectionStart}`,
      repository_id: repoId,
      file_path: filePath,
      language: 'markdown',
      symbol_type: 'document',
      symbol_name: currentHeading,
      start_line: sectionStart,
      end_line: lines.length,
      code: sectionLines.join('\n'),
    });
  }
}

// ----------------------------------------------------
// Shell Script Parser
// ----------------------------------------------------
function parseShell(
  repoId: string,
  filePath: string,
  lines: string[],
  out: CodeSymbol[]
) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Match function name() { or function name {
    const fnMatch = trimmed.match(/^(?:function\s+)?([a-zA-Z0-9_-]+)\s*\(\)\s*\{/) ||
                    trimmed.match(/^function\s+([a-zA-Z0-9_-]+)\s*\{/);
    if (fnMatch) {
      const fnName = fnMatch[1];
      const startLine = i + 1;
      const endLine = findClosingBrace(lines, i);
      out.push({
        id: `${repoId}_${filePath}_${fnName}_${startLine}`,
        repository_id: repoId,
        file_path: filePath,
        language: 'shell',
        symbol_type: 'function',
        symbol_name: fnName,
        start_line: startLine,
        end_line: endLine,
        code: lines.slice(startLine - 1, endLine).join('\n'),
        signature: trimmed,
      });
      i = Math.max(i + 1, endLine);
      continue;
    }
    i++;
  }

  // If no functions extracted, fall back to generic chunks
  if (out.length === 0) {
    parseGeneric(repoId, filePath, lines, 'shell', out);
  }
}

// ----------------------------------------------------
// Generic / Config Parser
// ----------------------------------------------------
function parseGeneric(
  repoId: string,
  filePath: string,
  lines: string[],
  language: string,
  out: CodeSymbol[]
) {
  // Break into 60-line logical chunks
  const chunkSize = 60;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const end = Math.min(lines.length, i + chunkSize);
    out.push({
      id: `${repoId}_${filePath}_chunk_${i + 1}`,
      repository_id: repoId,
      file_path: filePath,
      language,
      symbol_type: 'config',
      symbol_name: `${filePath.split('/').pop() || 'file'} [lines ${i + 1}-${end}]`,
      start_line: i + 1,
      end_line: end,
      code: lines.slice(i, end).join('\n'),
    });
  }
}

// Helper to find matching closing brace { ... }
function findClosingBrace(lines: string[], startIdx: number): number {
  let openCount = 0;
  let foundFirst = false;

  for (let j = startIdx; j < lines.length; j++) {
    const line = lines[j];
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '{') {
        openCount++;
        foundFirst = true;
      } else if (line[c] === '}') {
        openCount--;
      }
    }
    if (foundFirst && openCount <= 0) {
      return Math.max(startIdx + 1, j + 1);
    }
  }
  // Fallback if unclosed or multiline single block
  return Math.max(startIdx + 1, Math.min(lines.length, startIdx + 50));
}
