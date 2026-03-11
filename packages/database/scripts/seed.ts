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

async function getGcloudToken(): Promise<string> {
  const proc = Bun.spawn(['gcloud', 'auth', 'print-access-token'], { stdout: 'pipe', stderr: 'pipe' });
  const token = (await new Response(proc.stdout).text()).trim();
  const exitCode = await proc.exited;
  if (exitCode !== 0 || !token) {
    throw new Error('Failed to get GCP access token via gcloud CLI. Run: gcloud auth login');
  }
  return token;
}

let cachedToken: string | null = null;

async function generateEmbedding(text: string): Promise<number[]> {
  const provider = process.env.EMBEDDING_PROVIDER || 'openai';

  if (provider === 'vertex') {
    const projectId = process.env.GCP_PROJECT_ID;
    const region = process.env.GCP_REGION || 'us-central1';
    const model = process.env.EMBEDDING_MODEL || 'text-multilingual-embedding-002';

    if (!projectId) throw new Error('GCP_PROJECT_ID is required for vertex embeddings');
    if (!cachedToken) cachedToken = await getGcloudToken();

    const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:predict`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cachedToken}` },
      body: JSON.stringify({ instances: [{ content: text }] }),
    });

    if (response.status === 401) {
      cachedToken = await getGcloudToken();
      const retry = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cachedToken}` },
        body: JSON.stringify({ instances: [{ content: text }] }),
      });
      if (!retry.ok) throw new Error(`Vertex AI error: ${retry.status} ${await retry.text()}`);
      const data = (await retry.json()) as { predictions: Array<{ embeddings: { values: number[] } }> };
      return data.predictions[0].embeddings.values;
    }

    if (!response.ok) throw new Error(`Vertex AI error: ${response.status} ${await response.text()}`);
    const data = (await response.json()) as { predictions: Array<{ embeddings: { values: number[] } }> };
    return data.predictions[0].embeddings.values;
  }

  // OpenAI-compatible (Ollama, etc.)
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

  if (!response.ok) throw new Error(`Embedding API error: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

// ============================================================================
// Reset
// ============================================================================

async function resetAll() {
  console.log('[RESET] Clearing all seed data...');

  // PostgreSQL: truncate all tables (cascade)
  await db.postgres.execute(sql`TRUNCATE documents, ingestion_jobs, conversations, analytics_sessions, rag_queries, feedback_events, retrieval_metrics CASCADE`);
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

// ============================================================================
// Conversation Simulation
// ============================================================================

/** Random int in [min, max] */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random float in [min, max] */
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Pick random element from array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a date within the last N days */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000 + randInt(0, 86400000));
}

// Realistic student query topics — maps to knowledge base concepts
const QUERY_TOPICS = [
  { hash: 'q-dp-intro', topic: 'dynamic programming basics', avgTimeMs: 1100, strategy: 'hybrid' as const },
  { hash: 'q-dp-knapsack', topic: 'knapsack problem', avgTimeMs: 1300, strategy: 'hybrid' as const },
  { hash: 'q-dp-lis', topic: 'longest increasing subsequence', avgTimeMs: 1050, strategy: 'hybrid' as const },
  { hash: 'q-dp-tree', topic: 'tree DP', avgTimeMs: 1400, strategy: 'hybrid' as const },
  { hash: 'q-graph-bfs', topic: 'BFS DFS traversal', avgTimeMs: 850, strategy: 'hybrid' as const },
  { hash: 'q-graph-dijkstra', topic: 'Dijkstra shortest path', avgTimeMs: 950, strategy: 'hybrid' as const },
  { hash: 'q-graph-bellman', topic: 'Bellman-Ford negative weights', avgTimeMs: 1200, strategy: 'hybrid' as const },
  { hash: 'q-graph-mst', topic: 'minimum spanning tree', avgTimeMs: 780, strategy: 'hybrid' as const },
  { hash: 'q-graph-tarjan', topic: 'Tarjan SCC algorithm', avgTimeMs: 1500, strategy: 'hybrid' as const },
  { hash: 'q-graph-flow', topic: 'network flow max flow', avgTimeMs: 1600, strategy: 'hybrid' as const },
  { hash: 'q-dsu', topic: 'disjoint set union find', avgTimeMs: 700, strategy: 'hybrid' as const },
  { hash: 'q-segtree', topic: 'segment tree range query', avgTimeMs: 1250, strategy: 'hybrid' as const },
  { hash: 'q-bit', topic: 'binary indexed tree', avgTimeMs: 900, strategy: 'vector_only' as const },
  { hash: 'q-greedy', topic: 'greedy algorithm interval scheduling', avgTimeMs: 650, strategy: 'hybrid' as const },
  { hash: 'q-kmp', topic: 'KMP string matching', avgTimeMs: 800, strategy: 'vector_only' as const },
  { hash: 'q-recursion', topic: 'recursion and divide conquer', avgTimeMs: 750, strategy: 'hybrid' as const },
  { hash: 'q-lp', topic: 'linear programming optimization', avgTimeMs: 1100, strategy: 'hybrid' as const },
  { hash: 'q-prob', topic: 'probability statistical modeling', avgTimeMs: 1000, strategy: 'vector_only' as const },
  { hash: 'q-ode', topic: 'differential equation modeling', avgTimeMs: 1150, strategy: 'vector_only' as const },
  { hash: 'q-tsp', topic: 'TSP vehicle routing', avgTimeMs: 1350, strategy: 'hybrid' as const },
  { hash: 'q-icpc-rules', topic: 'ICPC contest rules', avgTimeMs: 500, strategy: 'vector_only' as const },
  { hash: 'q-cumcm', topic: 'math modeling competition tips', avgTimeMs: 600, strategy: 'vector_only' as const },
  { hash: 'q-number-theory', topic: 'GCD modular arithmetic', avgTimeMs: 850, strategy: 'hybrid' as const },
  { hash: 'q-combo', topic: 'combinatorics counting', avgTimeMs: 900, strategy: 'hybrid' as const },
];

// Conversation templates — multi-turn exchanges
const CONVERSATION_TEMPLATES = [
  { title: '动态规划入门', turns: 3, topics: ['q-dp-intro', 'q-dp-knapsack', 'q-dp-intro'] },
  { title: 'Dijkstra vs Bellman-Ford', turns: 2, topics: ['q-graph-dijkstra', 'q-graph-bellman'] },
  { title: '如何准备ACM区域赛', turns: 4, topics: ['q-icpc-rules', 'q-dp-intro', 'q-graph-bfs', 'q-greedy'] },
  { title: '线段树区间查询', turns: 2, topics: ['q-segtree', 'q-bit'] },
  { title: '数学建模论文结构', turns: 3, topics: ['q-cumcm', 'q-lp', 'q-prob'] },
  { title: 'Tarjan算法详解', turns: 2, topics: ['q-graph-tarjan', 'q-graph-flow'] },
  { title: '背包问题变种', turns: 3, topics: ['q-dp-knapsack', 'q-dp-lis', 'q-dp-tree'] },
  { title: '贪心还是DP', turns: 2, topics: ['q-greedy', 'q-dp-intro'] },
  { title: 'KMP算法推导', turns: 2, topics: ['q-kmp', 'q-recursion'] },
  { title: '最小生成树应用', turns: 3, topics: ['q-graph-mst', 'q-dsu', 'q-greedy'] },
  { title: '网络流建模', turns: 2, topics: ['q-graph-flow', 'q-tsp'] },
  { title: '概率模型选择', turns: 2, topics: ['q-prob', 'q-ode'] },
  { title: '数论基础', turns: 2, topics: ['q-number-theory', 'q-combo'] },
  { title: '递归到分治', turns: 2, topics: ['q-recursion', 'q-dp-intro'] },
  { title: 'MCM竞赛经验', turns: 3, topics: ['q-cumcm', 'q-lp', 'q-tsp'] },
];

async function seedConversations() {
  const now = Date.now();
  const DAYS = 30;
  const NUM_USERS = 8;
  const stats = { sessions: 0, conversations: 0, queries: 0, metrics: 0, feedback: 0 };

  // Create anonymous users (hashed)
  const userHashes = Array.from({ length: NUM_USERS }, (_, i) =>
    crypto.createHash('sha256').update(`student-${i}`).digest('hex').slice(0, 16)
  );

  // Create sessions — each user has 2-5 sessions spread across the time window
  const sessionIds: string[] = [];
  const sessionUserMap: Record<string, string> = {};

  for (const userHash of userHashes) {
    const numSessions = randInt(2, 5);
    for (let s = 0; s < numSessions; s++) {
      const startedAt = daysAgo(randInt(1, DAYS));
      const [session] = await db.postgres
        .insert(postgresSchema.analyticsSessions)
        .values({ userHash, startedAt })
        .returning({ id: postgresSchema.analyticsSessions.id });
      sessionIds.push(session.id);
      sessionUserMap[session.id] = userHash;
      stats.sessions++;
    }
  }

  // Generate conversations with realistic time distribution
  // More queries in recent days (simulate growing usage)
  const queryTopicMap = new Map(QUERY_TOPICS.map(t => [t.hash, t]));

  for (let day = DAYS; day >= 0; day--) {
    // More conversations on recent days: 1-2 early, 3-5 later
    const dailyConversations = day > 20 ? randInt(1, 2) : day > 10 ? randInt(2, 4) : randInt(3, 6);

    for (let c = 0; c < dailyConversations; c++) {
      const template = pick(CONVERSATION_TEMPLATES);
      const sessionId = pick(sessionIds);
      const userHash = sessionUserMap[sessionId];
      const baseTime = new Date(now - day * 86400000 + randInt(28800000, 79200000)); // 8am-10pm

      // Create conversation
      const [conv] = await db.postgres
        .insert(postgresSchema.conversations)
        .values({
          title: template.title,
          createdAt: baseTime,
          updatedAt: baseTime,
          messageCount: template.turns * 2, // user + assistant per turn
          userHash,
        })
        .returning({ id: postgresSchema.conversations.id });
      stats.conversations++;

      // Each turn = one RAG query
      for (let turn = 0; turn < template.turns; turn++) {
        const topicKey = template.topics[turn];
        const topic = queryTopicMap.get(topicKey)!;
        const queryTime = new Date(baseTime.getTime() + turn * randInt(15000, 60000)); // 15-60s between turns
        const timeJitter = randInt(-300, 400);
        const executionTimeMs = Math.max(200, topic.avgTimeMs + timeJitter);

        const milvusHits = randInt(3, 15);
        const neo4jHits = topic.strategy === 'vector_only' ? 0 : randInt(1, 10);

        const [query] = await db.postgres
          .insert(postgresSchema.ragQueries)
          .values({
            sessionId,
            conversationId: conv.id,
            timestamp: queryTime,
            queryHash: topic.hash,
            executionTimeMs,
            milvusHits,
            neo4jHits,
            strategyUsed: topic.strategy,
          })
          .returning({ id: postgresSchema.ragQueries.id });
        stats.queries++;

        // Retrieval metrics for every query
        const vectorTopScore = randFloat(0.4, 0.95);
        const rerankTopScore = randFloat(0.45, 0.98);
        const confidenceMet = rerankTopScore >= 0.6;

        await db.postgres.insert(postgresSchema.retrievalMetrics).values({
          queryId: query.id,
          vectorSearchMs: randInt(30, 200),
          vectorResultCount: milvusHits,
          vectorTopScore,
          vectorAvgScore: vectorTopScore * randFloat(0.5, 0.85),
          graphTraversalMs: neo4jHits > 0 ? randInt(20, 150) : null,
          graphResultCount: neo4jHits,
          graphMaxDepth: neo4jHits > 0 ? randInt(1, 3) : null,
          conceptsFound: neo4jHits > 0 ? randInt(1, 5) : null,
          fusionMs: randInt(5, 30),
          overlapCount: randInt(0, Math.min(milvusHits, neo4jHits)),
          rrfTopScore: randFloat(0.3, 0.9),
          rerankMs: randInt(50, 300),
          rerankTopScore,
          confidenceThresholdMet: confidenceMet,
          finalContextTokens: randInt(500, 3000),
          citationCount: randInt(1, 6),
        });
        stats.metrics++;

        // Feedback: ~30% of queries get rated
        if (Math.random() < 0.3) {
          const rating = confidenceMet
            ? pick([3, 4, 4, 5, 5]) // good answers skew positive
            : pick([1, 2, 2, 3, 3]); // low confidence skews negative

          await db.postgres.insert(postgresSchema.feedbackEvents).values({
            queryId: query.id,
            rating,
            comment: rating >= 4 ? pick([null, '解释清楚', '示例很好', '很有帮助']) :
                     rating <= 2 ? pick([null, '没回答到点上', '答案不够详细', '例子不对']) :
                     null,
            createdAt: new Date(queryTime.getTime() + randInt(5000, 120000)),
          });
          stats.feedback++;
        }
      }
    }
  }

  return stats;
}

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

  // Simulated conversation transactions over 30 days
  const stats = await seedConversations();

  console.log(`  ${SEED_DOCUMENTS.length} documents, ${totalChunks} chunks`);
  console.log(`  ${stats.sessions} sessions, ${stats.conversations} conversations, ${stats.queries} queries`);
  console.log(`  ${stats.metrics} retrieval metrics, ${stats.feedback} feedback events`);
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
  } catch (err) {
    console.error('\nSeed failed:', err);
    process.exitCode = 1;
  } finally {
    await db.disconnect();
  }
}

seed();
