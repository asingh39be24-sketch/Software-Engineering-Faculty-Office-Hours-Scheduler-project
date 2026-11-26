import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { buildRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({ serveFrontend = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(
    cors({
      origin: config.corsOrigin.split(',').map((s) => s.trim()),
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', buildRouter());
  app.use('/api', notFoundHandler);

  // In production the built React app is served from the same origin.
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (serveFrontend && fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(indexHtml));
  }

  app.use(errorHandler);
  return app;
}
