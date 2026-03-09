/**
 * Migrate: Initialize all database schemas
 *
 * Creates PostgreSQL tables (via drizzle-kit push), Milvus collection + indexes,
 * and Neo4j constraints + fulltext indexes.
 *
 * Usage: bun --env-file=../../.env scripts/migrate.ts
 */

import { db, initMilvusCollection, initGraphSchema } from '../src';
import { execSync } from 'child_process';
import path from 'path';

async function migrate() {
  console.log('=== Database Migration ===\n');

  // 1. PostgreSQL schema via drizzle-kit push
  console.log('[1/3] PostgreSQL: pushing schema...');
  try {
    execSync('bun run migrate', {
      cwd: path.resolve(import.meta.dir, '..'),
      stdio: 'inherit',
    });
    console.log('✔ PostgreSQL schema pushed.\n');
  } catch (error) {
    console.error('✘ PostgreSQL migration failed:', error);
    process.exit(1);
  }

  // 2. Milvus + Neo4j
  console.log('Connecting to databases...');
  await db.connect();

  // 3. Milvus collection + HNSW index
  console.log('[2/3] Milvus: initializing collection...');
  await initMilvusCollection(db.milvus);
  console.log('✔ Milvus collection ready.\n');

  // 4. Neo4j constraints + fulltext indexes
  console.log('[3/3] Neo4j: initializing schema...');
  await initGraphSchema(db.neo4j);
  console.log('✔ Neo4j schema ready.\n');

  await db.disconnect();
  console.log('=== Migration complete ===');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
