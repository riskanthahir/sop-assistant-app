import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import 'dotenv/config';
import {
  handleChatRequest,
  handleStatusRequest,
  handleTranslateRequest,
  handleVerifyAccessRequest,
} from './lib/chatHandler.ts';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const NON_HTML_ASSET_RE =
  /\.(?:js|mjs|cjs|css|map|json|webmanifest|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot)$/i;

const DEV_SW_CLEANUP_SCRIPT = `
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {}
    try {
      await self.registration.unregister();
    } catch {}
  })());
});
`.trim();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', true);
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/status', (req, res) => {
    void handleStatusRequest(req, res);
  });

  app.post('/api/verify-access', (req, res) => {
    void handleVerifyAccessRequest(req, res);
  });

  app.post('/api/chat', (req, res) => {
    void handleChatRequest(req, res);
  });

  app.post('/api/translate', (req, res) => {
    void handleTranslateRequest(req, res);
  });

  if (!isProduction) {
    app.get(['/sw.js', '/dev-sw.js'], (_req, res) => {
      res
        .status(200)
        .set('Content-Type', 'application/javascript; charset=utf-8')
        .set('Cache-Control', 'no-store')
        .send(DEV_SW_CLEANUP_SCRIPT);
    });

    app.get('/registerSW.js', (_req, res) => {
      res
        .status(200)
        .set('Content-Type', 'application/javascript; charset=utf-8')
        .set('Cache-Control', 'no-store')
        .send('// PWA service worker disabled in dev preview\n');
    });

    const publicDir = path.resolve(process.cwd(), 'public');
    app.use(async (req, res, next) => {
      if (
        req.path.startsWith('/assets/') ||
        /^\/workbox-[^/]+\.js$/i.test(req.path)
      ) {
        const rel = req.path.replace(/^\/+/, '');
        const candidate = path.resolve(publicDir, rel);
        if (
          !candidate.startsWith(publicDir + path.sep) ||
          !(await fileExists(candidate))
        ) {
          res.status(404).type('text/plain').send('Not found');
          return;
        }
      }
      next();
    });

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
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (base === 'sw.js' || base === 'registerSW.js' || base === 'index.html') {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      })
    );
    app.get('*', async (req, res) => {
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/assets/') ||
        NON_HTML_ASSET_RE.test(req.path)
      ) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }
      try {
        const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
        res
          .status(200)
          .set('Content-Type', 'text/html; charset=utf-8')
          .set('Cache-Control', 'no-cache')
          .send(html);
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
