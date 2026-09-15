import React from 'react';
import {
  GitBranch,
  FileCode,
  Binary,
  Search,
  Bot,
  ArrowRight,
  ShieldCheck,
  Zap,
  BookOpen,
  FolderGit2,
  UploadCloud,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { RepositoryMetadata } from '../types';

interface LandingHeroProps {
  repositories: RepositoryMetadata[];
  onSelectRepo: (id: string) => void;
  onOpenConnectModal: () => void;
  onOpenZipModal: () => void;
  onStartWorkspace: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  repositories,
  onSelectRepo,
  onOpenConnectModal,
  onOpenZipModal,
  onStartWorkspace,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-6 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            Hackathon Problem 1 &bull; Production Codebase RAG Pipeline
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Codebase RAG Assistant
          </h1>

          <p className="text-lg md:text-xl text-neutral-400 max-w-3xl mx-auto font-normal leading-relaxed">
            Understand unfamiliar codebases using AI-powered semantic code search.
            Ask natural language questions and get grounded answers with precise file and line citations.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              id="landing-cta-analyze-repo"
              onClick={onOpenConnectModal}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/30 hover:scale-[1.02]"
            >
              <FolderGit2 className="w-4 h-4" />
              Analyze Repository
            </button>

            <button
              id="landing-cta-upload-zip"
              onClick={onOpenZipModal}
              className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium rounded-xl border border-neutral-700 transition-all flex items-center gap-2 hover:scale-[1.02]"
            >
              <UploadCloud className="w-4 h-4" />
              Upload ZIP
            </button>

            <button
              id="landing-cta-open-workspace"
              onClick={onStartWorkspace}
              className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-emerald-400 font-medium rounded-xl border border-emerald-500/30 transition-all flex items-center gap-2"
            >
              Open Interactive Workspace
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Visual Workflow Diagram */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 md:p-8 backdrop-blur shadow-xl">
          <div className="text-xs font-mono uppercase tracking-wider text-neutral-500 text-center mb-6">
            End-to-End RAG Architecture Pipeline
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
            {/* Step 1 */}
            <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl text-center space-y-2 group hover:border-emerald-500/50 transition-colors">
              <div className="w-10 h-10 mx-auto rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <GitBranch className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm text-neutral-200">1. Repository</div>
              <div className="text-xs text-neutral-400">Git URL or ZIP archive ingestion</div>
            </div>

            {/* Step 2 */}
            <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl text-center space-y-2 group hover:border-emerald-500/50 transition-colors">
              <div className="w-10 h-10 mx-auto rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <FileCode className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm text-neutral-200">2. Parse & Chunk</div>
              <div className="text-xs text-neutral-400">Code-aware AST & symbol boundary tracking</div>
            </div>

            {/* Step 3 */}
            <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl text-center space-y-2 group hover:border-emerald-500/50 transition-colors">
              <div className="w-10 h-10 mx-auto rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <Binary className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm text-neutral-200">3. Embed & Store</div>
              <div className="text-xs text-neutral-400">Dense vectors in isolated Chroma partition</div>
            </div>

            {/* Step 4 */}
            <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl text-center space-y-2 group hover:border-emerald-500/50 transition-colors">
              <div className="w-10 h-10 mx-auto rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm text-neutral-200">4. Retrieve</div>
              <div className="text-xs text-neutral-400">Cosine similarity & hybrid keyword ranker</div>
            </div>

            {/* Step 5 */}
            <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl text-center space-y-2 group hover:border-emerald-500/50 transition-colors">
              <div className="w-10 h-10 mx-auto rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div className="font-semibold text-sm text-neutral-200">5. Ask AI</div>
              <div className="text-xs text-neutral-400">Grounded answer with interactive Monaco links</div>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <FileCode className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-100">Code-Aware Parsing</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Splits code at grammatical boundaries—functions, classes, and decorators—rather than arbitrary character counts.
            </p>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <Search className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-100">Semantic Retrieval</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Finds relevant logic even when your terminology doesn't match the codebase variable names.
            </p>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-100">Grounded Answers</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Strict context grounding prevents hallucinations. If a feature does not exist, the assistant says so plainly.
            </p>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-neutral-100">Source References</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Clickable citations jump directly to the exact file and line in an integrated Monaco code viewer.
            </p>
          </div>
        </div>

        {/* Quick Launch Pre-Indexed Repositories */}
        <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Pre-Indexed Sample Repositories (Ready to Query)
              </h2>
              <p className="text-xs text-neutral-400">
                Test the RAG assistant instantly without waiting for a repository download.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {repositories.map(repo => (
              <div
                key={repo.id}
                onClick={() => {
                  onSelectRepo(repo.id);
                  onStartWorkspace();
                }}
                className="bg-neutral-950/70 border border-neutral-800 hover:border-emerald-500/40 rounded-xl p-4 cursor-pointer transition-all hover:translate-y-[-2px] group"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-semibold text-sm text-neutral-200 group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-neutral-400 group-hover:text-emerald-400" />
                      {repo.name}
                    </div>
                    <div className="text-xs text-neutral-400 font-mono">
                      {repo.source_files} files &bull; {repo.functions_count} functions &bull; {repo.chunks_count} chunks
                    </div>
                  </div>
                  <span className="text-[11px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                    Ready
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-800/60">
                  <span>Languages: {Object.keys(repo.languages).join(', ')}</span>
                  <span className="text-emerald-400 font-medium group-hover:underline flex items-center gap-1">
                    Query Repo <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
