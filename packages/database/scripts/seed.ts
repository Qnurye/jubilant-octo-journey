/**
 * Seed: Populate databases with comprehensive test data
 *
 * Inserts ACM/math-modeling knowledge into all three databases with
 * rich graph relationships designed to exercise hybrid retrieval.
 *
 * Supports --reset flag to clear existing seed data before inserting.
 *
 * Prerequisites: Run migrate.ts first.
 * Usage:
 *   bun --env-file=../../.env scripts/seed.ts          # append
 *   bun --env-file=../../.env scripts/seed.ts --reset   # clear + seed
 */

import crypto from 'crypto';
import { db, postgresSchema, COLLECTION_NAME, sql } from '../src';
import { SEED_DOCUMENTS, SEED_TRIPLES } from './seed-data';

const RESET = process.argv.includes('--reset');

// ============================================================================
// Helpers
// ============================================================================

function chunkIdFromUuid(uuid: string): number {
  const hash = crypto.createHash('sha256').update(uuid).digest('hex');
  return parseInt(hash.slice(0, 13), 16);
}

function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function generateEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.EMBEDDING_BASE_URL || 'http://localhost:11434/v1';
  const model = process.env.EMBEDDING_MODEL || 'qwen3-embedding:8b';
  const apiKey = process.env.EMBEDDING_API_KEY || 'ollama';

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({ model, input: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ============================================================================
// Reset
// ============================================================================

async function resetAll() {
  console.log('[RESET] Clearing all seed data...');

  // PostgreSQL: truncate all tables (cascade)
  await db.postgres.execute(sql`TRUNCATE documents, ingestion_jobs, analytics_sessions, rag_queries, feedback_events, retrieval_metrics CASCADE`);
  console.log('  PostgreSQL: truncated');

  // Milvus: delete all entities
  try {
    await db.milvus.delete({ collection_name: COLLECTION_NAME, filter: 'chunk_id >= 0' });
    await db.milvus.flush({ collection_names: [COLLECTION_NAME] });
    console.log('  Milvus: cleared');
  } catch {
    console.log('  Milvus: collection empty or not found (ok)');
  }

  // Neo4j: delete all nodes and relationships
  const session = db.neo4j.session();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('  Neo4j: cleared');
  } finally {
    await session.close();
  }

  console.log('[RESET] Done.\n');
}

// ============================================================================
// Seed Functions
// ============================================================================

async function seedPostgres(): Promise<Record<string, string>> {
  console.log('[1/3] Seeding PostgreSQL...');

  const documentIds: Record<string, string> = {};
  let totalChunks = 0;

  for (const doc of SEED_DOCUMENTS) {
    const [inserted] = await db.postgres
      .insert(postgresSchema.documents)
      .values({
        url: doc.url,
        title: doc.title,
        format: doc.format,
        chunkCount: doc.chunks.length,
        status: 'active',
        metadata: { source: 'seed', version: '2.0' },
        ingestedAt: new Date(),
      })
      .returning({ id: postgresSchema.documents.id });

    documentIds[doc.url] = inserted.id;
    totalChunks += doc.chunks.length;
  }

  // Sample analytics
  const [session] = await db.postgres
    .insert(postgresSchema.analyticsSessions)
    .values({
      userHash: crypto.createHash('sha256').update('seed-user').digest('hex').slice(0, 16),
    })
    .returning({ id: postgresSchema.analyticsSessions.id });

  const sampleQueries = [
    { hash: 'q-dp', timeMs: 1200, milvus: 10, neo4j: 5, strategy: 'hybrid' },
    { hash: 'q-graph', timeMs: 800, milvus: 8, neo4j: 3, strategy: 'hybrid' },
    { hash: 'q-lp', timeMs: 950, milvus: 6, neo4j: 2, strategy: 'vector_only' },
    { hash: 'q-tarjan', timeMs: 1500, milvus: 12, neo4j: 8, strategy: 'hybrid' },
    { hash: 'q-mst', timeMs: 700, milvus: 7, neo4j: 4, strategy: 'hybrid' },
  ];

  for (const q of sampleQueries) {
    await db.postgres.insert(postgresSchema.ragQueries).values({
      sessionId: session.id,
      queryHash: q.hash,
      executionTimeMs: q.timeMs,
      milvusHits: q.milvus,
      neo4jHits: q.neo4j,
      strategyUsed: q.strategy,
    });
  }

  console.log(`  ${SEED_DOCUMENTS.length} documents, ${totalChunks} chunks, ${sampleQueries.length} sample queries`);
  console.log('  ✔ PostgreSQL seeded.\n');
  return documentIds;
}

async function seedMilvusAndNeo4j(documentIds: Record<string, string>) {
  console.log('[2/3] Generating embeddings & seeding Milvus + Neo4j...\n');

  const neo4jSession = db.neo4j.session();
  let totalEmbedded = 0;

  try {
    for (const doc of SEED_DOCUMENTS) {
      const documentId = documentIds[doc.url];
      console.log(`  📄 ${doc.title} (${doc.chunks.length} chunks)`);

      // Document node
      await neo4jSession.run(
        `MERGE (d:Document {url: $url})
         SET d.title = $title, d.chunkCount = $chunkCount,
             d.status = 'active', d.updatedAt = datetime()`,
        { url: doc.url, title: doc.title, chunkCount: doc.chunks.length }
      );

      const chunkUuids: string[] = [];

      for (let i = 0; i < doc.chunks.length; i++) {
        const chunk = doc.chunks[i];
        const chunkUuid = crypto.randomUUID();
        chunkUuids.push(chunkUuid);
        const chunkId = chunkIdFromUuid(chunkUuid);

        // Embedding
        process.stdout.write(`     [${i + 1}/${doc.chunks.length}] ${chunk.section}...`);
        const embedding = await generateEmbedding(chunk.content);
        console.log(` ✔ (dim=${embedding.length})`);
        totalEmbedded++;

        // Milvus insert
        await db.milvus.insert({
          collection_name: COLLECTION_NAME,
          data: [{
            chunk_id: chunkId,
            vector: embedding,
            content_text: chunk.content,
            metadata: JSON.stringify({
              documentId,
              documentTitle: doc.title,
              documentUrl: doc.url,
              sectionHeader: chunk.section,
              chunkIndex: i,
              totalChunks: doc.chunks.length,
              tokenCount: Math.ceil(chunk.content.length / 3),
              hasCode: chunk.hasCode ?? false,
              hasFormula: chunk.hasFormula ?? false,
              hasTable: chunk.hasTable ?? false,
            }),
            topic_tag: chunk.section,
          }],
        });

        // Chunk node + FROM_DOCUMENT
        await neo4jSession.run(
          `MERGE (c:Chunk {chunk_id: $chunkId})
           SET c.hash = $hash, c.preview = $preview,
               c.tokenCount = $tokenCount, c.hasCode = $hasCode,
               c.hasFormula = $hasFormula, c.hasTable = $hasTable,
               c.chunkIndex = $chunkIndex
           WITH c
           MATCH (d:Document {url: $docUrl})
           MERGE (c)-[:FROM_DOCUMENT]->(d)`,
          {
            chunkId: chunkUuid,
            hash: contentHash(chunk.content),
            preview: chunk.content.slice(0, 200),
            tokenCount: Math.ceil(chunk.content.length / 3),
            hasCode: chunk.hasCode ?? false,
            hasFormula: chunk.hasFormula ?? false,
            hasTable: chunk.hasTable ?? false,
            chunkIndex: i,
            docUrl: doc.url,
          }
        );

        // DISCUSSES relationships
        for (const concept of chunk.concepts) {
          await neo4jSession.run(
            `MERGE (concept:Concept {name: $name})
             WITH concept
             MATCH (c:Chunk {chunk_id: $chunkId})
             MERGE (c)-[:DISCUSSES]->(concept)`,
            { name: concept, chunkId: chunkUuid }
          );
        }

        // Special relationships
        if (chunk.hasCode && chunk.concepts.length > 0) {
          await neo4jSession.run(
            `MATCH (c:Chunk {chunk_id: $chunkId})
             MERGE (concept:Concept {name: $concept})
             MERGE (c)-[:CODE_EXAMPLE_FOR]->(concept)`,
            { chunkId: chunkUuid, concept: chunk.concepts[0] }
          );
        }
        if (chunk.hasFormula && chunk.concepts.length > 0) {
          await neo4jSession.run(
            `MATCH (c:Chunk {chunk_id: $chunkId})
             MERGE (concept:Concept {name: $concept})
             MERGE (c)-[:FORMULA_FOR]->(concept)`,
            { chunkId: chunkUuid, concept: chunk.concepts[0] }
          );
        }
      }

      // NEXT_CHUNK chain
      for (let i = 0; i < chunkUuids.length - 1; i++) {
        await neo4jSession.run(
          `MATCH (c1:Chunk {chunk_id: $from})
           MATCH (c2:Chunk {chunk_id: $to})
           MERGE (c1)-[:NEXT_CHUNK]->(c2)`,
          { from: chunkUuids[i], to: chunkUuids[i + 1] }
        );
      }
    }

    // Knowledge triples
    console.log(`\n  🔗 Creating ${SEED_TRIPLES.length} knowledge triples...`);
    for (const t of SEED_TRIPLES) {
      await neo4jSession.run(
        `MERGE (s:Concept {name: $subject})
         MERGE (o:Concept {name: $object})
         MERGE (s)-[r:${t.predicate}]->(o)
         SET r.confidence = $confidence`,
        { subject: t.subject, object: t.object, confidence: t.confidence }
      );
    }

    // Flush Milvus
    await db.milvus.flush({ collection_names: [COLLECTION_NAME] });

  } finally {
    await neo4jSession.close();
  }

  console.log(`\n  ✔ ${totalEmbedded} vectors, ${SEED_TRIPLES.length} triples seeded.\n`);
}

// ============================================================================
// Verification
// ============================================================================

async function verify() {
  console.log('=== Verification ===');

  // Milvus
  const stats = await db.milvus.getCollectionStatistics({ collection_name: COLLECTION_NAME });
  const rowCount = stats.stats.find(s => s.key === 'row_count')?.value || '0';
  console.log(`  Milvus: ${rowCount} vectors`);

  // Neo4j
  const session = db.neo4j.session();
  try {
    const nodes = await session.run(
      'MATCH (n) RETURN labels(n)[0] AS type, count(*) AS count ORDER BY type'
    );
    nodes.records.forEach(r => {
      console.log(`  Neo4j: ${r.get('count')} ${r.get('type')} nodes`);
    });

    const rels = await session.run(
      'MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY type'
    );
    rels.records.forEach(r => {
      console.log(`  Neo4j: ${r.get('count')} ${r.get('type')} relationships`);
    });
  } finally {
    await session.close();
  }

  // PostgreSQL
  const [{ count: docCount }] = await db.postgres
    .select({ count: sql<number>`count(*)` })
    .from(postgresSchema.documents);
  console.log(`  PostgreSQL: ${docCount} documents`);
}

// ============================================================================
// Main
// ============================================================================

async function seed() {
  console.log('=== Database Seed v2 ===\n');
  console.log(`Documents: ${SEED_DOCUMENTS.length}`);
  console.log(`Chunks: ${SEED_DOCUMENTS.reduce((sum, d) => sum + d.chunks.length, 0)}`);
  console.log(`Triples: ${SEED_TRIPLES.length}`);
  console.log(`Reset: ${RESET}\n`);

  await db.connect();

  try {
    if (RESET) await resetAll();

    const documentIds = await seedPostgres();
    await seedMilvusAndNeo4j(documentIds);
    await verify();

    console.log('\n=== Seed complete ===');
  } finally {
    await db.disconnect();
    process.exit(0);
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
