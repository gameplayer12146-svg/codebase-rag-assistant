import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LandingHero } from './components/LandingHero';
import { FileExplorer } from './components/FileExplorer';
import { MonacoViewer } from './components/MonacoViewer';
import { ChatPanel } from './components/ChatPanel';
import { RetrievedContextPanel } from './components/RetrievedContextPanel';
import { ArchitectureGraphView } from './components/ArchitectureGraphView';
import { IngestionModal } from './components/IngestionModal';
import { RepositoryStatsModal } from './components/RepositoryStatsModal';
import {
  RepositoryMetadata,
  FileTreeNode,
  ChatMessage,
  RetrievedChunkPreview,
  ArchitectureGraph,
} from './types';
import { PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, Sparkles } from 'lucide-react';

export function App() {
  const [repositories, setRepositories] = useState<RepositoryMetadata[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'workspace' | 'landing' | 'graph'>('landing');

  // Workspace layout toggles
  const [showFileExplorer, setShowFileExplorer] = useState(true);
  const [showContextPanel, setShowContextPanel] = useState(true);

  // File tree & editor
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [highlightLines, setHighlightLines] = useState<{ start: number; end: number } | null>(null);

  // Chat & Retrieval
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [retrievedChunks, setRetrievedChunks] = useState<RetrievedChunkPreview[]>([]);
  const [activeChunkRef, setActiveChunkRef] = useState<{ filePath: string; startLine: number } | null>(null);

  // Architecture graph
  const [graph, setGraph] = useState<ArchitectureGraph | null>(null);

  // Modals
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [ingestModalMode, setIngestModalMode] = useState<'git' | 'zip'>('git');
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  // 1. Initial Load: Fetch Repositories
  useEffect(() => {
    fetchRepositories();
  }, []);

  const fetchRepositories = async () => {
    try {
      const resp = await fetch('/api/repositories');
      if (resp.ok) {
        const text = await resp.text();
        try {
          const data: RepositoryMetadata[] = JSON.parse(text);
          if (Array.isArray(data)) {
            setRepositories(data);
            if (data.length > 0 && !activeRepoId) {
              setActiveRepoId(data[0].id);
            }
          }
        } catch {
          // Ignore non-JSON during startup
        }
      }
    } catch (err) {
      console.error('Failed to fetch repositories:', err);
    }
  };

  // 2. When active repository changes, load file tree, graph, and initial file
  useEffect(() => {
    if (!activeRepoId) return;

    // Load file tree
    fetch(`/api/repositories/${activeRepoId}/files`)
      .then(async r => {
        if (!r.ok) return [];
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch {
          return [];
        }
      })
      .then((tree: FileTreeNode[]) => {
        if (!Array.isArray(tree)) return;
        setFileTree(tree);
        // Find first file in tree to open by default
        const findFirstFile = (nodes: FileTreeNode[]): string | null => {
          for (const node of nodes) {
            if (node.type === 'file') return node.path;
            if (node.children) {
              const sub = findFirstFile(node.children);
              if (sub) return sub;
            }
          }
          return null;
        };

        const initialFile = findFirstFile(tree);
        if (initialFile) {
          handleSelectFile(initialFile);
        }
      })
      .catch(console.error);

    // Load architecture graph
    fetch(`/api/repositories/${activeRepoId}/graph`)
      .then(async r => {
        if (!r.ok) return { nodes: [], edges: [] };
        const text = await r.text();
        try {
          return JSON.parse(text);
        } catch {
          return { nodes: [], edges: [] };
        }
      })
      .then((g: ArchitectureGraph) => setGraph(g))
      .catch(console.error);
  }, [activeRepoId]);

  // 3. Load file content
  const handleSelectFile = async (filePath: string, startLine?: number, endLine?: number) => {
    if (!activeRepoId) return;
    setSelectedFilePath(filePath);

    if (startLine && endLine) {
      setHighlightLines({ start: startLine, end: endLine });
    } else {
      setHighlightLines(null);
    }

    try {
      const resp = await fetch(`/api/repositories/${activeRepoId}/file-content?path=${encodeURIComponent(filePath)}`);
      if (resp.ok) {
        const text = await resp.text();
        try {
          const data = JSON.parse(text);
          setFileContent(data.content || '');
        } catch {
          setFileContent(text);
        }
      } else {
        setFileContent('// Failed to load file content');
      }
    } catch {
      setFileContent('// Error loading file');
    }
  };

  // 4. Reference selection from AI panel or Context panel
  const handleSelectReference = (filePath: string, startLine: number, endLine: number) => {
    // If user is on landing or graph, switch to workspace
    if (currentView !== 'workspace') {
      setCurrentView('workspace');
    }
    setActiveChunkRef({ filePath, startLine });
    handleSelectFile(filePath, startLine, endLine);
  };

  // 5. Send RAG Query
  const handleSendMessage = async (question: string) => {
    if (!activeRepoId || isChatLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsChatLoading(true);

    try {
      const resp = await fetch(`/api/repositories/${activeRepoId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const text = await resp.text();
      let ragData: any;
      try {
        ragData = JSON.parse(text);
      } catch {
        throw new Error(
          resp.ok
            ? 'Invalid response format received from assistant.'
            : `Service temporarily unavailable (${resp.status} ${resp.statusText || 'Error'}). Please try again in a moment.`
        );
      }

      if (!resp.ok) {
        throw new Error(ragData.error || 'RAG query failed');
      }

      const assistantMessage: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        role: 'assistant',
        content: ragData.answer,
        ragResponse: ragData,
        timestamp: new Date().toISOString(),
      };

      setChatMessages(prev => [...prev, assistantMessage]);

      // Populate retrieved context panel
      if (ragData.retrieved_chunks) {
        setRetrievedChunks(ragData.retrieved_chunks);
      }
    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err?.message || 'Failed to generate answer from repository.'}`,
        timestamp: new Date().toISOString(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleIngestComplete = (newRepo: RepositoryMetadata) => {
    setRepositories(prev => [newRepo, ...prev]);
    setActiveRepoId(newRepo.id);
    setCurrentView('workspace');
  };

  const activeRepo = repositories.find(r => r.id === activeRepoId) || null;

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Top Navbar */}
      <Navbar
        repositories={repositories}
        activeRepoId={activeRepoId}
        onSelectRepo={id => setActiveRepoId(id)}
        onOpenConnectModal={() => {
          setIngestModalMode('git');
          setIsConnectModalOpen(true);
        }}
        onOpenZipModal={() => {
          setIngestModalMode('zip');
          setIsConnectModalOpen(true);
        }}
        onOpenStatsModal={() => setIsStatsModalOpen(true)}
        currentView={currentView}
        onChangeView={setCurrentView}
      />

      {/* Main View Area */}
      {currentView === 'landing' ? (
        <LandingHero
          repositories={repositories}
          onSelectRepo={id => setActiveRepoId(id)}
          onOpenConnectModal={() => {
            setIngestModalMode('git');
            setIsConnectModalOpen(true);
          }}
          onOpenZipModal={() => {
            setIngestModalMode('zip');
            setIsConnectModalOpen(true);
          }}
          onStartWorkspace={() => setCurrentView('workspace')}
        />
      ) : currentView === 'graph' ? (
        <ArchitectureGraphView
          graph={graph}
          onSelectFile={filePath => {
            setCurrentView('workspace');
            handleSelectFile(filePath);
          }}
          repoName={activeRepo?.name || 'Repository'}
        />
      ) : (
        /* Workspace 3-Column IDE Layout */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Column 1: File Explorer */}
          {showFileExplorer && (
            <div className="w-64 shrink-0 h-full">
              <FileExplorer
                tree={fileTree}
                selectedFilePath={selectedFilePath}
                onSelectFile={handleSelectFile}
                repoName={activeRepo?.name || 'Codebase'}
              />
            </div>
          )}

          {/* Column 2: Center Dual-Split (Chat AI Assistant & Monaco Code Viewer) */}
          <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
            {/* Left/Top: AI Assistant Chat */}
            <div className="flex-1 h-1/2 lg:h-full flex flex-col overflow-hidden">
              <ChatPanel
                messages={chatMessages}
                isLoading={isChatLoading}
                onSendMessage={handleSendMessage}
                onSelectReference={handleSelectReference}
                activeRepoName={activeRepo?.name || 'Repository'}
              />
            </div>

            {/* Right/Bottom: Monaco Editor Code Viewer */}
            <div className="flex-1 h-1/2 lg:h-full flex flex-col overflow-hidden border-t lg:border-t-0 lg:border-l border-neutral-800">
              <MonacoViewer
                filePath={selectedFilePath}
                content={fileContent}
                highlightLines={highlightLines}
              />
            </div>
          </div>

          {/* Column 3: Retrieved Context Panel (Chroma Vector Inspection) */}
          {showContextPanel && (
            <div className="w-72 lg:w-80 shrink-0 h-full hidden md:block">
              <RetrievedContextPanel
                chunks={retrievedChunks}
                onSelectChunk={handleSelectReference}
                activeChunkRef={activeChunkRef}
              />
            </div>
          )}

          {/* Floating Workspace Controls */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-800 p-1 rounded-lg backdrop-blur shadow-lg">
            <button
              onClick={() => setShowFileExplorer(!showFileExplorer)}
              className="p-1 text-neutral-400 hover:text-neutral-200 rounded hover:bg-neutral-800"
              title={showFileExplorer ? 'Hide File Explorer' : 'Show File Explorer'}
            >
              {showFileExplorer ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowContextPanel(!showContextPanel)}
              className="p-1 text-neutral-400 hover:text-neutral-200 rounded hover:bg-neutral-800 hidden md:block"
              title={showContextPanel ? 'Hide Retrieved Context' : 'Show Retrieved Context'}
            >
              {showContextPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <IngestionModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        defaultMode={ingestModalMode}
        onIngestComplete={handleIngestComplete}
      />

      <RepositoryStatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        repo={activeRepo}
      />
    </div>
  );
}

export default App;
