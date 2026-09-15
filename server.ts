import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { repoManager } from './server/repoManager';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ----------------------------------------------------
  // REST API Routes
  // ----------------------------------------------------

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'codebase-rag-assistant',
      geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
    });
  });

  // GET /api/repositories - List all ingested repositories
  app.get('/api/repositories', (req, res) => {
    try {
      const repos = repoManager.getAllRepositories();
      res.json(repos);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list repositories' });
    }
  });

  // POST /api/repositories - Create repository from Git URL or preset
  app.post('/api/repositories', async (req, res) => {
    try {
      const { repoUrl, name } = req.body;
      if (!repoUrl) {
        return res.status(400).json({ error: 'Repository URL is required' });
      }

      const metadata = await repoManager.createFromGitUrl(repoUrl);
      res.status(201).json(metadata);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to ingest repository' });
    }
  });

  // POST /api/repositories/upload - Upload repository as ZIP
  app.post('/api/repositories/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ZIP file is required' });
      }

      const metadata = await repoManager.createFromZip(
        req.file.buffer,
        req.file.originalname || 'uploaded-repo.zip'
      );

      res.status(201).json(metadata);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to process ZIP upload' });
    }
  });

  // GET /api/repositories/:id - Get repository details and progress
  app.get('/api/repositories/:id', (req, res) => {
    try {
      const repo = repoManager.getRepository(req.params.id);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      res.json(repo.metadata);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get repository' });
    }
  });

  // GET /api/repositories/:id/files - Get file tree hierarchy
  app.get('/api/repositories/:id/files', (req, res) => {
    try {
      const tree = repoManager.getFileTree(req.params.id);
      res.json(tree);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get file tree' });
    }
  });

  // GET /api/repositories/:id/file-content - Get content of specific file for Monaco Editor
  app.get('/api/repositories/:id/file-content', (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: 'Missing path query parameter' });
      }
      const content = repoManager.getFileContent(req.params.id, filePath);
      if (content === null) {
        return res.status(404).json({ error: 'File not found' });
      }
      res.json({ path: filePath, content });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch file content' });
    }
  });

  // GET /api/repositories/:id/symbols - Get parsed symbols with line bounds
  app.get('/api/repositories/:id/symbols', (req, res) => {
    try {
      const repo = repoManager.getRepository(req.params.id);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      const fileFilter = req.query.file as string;
      let symbols = repo.symbols;
      if (fileFilter) {
        symbols = symbols.filter(s => s.file_path === fileFilter);
      }
      res.json(symbols);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get symbols' });
    }
  });

  // GET /api/repositories/:id/chunks - Get all code chunks
  app.get('/api/repositories/:id/chunks', (req, res) => {
    try {
      const repo = repoManager.getRepository(req.params.id);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      res.json(repo.chunks);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get chunks' });
    }
  });

  // POST /api/repositories/:id/query - Core RAG Question Answering Endpoint
  app.post('/api/repositories/:id/query', async (req, res) => {
    try {
      const { question, topK } = req.body;
      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: 'Question is required' });
      }

      const ragResponse = await repoManager.queryRepository(
        req.params.id,
        question.trim(),
        topK || 8
      );

      res.json(ragResponse);
    } catch (err: any) {
      console.error('Query endpoint error:', err);
      res.status(500).json({ error: err?.message || 'Failed to process RAG query' });
    }
  });

  // GET /api/repositories/:id/graph - Architecture & dependency graph
  app.get('/api/repositories/:id/graph', (req, res) => {
    try {
      const repo = repoManager.getRepository(req.params.id);
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }
      res.json(repo.graph || { nodes: [], edges: [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get graph' });
    }
  });

  // ----------------------------------------------------
  // Vite Integration & Fallback
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Codebase RAG Assistant running on http://localhost:${PORT}`);
  });
}

startServer();
