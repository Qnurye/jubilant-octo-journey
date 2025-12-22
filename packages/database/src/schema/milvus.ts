import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';

export const COLLECTION_NAME = 'knowledge_chunks';
export const VECTOR_DIM = 1536;

export const initMilvusCollection = async (client: MilvusClient) => {
  console.log(`Checking Milvus collection: ${COLLECTION_NAME}...`);
  
  const hasCollection = await client.hasCollection({
    collection_name: COLLECTION_NAME,
  });

  if (hasCollection.value) {
    console.log(`Collection ${COLLECTION_NAME} already exists.`);
    // In a real prod migration scenario, we might check schema compatibility here.
    
    // Ensure index exists
    await client.createIndex({
      collection_name: COLLECTION_NAME,
      field_name: 'vector',
      index_name: 'vector_hnsw',
      index_type: 'HNSW',
      metric_type: 'COSINE',
      params: { M: 16, efConstruction: 200 },
    });
    
    // Load collection so it's ready for search
    await client.loadCollectionSync({
      collection_name: COLLECTION_NAME,
    });
    
    return;
  }

  console.log(`Creating collection ${COLLECTION_NAME}...`);

  await client.createCollection({
    collection_name: COLLECTION_NAME,
    fields: [
      {
        name: 'chunk_id',
        description: 'Unique ID for the chunk',
        data_type: DataType.Int64,
        is_primary_key: true,
        autoID: false,
      },
      {
        name: 'vector',
        description: 'Embedding vector',
        data_type: DataType.FloatVector,
        dim: VECTOR_DIM,
      },
      {
        name: 'content_text',
        description: 'The actual text content',
        data_type: DataType.VarChar,
        max_length: 65535,
      },
      {
        name: 'metadata',
        description: 'Flexible metadata (source, page, author)',
        data_type: DataType.JSON,
      },
      {
        name: 'topic_tag',
        description: 'High-level topic for filtering',
        data_type: DataType.VarChar,
        max_length: 256,
      },
    ],
  });

  console.log(`Creating index for ${COLLECTION_NAME}...`);
  await client.createIndex({
    collection_name: COLLECTION_NAME,
    field_name: 'vector',
    index_name: 'vector_hnsw',
    index_type: 'HNSW',
    metric_type: 'COSINE',
    params: { M: 16, efConstruction: 200 },
  });

  // Scalar index for topic_tag for faster filtering
  // Note: Milvus automatically indexes scalar fields in some versions, 
  // but explicit index creation is safer for performance.
  // Standard scalar index type is often implied or specifically Trie/STL_SORT depending on version/type.
  // For VarChar, we usually just let it be or use an inverted index if available.
  // We'll skip explicit scalar index creation for now to avoid specific version compatibility issues 
  // unless we need inverted index specifically.

  console.log(`Loading collection ${COLLECTION_NAME}...`);
  await client.loadCollectionSync({
    collection_name: COLLECTION_NAME,
  });

  console.log(`Collection ${COLLECTION_NAME} initialized successfully.`);
};
