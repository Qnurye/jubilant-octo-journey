import type { Config } from 'drizzle-kit';

// Use environment variables directly (with defaults for migration generation)
const connectionString = process.env.POSTGRES_URL ||
  `postgres://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'postgres'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'jubilant_db'}`;

export default {
  schema: './src/schema/postgres.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString,
  },
} satisfies Config;
