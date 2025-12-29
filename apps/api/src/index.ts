/**
 * CompetitionTutor API Server
 *
 * Hono-based API server for the hybrid RAG pipeline.
 *
 * @module apps/api
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { metricsMiddleware } from './middleware/metrics';
import healthRoutes from './routes/health';

const app = new Hono();

// Global middleware
app.use('*', cors());
app.use('*', metricsMiddleware);

// Mount routes
app.route('/api/health', healthRoutes);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'CompetitionTutor API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      query: '/api/query',
      ingest: '/api/ingest',
      feedback: '/api/feedback',
    },
  });
});

// API root
app.get('/api', (c) => {
  return c.json({
    message: 'CompetitionTutor RAG Pipeline API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'NOT_FOUND',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
    },
    500
  );
});

const port = parseInt(process.env.PORT || '8080', 10);

console.log(`Starting CompetitionTutor API on port ${port}...`);

export default {
  port,
  fetch: app.fetch,
};
