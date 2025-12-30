/**
 * Infrastructure Overview Scaffold
 * 
 * This script provides a comprehensive overview of all infrastructure dependencies:
 * - LLM Health (Generation, Embedding, Reranking)
 * - Postgres Table Counts & Samples
 * - Milvus Collection Stats & Samples
 * - Neo4j Node/Relationship Overview
 * 
 * Usage: bun --env-file=.env scripts/infra-scaffold.ts
 */

import { db, postgresSchema } from '../src';
import { checkLLMHealth } from '../../rag/src';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('\x1b[36m%s\x1b[0m', '=== Infrastructure Overview Scaffold ===\n');

  try {
    // 1. Connect to Databases
    console.log('Connecting to databases...');
    await db.connect();
    console.log('\x1b[32m%s\x1b[0m', '✔ Databases connected\n');

    // 2. LLM Status
    console.log('\x1b[35m%s\x1b[0m', '--- LLM Infrastructure ---');
    const llmHealth = await checkLLMHealth();
    console.log(`LLM (${process.env.LLM_MODEL}): ${llmHealth.llm.healthy ? '✅' : '❌'} ${llmHealth.llm.message || ''}`);
    console.log(`Embedding (${process.env.EMBEDDING_MODEL}): ${llmHealth.embedding.healthy ? '✅' : '❌'} ${llmHealth.embedding.message || ''}`);
    console.log(`Reranker (${process.env.RERANKER_MODEL}): ${llmHealth.reranker.healthy ? '✅' : '❌'} ${llmHealth.reranker.message || ''}`);
    console.log('');

    // 3. Postgres Overview
    console.log('\x1b[35m%s\x1b[0m', '--- Postgres Database ---');
    const tables = [
      { name: 'documents', schema: postgresSchema.documents },
      { name: 'ingestion_jobs', schema: postgresSchema.ingestionJobs },
      { name: 'rag_queries', schema: postgresSchema.ragQueries },
      { name: 'retrieval_metrics', schema: postgresSchema.retrievalMetrics },
      { name: 'feedback_events', schema: postgresSchema.feedbackEvents },
    ];

    for (const table of tables) {
      const countRes = await db.postgres.select({ count: sql<number>`count(*)` }).from(table.schema);
      const count = countRes[0].count;
      console.log(`Table [${table.name}]: ${count} records`);
      
      if (count > 0) {
        const samples = await db.postgres.select().from(table.schema).limit(2);
        console.log(`  Sample:`, JSON.stringify(samples, null, 2).split('\n').map(l => '    ' + l).join('\n'));
      }
    }
    console.log('');

    // 4. Milvus Overview
    console.log('\x1b[35m%s\x1b[0m', '--- Milvus Vector Store ---');
    const collectionName = 'knowledge_chunks';
    try {
      const stats = await db.milvus.getCollectionStatistics({ collection_name: collectionName });
      console.log(`Collection [${collectionName}]: ${stats.stats.find(s => s.key === 'row_count')?.value || 0} entities`);
      
      const queryRes = await db.milvus.query({
        collection_name: collectionName,
        filter: '',
        output_fields: ['chunk_id', 'content_text', 'topic_tag'],
        limit: 2
      });
      if (queryRes.data.length > 0) {
        console.log(`  Sample Data:`, JSON.stringify(queryRes.data, null, 2).split('\n').map(l => '    ' + l).join('\n'));
      }
    } catch (e) {
      console.log(`  Error accessing Milvus collection: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    console.log('');

    // 5. Neo4j Overview
    console.log('\x1b[35m%s\x1b[0m', '--- Neo4j Knowledge Graph ---');
    const session = db.neo4j.session();
    try {
      const nodeCounts = await session.run(`
        MATCH (n)
        RETURN labels(n) as label, count(*) as count
      `);
      console.log('Nodes:');
      nodeCounts.records.forEach(r => {
        console.log(`  [${r.get('label')}]: ${r.get('count')}`);
      });

      const relCounts = await session.run(`
        MATCH ()-[r]->()
        RETURN type(r) as type, count(*) as count
      `);
      console.log('Relationships:');
      relCounts.records.forEach(r => {
        console.log(`  [${r.get('type')}]: ${r.get('count')}`);
      });

      const sampleNodes = await session.run(`
        MATCH (n)
        RETURN n LIMIT 2
      `);
      if (sampleNodes.records.length > 0) {
        console.log('  Sample Nodes:');
        sampleNodes.records.forEach(r => {
          const n = r.get('n');
          console.log(`    (:${n.labels[0]} {name: "${n.properties.name || n.properties.chunk_id || 'N/A'}"})`);
        });
      }
    } catch (e) {
      console.log(`  Error accessing Neo4j: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      await session.close();
    }
    console.log('');

  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Critical Error during overview:');
    console.error(error);
  } finally {
    await db.disconnect();
    process.exit(0);
  }
}

main();
