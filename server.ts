import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import 'dotenv/config';
import {
  handleChatRequest,
  handleStatusRequest,
  handleVerifyAccessRequest,
} from './lib/chatHandler.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', true);
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/status', (req, res) => {
    void handleStatusRequest(req, res);
  });

  app.post('/api/verify-access', (req, res) => {
    void handleVerifyAccessRequest(req, res);
  });

  app.post('/api/chat', (req, res) => {
    void handleChatRequest(req, res);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', async (_req, res) => {
      try {
        const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
        res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
      } catch {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SOP Assistant listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
