import React, { useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { FileCode, ExternalLink, Copy, Check } from 'lucide-react';

interface MonacoViewerProps {
  filePath: string | null;
  content: string | null;
  language?: string;
  highlightLines?: { start: number; end: number } | null;
  onClose?: () => void;
}

export const MonacoViewer: React.FC<MonacoViewerProps> = ({
  filePath,
  content,
  language,
  highlightLines,
}) => {
  const editorRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const [copied, setCopied] = React.useState(false);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Apply initial highlight if provided
    if (highlightLines) {
      applyHighlight(editor, monaco, highlightLines.start, highlightLines.end);
    }
  };

  const applyHighlight = (editor: any, monaco: any, start: number, end: number) => {
    // Reveal and center lines in viewport
    editor.revealLinesInCenter(start, end);
    editor.setPosition({ lineNumber: start, column: 1 });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new monaco.Range(start, 1, end, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-line-highlight',
          overviewRuler: {
            color: '#10b981',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      },
    ]);
  };

  useEffect(() => {
    if (editorRef.current && highlightLines) {
      const monaco = (window as any).monaco;
      if (monaco) {
        applyHighlight(editorRef.current, monaco, highlightLines.start, highlightLines.end);
      }
    }
  }, [highlightLines]);

  const copyCode = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getMonacoLanguage = (path?: string | null, lang?: string) => {
    if (lang) {
      if (lang === 'typescript' || lang === 'javascript') return lang;
      if (lang === 'python') return 'python';
      if (lang === 'go') return 'go';
      if (lang === 'java') return 'java';
      if (lang === 'cpp') return 'cpp';
    }
    if (!path) return 'plaintext';
    if (path.endsWith('.py')) return 'python';
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
    if (path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.go')) return 'go';
    if (path.endsWith('.java')) return 'java';
    if (path.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  if (!filePath || content === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-neutral-950 text-neutral-500 text-xs p-6 space-y-2 select-none">
        <FileCode className="w-8 h-8 text-neutral-700" />
        <p className="font-medium text-neutral-400">No file selected</p>
        <p className="text-center max-w-xs text-neutral-400">
          Click any file in the left explorer or click a source reference in the AI answer to open it in Monaco.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-neutral-950 border-r border-neutral-800">
      {/* File Header Bar */}
      <div className="h-10 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between text-xs select-none">
        <div className="flex items-center gap-2 text-neutral-300 font-mono truncate">
          <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{filePath}</span>
          {highlightLines && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
              Lines {highlightLines.start}–{highlightLines.end}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyCode}
            className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors rounded hover:bg-neutral-800"
            title="Copy file contents"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Monaco Editor Canvas */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={getMonacoLanguage(filePath, language)}
          value={content}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: true, scale: 0.75 },
            scrollBeyondLastLine: false,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
};
