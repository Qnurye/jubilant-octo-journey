import { Driver } from 'neo4j-driver';

export const initGraphConstraints = async (driver: Driver) => {
  const session = driver.session();
  
  try {
    console.log('Initializing Neo4j constraints...');

    // Concept: name must be unique
    await session.executeWrite(tx => 
      tx.run(`
        CREATE CONSTRAINT concept_name_unique IF NOT EXISTS
        FOR (c:Concept) REQUIRE c.name IS UNIQUE
      `)
    );

    // Document: url must be unique
    await session.executeWrite(tx => 
      tx.run(`
        CREATE CONSTRAINT document_url_unique IF NOT EXISTS
        FOR (d:Document) REQUIRE d.url IS UNIQUE
      `)
    );

    // Chunk: chunk_id must be unique (correlates with Milvus)
    await session.executeWrite(tx => 
      tx.run(`
        CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
        FOR (c:Chunk) REQUIRE c.chunk_id IS UNIQUE
      `)
    );
    
    // Chunk: hash must be unique (deduplication)
    await session.executeWrite(tx => 
        tx.run(`
          CREATE CONSTRAINT chunk_hash_unique IF NOT EXISTS
          FOR (c:Chunk) REQUIRE c.hash IS UNIQUE
        `)
      );

    console.log('Neo4j constraints initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize Neo4j constraints:', error);
    throw error;
  } finally {
    await session.close();
  }
};
