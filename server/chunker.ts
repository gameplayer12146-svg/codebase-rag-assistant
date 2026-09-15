import { CodeChunk, CodeSymbol } from '../src/types';

const MAX_CHUNK_LINES = 120; // If a symbol exceeds this, split preserving header context

export function chunkSymbols(
  repositoryId: string,
  symbols: CodeSymbol[]
): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (const symbol of symbols) {
    const lines = symbol.code.split('\n');

    // Build rich context header for retrieval grounding
    const contextHeader = [
      `File: ${symbol.file_path}`,
      `Language: ${symbol.language}`,
      `Type: ${symbol.symbol_type}`,
      `Symbol: ${symbol.symbol_name}`,
      symbol.parent_symbol ? `Parent: ${symbol.parent_symbol}` : '',
      `Lines: ${symbol.start_line}-${symbol.end_line}`,
    ]
      .filter(Boolean)
      .join('\n');

    if (lines.length <= MAX_CHUNK_LINES) {
      chunks.push({
        id: `${symbol.id}_chunk_1`,
        repository_id: repositoryId,
        file_path: symbol.file_path,
        language: symbol.language,
        symbol_name: symbol.symbol_name,
        symbol_type: symbol.symbol_type,
        start_line: symbol.start_line,
        end_line: symbol.end_line,
        parent_symbol: symbol.parent_symbol || null,
        code: symbol.code,
        context_header: contextHeader,
      });
    } else {
      // Split large functions/classes into sub-chunks, preserving context header & signature
      const signaturePrefix = lines.slice(0, 3).join('\n');
      const step = MAX_CHUNK_LINES - 15; // 15 lines overlap

      for (let offset = 0; offset < lines.length; offset += step) {
        const subLines = lines.slice(offset, offset + MAX_CHUNK_LINES);
        const subStart = symbol.start_line + offset;
        const subEnd = Math.min(symbol.end_line, subStart + subLines.length - 1);

        const subCode = offset === 0 ? subLines.join('\n') : `// ... ${symbol.symbol_name} (cont.)\n${subLines.join('\n')}`;

        chunks.push({
          id: `${symbol.id}_chunk_${offset + 1}`,
          repository_id: repositoryId,
          file_path: symbol.file_path,
          language: symbol.language,
          symbol_name: `${symbol.symbol_name} (part ${Math.floor(offset / step) + 1})`,
          symbol_type: symbol.symbol_type,
          start_line: subStart,
          end_line: subEnd,
          parent_symbol: symbol.parent_symbol || null,
          code: subCode,
          context_header: `${contextHeader} (Lines ${subStart}-${subEnd})`,
        });

        if (offset + MAX_CHUNK_LINES >= lines.length) break;
      }
    }
  }

  return chunks;
}
