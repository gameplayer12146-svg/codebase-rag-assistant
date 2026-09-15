import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  FileCode,
  CheckCircle2,
  ExternalLink,
  Loader2,
  CornerDownLeft,
  Clock,
  ChevronRight,
  Code2,
} from 'lucide-react';
import { ChatMessage, RagResponse, SourceReference } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (question: string) => void;
  onSelectReference: (filePath: string, startLine: number, endLine: number) => void;
  activeRepoName: string;
}

const SUGGESTED_QUESTIONS = [
  'Where is authentication handled?',
  "Which function validates the user's password?",
  'Where is the login API defined?',
  'Which file creates the database connection?',
  'What happens after the login form is submitted?',
  'Explain the authentication flow.',
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onSelectReference,
  activeRepoName,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleSuggestionClick = (q: string) => {
    if (isLoading) return;
    onSendMessage(q);
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900/60 border-r border-neutral-800">
      {/* Header */}
      <div className="p-3 border-b border-neutral-800 flex items-center justify-between bg-neutral-900 select-none">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-neutral-200">AI Code Assistant</span>
        </div>
        <span className="text-[11px] font-mono text-neutral-400">
          Target: <span className="text-emerald-400">{activeRepoName}</span>
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="space-y-6 py-6 text-center select-none">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="font-semibold text-sm text-neutral-200">Ask anything about this codebase</h3>
              <p className="text-xs text-neutral-400">
                Responses are retrieved directly from indexed source code with verified line citations.
              </p>
            </div>

            {/* Suggestions Chips */}
            <div className="space-y-2 max-w-md mx-auto pt-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400">
                Try asking:
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {SUGGESTED_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(q)}
                    className="text-xs bg-neutral-950/80 hover:bg-neutral-800 text-neutral-300 hover:text-emerald-400 border border-neutral-800 rounded-lg px-3 py-1.5 transition-all text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Thread */}
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-3">
            {/* User message */}
            {msg.role === 'user' && (
              <div className="flex items-start gap-2.5 justify-end">
                <div className="bg-emerald-600 text-white text-xs px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] shadow-sm leading-relaxed">
                  {msg.content}
                </div>
                <div className="w-6 h-6 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              </div>
            )}

            {/* Assistant message */}
            {msg.role === 'assistant' && (
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/20">
                  <Bot className="w-3.5 h-3.5" />
                </div>

                <div className="space-y-4 max-w-[92%] flex-1">
                  {msg.ragResponse ? (
                    <div className="bg-neutral-950/90 border border-neutral-800 rounded-2xl p-4 text-xs space-y-4 shadow-md">
                      {/* Answer section */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Answer
                        </div>
                        <p className="text-neutral-200 leading-relaxed text-sm">
                          {msg.ragResponse.answer}
                        </p>
                      </div>

                      {/* Relevant Files & Functions */}
                      {(msg.ragResponse.relevant_files.length > 0 || msg.ragResponse.relevant_functions.length > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
                          {msg.ragResponse.relevant_files.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-mono text-neutral-400">Relevant Files:</div>
                              <div className="flex flex-wrap gap-1">
                                {msg.ragResponse.relevant_files.map((file, i) => (
                                  <span
                                    key={i}
                                    onClick={() => onSelectReference(file, 1, 30)}
                                    className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border border-neutral-700/60 rounded text-[11px] font-mono cursor-pointer transition-colors"
                                  >
                                    {file}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {msg.ragResponse.relevant_functions.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-mono text-neutral-400">Relevant Functions:</div>
                              <div className="flex flex-wrap gap-1">
                                {msg.ragResponse.relevant_functions.map((fn, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 bg-neutral-900 text-neutral-300 border border-neutral-800 rounded text-[11px] font-mono"
                                  >
                                    {fn}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* How It Works Flow */}
                      {msg.ragResponse.how_it_works.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-neutral-800/80">
                          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium">
                            How It Works
                          </div>
                          <ul className="space-y-1.5 list-disc list-inside text-neutral-300 leading-relaxed">
                            {msg.ragResponse.how_it_works.map((step, sIdx) => (
                              <li key={sIdx} className="text-xs">
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Source References */}
                      {msg.ragResponse.source_references.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-neutral-800/80">
                          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-medium flex items-center justify-between">
                            <span>Verified Source References</span>
                            <span className="text-[10px] text-emerald-400">Click to jump in editor</span>
                          </div>

                          <div className="grid grid-cols-1 gap-2">
                            {msg.ragResponse.source_references.map((ref, rIdx) => (
                              <div
                                key={rIdx}
                                onClick={() => onSelectReference(ref.file_path, ref.start_line, ref.end_line)}
                                className="p-2.5 bg-neutral-900/80 hover:bg-neutral-850 border border-neutral-800 hover:border-emerald-500/50 rounded-xl transition-all cursor-pointer group"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5 font-mono text-emerald-400 group-hover:text-emerald-300">
                                    <FileCode className="w-3.5 h-3.5" />
                                    <span className="font-semibold">{ref.symbol_name}</span>
                                    {ref.symbol_type && (
                                      <span className="text-[10px] text-neutral-400">({ref.symbol_type})</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 group-hover:text-neutral-200">
                                    <span>Lines {ref.start_line}–{ref.end_line}</span>
                                    <ChevronRight className="w-3 h-3 text-emerald-400" />
                                  </div>
                                </div>

                                <div className="mt-1 text-[11px] text-neutral-400 font-mono truncate">
                                  {ref.file_path}
                                </div>
                                {ref.reason && (
                                  <div className="mt-1 text-xs text-neutral-300 leading-snug">
                                    {ref.reason}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Latency badge */}
                      {msg.ragResponse.latency_ms !== undefined && (
                        <div className="flex items-center justify-end text-[10px] font-mono text-neutral-400 gap-1 pt-1">
                          <Clock className="w-3 h-3" />
                          <span>Retrieved & generated in {(msg.ragResponse.latency_ms / 1000).toFixed(2)}s</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 text-xs text-neutral-200 leading-relaxed">
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center gap-2.5 text-xs text-neutral-400 pl-1">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Searching vector database & synthesizing answer...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-3 bg-neutral-900 border-t border-neutral-800">
        <form onSubmit={handleSubmit} className="relative">
          <input
            id="chat-query-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about this codebase (e.g. where is authentication defined?)..."
            disabled={isLoading}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-3.5 pr-12 py-2.5 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
          />
          <button
            id="chat-send-btn"
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
};
