import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { getPostgresClient, closePostgresClient } from '../../src/clients/postgres';
import { analyticsSessions } from '../../src/schema/postgres';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

describe('Postgres Integration', () => {
  let db: ReturnType<typeof getPostgresClient>;

  beforeAll(async () => {
    db = getPostgresClient();
    // In a real test env, we would run migrations here using drizzle-kit or manually push schema
    // For this integration test, we assume 'drizzle-kit push:pg' or equivalent was run, 
    // OR we just rely on the fact that we can execute raw SQL or that the tables exist if we ran docker compose correctly with a volume.
    // However, since we just defined the schema in code, the DB in docker is likely empty unless we run migration.
    // Let's create the table manually for the test if it doesn't exist, to ensure test self-containment.
    
    try {
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS analytics_sessions (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                started_at timestamp DEFAULT now() NOT NULL,
                ended_at timestamp,
                user_hash text NOT NULL
            );
        `);
    } catch (e) {
        console.warn("Migration/Table creation failed (might be connection issue):", e);
        throw e;
    }
  });

  it('should connect to Postgres', async () => {
    const result = await db.execute(sql`SELECT 1 as val`);
    expect(result[0].val).toBe(1);
  });

  it('should insert and retrieve a session', async () => {
    const userHash = 'test_user_' + Date.now();
    
    // Insert
    const inserted = await db.insert(analyticsSessions).values({
      userHash,
    }).returning();

    expect(inserted.length).toBe(1);
    expect(inserted[0].userHash).toBe(userHash);
    expect(inserted[0].id).toBeDefined();

    // Select
    const found = await db.select().from(analyticsSessions).where(sql`${analyticsSessions.userHash} = ${userHash}`);
    expect(found.length).toBe(1);
    expect(found[0].userHash).toBe(userHash);
  });

  afterAll(async () => {
    await closePostgresClient();
  });
});
