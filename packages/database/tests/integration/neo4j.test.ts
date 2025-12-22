import { describe, it, expect, afterAll } from 'vitest';
import { getNeo4jDriver, closeNeo4jDriver } from '../../src/clients/neo4j';
import { initGraphConstraints } from '../../src/schema/neo4j';

describe('Neo4j Integration', () => {
  
  it('should connect to Neo4j and initialize constraints', async () => {
    try {
      const driver = await getNeo4jDriver();
      expect(driver).toBeDefined();

      await initGraphConstraints(driver);

      // Verify constraints exist by querying system db if needed, or trusting the function didn't throw.
      // Simple query check:
      const session = driver.session();
      const result = await session.run('RETURN 1 as val');
      expect(result.records[0].get('val').toNumber()).toBe(1);
      await session.close();

    } catch (error) {
      console.warn("Skipping Neo4j test because connection failed. Ensure Docker is running.");
      console.error(error);
      throw error;
    }
  });

  it('should create and retrieve a node', async () => {
    const driver = await getNeo4jDriver();
    const session = driver.session();

    try {
      const testName = `TestConcept_${Date.now()}`;
      
      // Create
      await session.run(
        'MERGE (c:Concept {name: $name, definition: "A test concept"}) RETURN c',
        { name: testName }
      );

      // Query
      const result = await session.run(
        'MATCH (c:Concept {name: $name}) RETURN c',
        { name: testName }
      );

      expect(result.records.length).toBe(1);
      const node = result.records[0].get('c');
      expect(node.properties.name).toBe(testName);
      
      // Cleanup (optional but good practice for tests)
      await session.run(
        'MATCH (c:Concept {name: $name}) DELETE c',
        { name: testName }
      );
      
    } finally {
      await session.close();
    }
  });

  afterAll(async () => {
    await closeNeo4jDriver();
  });
});
