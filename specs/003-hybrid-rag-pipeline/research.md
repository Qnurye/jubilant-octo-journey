# Hybrid RAG Pipeline Research Document

> **Date**: 2025-12-29
> **Feature**: 003-hybrid-rag-pipeline
> **Status**: Research Complete

---

## 1. LlamaIndex.TS Integration

### 1.1 Custom Retriever Implementation

**Decision**: Implement custom retrievers by extending the `BaseRetriever` class in LlamaIndex.TS, creating separate `MilvusRetriever` and `Neo4jRetriever` classes.

**Rationale**:
- LlamaIndex.TS follows the same pattern as the Python version where custom retrievers inherit from `BaseRetriever` and implement a `_retrieve` method
- Retrievers receive a `QueryBundle` containing the user's question and return `NodeWithScore` objects
- This pattern allows complete control over retrieval logic while maintaining compatibility with LlamaIndex query engines and chat engines

**Implementation Pattern**:
```typescript
import { BaseRetriever, NodeWithScore, QueryBundle } from "llamaindex";

class MilvusRetriever extends BaseRetriever {
  private milvusClient: MilvusClient;
  private embedModel: EmbeddingModel;
  private collectionName: string;
  private topK: number;

  constructor(options: MilvusRetrieverOptions) {
    super();
    this.milvusClient = options.milvusClient;
    this.embedModel = options.embedModel;
    this.collectionName = options.collectionName;
    this.topK = options.topK ?? 10;
  }

  async _retrieve(queryBundle: QueryBundle): Promise<NodeWithScore[]> {
    // 1. Get query embedding
    const queryEmbedding = await this.embedModel.getQueryEmbedding(
      queryBundle.queryStr
    );

    // 2. Search Milvus
    const results = await this.milvusClient.search({
      collection_name: this.collectionName,
      vectors: [queryEmbedding],
      limit: this.topK,
    });

    // 3. Convert to NodeWithScore
    return results.map(r => ({
      node: new TextNode({ text: r.text, metadata: r.metadata }),
      score: r.score,
    }));
  }
}
```

**Alternatives Considered**:
1. **Use built-in MilvusVectorStore** - Limited customization, doesn't integrate well with our existing `DatabaseManager` singleton
2. **Use LangChain retrievers with adapter** - Adds unnecessary dependency and complexity
3. **Direct database queries without LlamaIndex** - Loses benefits of LlamaIndex's response synthesis and chat engine infrastructure

**Sources**:
- [LlamaIndex Retriever Documentation](https://docs.llamaindex.ai/en/stable/module_guides/querying/retriever/)
- [Building Retrieval from Scratch](https://docs.llamaindex.ai/en/stable/examples/low_level/retrieval/)
- [Custom Retrievers Guide](https://markaicode.com/custom-retrievers-llamaindex-guide/)

---

### 1.2 OpenAI-Compatible LLM Integration (Qwen3-32B)

**Decision**: Use `@llamaindex/openai` package with custom `baseURL` configuration to connect to vLLM-served Qwen3-32B endpoint.

**Rationale**:
- vLLM provides OpenAI-compatible API at `http://localhost:8000/v1` by default
- LlamaIndex.TS's OpenAI class supports `baseURL` parameter for custom endpoints
- Qwen3-32B deployed via vLLM (v0.8.5+) natively supports OpenAI API protocol
- This approach requires minimal code changes and leverages existing LlamaIndex infrastructure

**Implementation Pattern**:
```typescript
import { OpenAI } from "@llamaindex/openai";
import { Settings } from "llamaindex";

// Configure LLM with local Qwen3-32B endpoint
const llm = new OpenAI({
  model: "Qwen/Qwen3-32B",
  apiKey: "not-needed", // vLLM doesn't require API key by default
  baseURL: "http://localhost:8000/v1",
  temperature: 0.7,
  maxTokens: 2048,
});

Settings.llm = llm;
```

**vLLM Deployment Command**:
```bash
vllm serve Qwen/Qwen3-32B \
  --port 8000 \
  --enable-reasoning \
  --reasoning-parser qwen3 \
  --max-model-len 32768
```

**Alternatives Considered**:
1. **Custom LLM class implementation** - More work, unnecessary when OpenAI-compatible API exists
2. **HuggingFace Transformers direct** - Higher latency, more memory overhead than vLLM
3. **Ollama** - Less control over serving parameters, not optimized for production workloads

**Key Considerations**:
- Qwen3-32B has native thinking mode (like QwQ-32B); use `enable_thinking=False` for standard responses
- Context length: Native 32K tokens, up to 131K with YaRN scaling
- For tool calling: add `--enable-auto-tool-choice --tool-call-parser hermes`

**Sources**:
- [LlamaIndex.TS OpenAI Module](https://ts.llamaindex.ai/docs/llamaindex/modules/models/llms/openai)
- [Qwen vLLM Documentation](https://qwen.readthedocs.io/en/latest/deployment/vllm.html)
- [vLLM Qwen3 Usage Guide](https://github.com/vllm-project/vllm/issues/17327)
- [Qwen3-32B HuggingFace](https://huggingface.co/Qwen/Qwen3-32B)

---

### 1.3 Streaming Response Patterns

**Decision**: Use LlamaIndex.TS's native streaming with `stream: true` parameter in chat/query methods, returning `ReadableStream<EngineResponse>`.

**Rationale**:
- LlamaIndex.TS provides built-in streaming support through async iterators
- Works seamlessly with Hono's streaming response handlers
- Maintains conversation context through `ContextChatEngine`

**Implementation Pattern**:
```typescript
import { ContextChatEngine, OpenAI } from "llamaindex";

// Create chat engine with retriever
const chatEngine = new ContextChatEngine({
  chatModel: llm,
  retriever: hybridRetriever, // Our custom hybrid retriever
});

// Stream response
const response = await chatEngine.chat({
  message: userQuery,
  stream: true,
});

// Hono streaming handler
app.post("/api/chat", async (c) => {
  const { message } = await c.req.json();

  const response = await chatEngine.chat({
    message,
    stream: true,
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of response) {
          controller.enqueue(
            new TextEncoder().encode(JSON.stringify(chunk) + "\n")
          );
        }
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    }
  );
});
```

**Alternatives Considered**:
1. **Server-Sent Events (SSE) via separate library** - Adds complexity; native streaming sufficient
2. **WebSocket** - Overkill for request-response pattern; SSE simpler
3. **Polling** - Poor UX, higher server load

**Sources**:
- [LlamaIndex.TS Streaming](https://docs.llamaindex.ai/en/stable/module_guides/deploying/query_engine/streaming/)
- [LlamaIndex.TS Chat Engine](https://docs.llamaindex.ai/en/stable/module_guides/deploying/chat_engines/)
- [LlamaIndex.TS GitHub](https://github.com/run-llama/LlamaIndexTS)

---

## 2. Qwen3 Model Integration

### 2.1 Qwen3-Embedding-8B Integration

**Decision**: Use Qwen3-Embedding-8B via OpenAI-compatible API served by vLLM or through a lightweight embedding server, integrated as a custom embedding model in LlamaIndex.TS.

**Rationale**:
- Qwen3-Embedding-8B ranks #1 on MTEB multilingual leaderboard (score 70.58 as of June 2025)
- Supports 100+ languages, critical for Chinese language academic content
- 8192 token maximum length, suitable for longer passages
- Consistent tokenization with Qwen3-32B main LLM

**Implementation Pattern**:
```typescript
import { BaseEmbedding } from "llamaindex";

class Qwen3Embedding extends BaseEmbedding {
  private baseURL: string;
  private modelName: string;

  constructor(options: { baseURL: string; modelName?: string }) {
    super();
    this.baseURL = options.baseURL;
    this.modelName = options.modelName ?? "Qwen/Qwen3-Embedding-8B";
  }

  async getQueryEmbedding(query: string): Promise<number[]> {
    const response = await fetch(`${this.baseURL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.modelName,
        input: query,
      }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    return this.getQueryEmbedding(text);
  }

  async getTextEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseURL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.modelName,
        input: texts,
      }),
    });
    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  }
}

// Usage
Settings.embedModel = new Qwen3Embedding({
  baseURL: "http://localhost:8001/v1", // Separate embedding server
});
```

**Alternatives Considered**:
1. **OpenAI text-embedding-3-small** - External dependency, cost, data privacy concerns
2. **Ollama qwen3-embedding:8b** - Simpler setup but less control over batching
3. **Sentence Transformers local** - Additional Python dependency in TypeScript stack

**Sources**:
- [Qwen3-Embedding-8B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [Qwen3-Embedding GitHub](https://github.com/QwenLM/Qwen3-Embedding)
- [Qwen LlamaIndex Documentation](https://qwen.readthedocs.io/en/latest/framework/LlamaIndex.html)
- [Supercharging Retrieval with Qwen](https://regolo.ai/supercharging-retrieval-with-qwen-and-llamaindex-a-hands-on-guide/)

---

### 2.2 Qwen3-Reranker-4B Integration

**Decision**: Implement a custom `NodePostprocessor` in LlamaIndex.TS that calls the Qwen3-Reranker-4B cross-encoder model for relevance scoring.

**Rationale**:
- Two-stage retrieval (retrieve then rerank) is state-of-the-art for RAG
- Qwen3-Reranker-4B is a cross-encoder fine-tuned for relevance scoring
- Reranking improves accuracy by 15-30% according to research
- The model scores query-document pairs by predicting likelihood of "yes" vs "no" for relevance

**Implementation Pattern**:
```typescript
import { BaseNodePostprocessor, NodeWithScore, QueryBundle } from "llamaindex";

interface RerankerOptions {
  baseURL: string;
  modelName?: string;
  topN: number;
}

class Qwen3Reranker extends BaseNodePostprocessor {
  private baseURL: string;
  private modelName: string;
  private topN: number;

  constructor(options: RerankerOptions) {
    super();
    this.baseURL = options.baseURL;
    this.modelName = options.modelName ?? "Qwen/Qwen3-Reranker-4B";
    this.topN = options.topN;
  }

  async postprocessNodes(
    nodes: NodeWithScore[],
    queryBundle: QueryBundle
  ): Promise<NodeWithScore[]> {
    const query = queryBundle.queryStr;

    // Create query-document pairs for scoring
    const pairs = nodes.map(n => ({
      query,
      document: n.node.getContent(),
    }));

    // Call reranker API
    const response = await fetch(`${this.baseURL}/v1/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.modelName,
        query,
        documents: pairs.map(p => p.document),
      }),
    });

    const scores = await response.json();

    // Update scores and sort
    const rerankedNodes = nodes.map((node, i) => ({
      ...node,
      score: scores.results[i].relevance_score,
    }));

    return rerankedNodes
      .sort((a, b) => b.score - a.score)
      .slice(0, this.topN);
  }
}

// Usage in query engine
const queryEngine = index.asQueryEngine({
  retriever: hybridRetriever,
  nodePostprocessors: [
    new Qwen3Reranker({
      baseURL: "http://localhost:8002/v1",
      topN: 5,
    }),
  ],
});
```

**Alternatives Considered**:
1. **JinaAI Reranker** - External API, cost, latency
2. **MixedbreadAI Reranker** - External API dependency
3. **No reranking** - Significantly lower retrieval quality

**Sources**:
- [Hands-on RAG with Qwen3 Reranker and Milvus](https://milvus.io/blog/hands-on-rag-with-qwen3-embedding-and-reranking-models-using-milvus.md)
- [RAG with Qwen3 Embedding and Reranker](https://kaitchup.substack.com/p/rag-with-qwen3-embeddings-and-qwen3)
- [LlamaIndex Node Postprocessors](https://developers.llamaindex.ai/typescript/framework/modules/rag/node_postprocessors/)
- [Qwen3 Embedding Paper](https://arxiv.org/html/2506.05176v1)

---

## 3. Content-Aware Chunking

### 3.1 Strategy Selection

**Decision**: Implement a hybrid chunking strategy combining:
1. **Structure-aware parsing** using `MarkdownNodeParser` for header-based splitting
2. **Semantic boundary detection** for content between headers
3. **Special element preservation** for code blocks, LaTeX, and tables

**Rationale**:
- Project constitution mandates: "Code blocks MUST NOT be split across chunks; Mathematical formulas MUST remain intact; Tables MUST NOT be fragmented"
- Academic competition content (ACM, math modeling) heavily features code, formulas, and tables
- Header-based splitting preserves document hierarchy and context
- Semantic chunking ensures coherent meaning units

**Implementation Pattern**:
```typescript
import { MarkdownNodeParser, Document, BaseNode } from "llamaindex";

interface ChunkingOptions {
  targetChunkSize: number;  // 512-1024 tokens
  chunkOverlap: number;     // 50-100 tokens
  preserveCodeBlocks: boolean;
  preserveLatex: boolean;
  preserveTables: boolean;
}

class ContentAwareChunker {
  private options: ChunkingOptions;
  private tokenizer: Tokenizer;

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = {
      targetChunkSize: 768, // Middle of 512-1024 range
      chunkOverlap: 64,
      preserveCodeBlocks: true,
      preserveLatex: true,
      preserveTables: true,
      ...options,
    };
  }

  async chunkDocument(doc: Document): Promise<BaseNode[]> {
    const content = doc.getText();
    const chunks: string[] = [];

    // Step 1: Identify and protect special elements
    const protectedElements = this.extractProtectedElements(content);
    const placeholderContent = this.replacewithPlaceholders(
      content,
      protectedElements
    );

    // Step 2: Split by headers first (structure-aware)
    const sections = this.splitByHeaders(placeholderContent);

    // Step 3: For each section, apply semantic chunking
    for (const section of sections) {
      const sectionChunks = this.semanticChunk(
        section.content,
        section.headerPath
      );
      chunks.push(...sectionChunks);
    }

    // Step 4: Restore protected elements
    return chunks.map(chunk =>
      this.restoreProtectedElements(chunk, protectedElements)
    ).map(text => new TextNode({ text, metadata: doc.metadata }));
  }

  private extractProtectedElements(content: string): ProtectedElement[] {
    const elements: ProtectedElement[] = [];

    // Code blocks: ```...``` or indented blocks
    const codeBlockRegex = /```[\s\S]*?```|(?:^(?:    |\t).*$\n?)+/gm;

    // LaTeX: $...$ or $$...$$ or \[...\] or \(...\)
    const latexRegex = /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;

    // Tables: | header | header | style rows
    const tableRegex = /(?:^\|.*\|$\n?)+/gm;

    // Extract and store with placeholders
    // ... implementation details

    return elements;
  }

  private splitByHeaders(content: string): Section[] {
    // Split on markdown headers (# ## ### etc.)
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;
    // ... implementation
  }

  private semanticChunk(content: string, headerPath: string[]): string[] {
    // Use sentence boundaries when possible
    // Respect token limits
    // Add overlap for context continuity
    // Include header path in metadata
  }
}
```

**Token Counting Approach**:
```typescript
// Use tiktoken or simple word-based estimation
function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for Chinese
  const englishChars = text.replace(/[\u4e00-\u9fff]/g, '').length;
  const chineseChars = text.length - englishChars;
  return Math.ceil(englishChars / 4 + chineseChars / 2);
}
```

**Alternatives Considered**:
1. **Fixed-size chunking** - Breaks semantic units, splits code/formulas
2. **SentenceSplitter only** - Doesn't preserve document structure
3. **LangChain MarkdownTextSplitter** - Python-based, doesn't handle all edge cases

**Key Considerations**:
- Code blocks within fenced regions (```) must track state
- Nested LaTeX environments require balanced delimiter matching
- Tables may contain code or LaTeX that needs recursive protection
- Chinese content has different token-to-character ratios

**Sources**:
- [LlamaIndex Node Parsers](https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/modules/)
- [Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)
- [Semantic Chunking in Complex Documents](https://gal-lellouche.medium.com/semantic-chunking-in-complex-documents-cc49b0cde4ea)
- [Optimizing RAG Context for Technical Docs](https://dev.to/oleh-halytskyi/optimizing-rag-context-chunking-and-summarization-for-technical-docs-3pel)

---

## 4. Hybrid Retrieval Fusion

### 4.1 Retrieval Architecture

**Decision**: Implement parallel retrieval from Milvus (vector) and Neo4j (graph) with results merged via Reciprocal Rank Fusion (RRF) before reranking.

**Rationale**:
- Constitution mandates: "Every knowledge retrieval operation MUST utilize both vector search and knowledge graph traversal in parallel"
- RRF is robust, requires no tuning, and handles disparate score distributions
- Graph retrieval captures structural relationships (prerequisites, comparisons) that vector search misses
- Reranking as final stage ensures highest quality results

**Pipeline Architecture**:
```
User Query
    │
    ├─────────────────┬─────────────────┐
    ▼                 ▼                 ▼
[Milvus]        [Neo4j Cypher]    [Neo4j Vector]
Vector Search   Graph Traversal   (if available)
    │                 │                 │
    └────────┬────────┴─────────────────┘
             ▼
    [RRF Fusion] ← Rank-based combination
             │
             ▼
    [Qwen3-Reranker-4B] ← Cross-encoder scoring
             │
             ▼
    [Top-K Results]
             │
             ▼
    [Qwen3-32B LLM] ← Response generation
```

---

### 4.2 Reciprocal Rank Fusion (RRF) Implementation

**Decision**: Implement RRF with k=60 as the primary fusion algorithm, with optional weighted RRF for tuning vector vs graph contribution.

**Rationale**:
- RRF formula: `score(d) = Σ 1/(k + rank(d))` for each ranker
- k=60 is empirically robust across different retrieval systems
- RRF uses rank positions, not raw scores, avoiding normalization issues
- Simple, effective, and widely adopted (OpenSearch, Elasticsearch, Azure AI Search, Milvus)

**Implementation Pattern**:
```typescript
interface RankedResult {
  nodeId: string;
  node: BaseNode;
  score: number;
  source: "vector" | "graph";
}

interface RRFOptions {
  k: number;                    // Default: 60
  vectorWeight?: number;        // Default: 1.0
  graphWeight?: number;         // Default: 1.0
}

function reciprocalRankFusion(
  vectorResults: RankedResult[],
  graphResults: RankedResult[],
  options: RRFOptions = { k: 60 }
): NodeWithScore[] {
  const { k, vectorWeight = 1.0, graphWeight = 1.0 } = options;
  const scoreMap = new Map<string, { node: BaseNode; score: number }>();

  // Process vector results
  vectorResults.forEach((result, rank) => {
    const rrfScore = vectorWeight * (1 / (k + rank + 1));
    const existing = scoreMap.get(result.nodeId);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(result.nodeId, { node: result.node, score: rrfScore });
    }
  });

  // Process graph results
  graphResults.forEach((result, rank) => {
    const rrfScore = graphWeight * (1 / (k + rank + 1));
    const existing = scoreMap.get(result.nodeId);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(result.nodeId, { node: result.node, score: rrfScore });
    }
  });

  // Sort by combined RRF score
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ node, score }) => ({ node, score }));
}
```

**Alternatives Considered**:
1. **Min-Max Score Normalization** - Requires knowing score distributions, sensitive to outliers
2. **Linear Combination** - Needs tuned weights, scores not directly comparable
3. **Learn-to-Rank (LTR)** - Requires training data, complex setup

**Sources**:
- [RRF Original Paper (Cormack et al., 2009)](https://plg.uwaterloo.ca/~gvcormac/rrf.pdf)
- [OpenSearch RRF for Hybrid Search](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
- [Milvus RRF Ranker Documentation](https://milvus.io/docs/rrf-ranker.md)
- [Elasticsearch Weighted RRF](https://www.elastic.co/search-labs/blog/weighted-reciprocal-rank-fusion-rrf)
- [Azure AI Search Hybrid Scoring](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)

---

### 4.3 Neo4j Knowledge Graph Retrieval

**Decision**: Use a combination of `VectorContextRetriever` and custom Cypher queries for graph traversal, leveraging LlamaIndex's Property Graph Index integration.

**Rationale**:
- Neo4j integration supports: vector similarity, text-to-Cypher, and custom Cypher templates
- Graph traversal captures relationships like: `(Concept)-[:PREREQUISITE]->(Concept)`, `(Problem)-[:USES_TECHNIQUE]->(Algorithm)`
- LlamaIndex Property Graph Index provides modular retriever composition

**Implementation Pattern**:
```typescript
import { PropertyGraphIndex, CypherTemplateRetriever } from "llamaindex";

// Custom graph retriever for prerequisite chains
class PrerequisiteRetriever extends BaseRetriever {
  private neo4jDriver: Driver;
  private maxDepth: number;

  async _retrieve(queryBundle: QueryBundle): Promise<NodeWithScore[]> {
    const session = this.neo4jDriver.session();

    try {
      // Find concepts matching query
      const conceptResult = await session.run(`
        CALL db.index.fulltext.queryNodes("conceptIndex", $query)
        YIELD node, score
        RETURN node, score
        LIMIT 5
      `, { query: queryBundle.queryStr });

      // Traverse prerequisite relationships
      const traversalResult = await session.run(`
        MATCH (c:Concept)-[:PREREQUISITE*1..${this.maxDepth}]->(prereq:Concept)
        WHERE c.name IN $concepts
        RETURN DISTINCT prereq,
               length(shortestPath((c)-[:PREREQUISITE*]->(prereq))) as depth
        ORDER BY depth
      `, { concepts: conceptResult.records.map(r => r.get('node').properties.name) });

      // Convert to NodeWithScore
      return traversalResult.records.map((record, index) => ({
        node: new TextNode({
          text: record.get('prereq').properties.content,
          metadata: {
            name: record.get('prereq').properties.name,
            depth: record.get('depth'),
            source: 'graph_prerequisite',
          },
        }),
        score: 1 / (1 + record.get('depth')), // Closer prerequisites score higher
      }));
    } finally {
      await session.close();
    }
  }
}

// Combine multiple retrievers
class HybridRetriever extends BaseRetriever {
  private milvusRetriever: MilvusRetriever;
  private graphRetriever: PrerequisiteRetriever;
  private rrfOptions: RRFOptions;

  async _retrieve(queryBundle: QueryBundle): Promise<NodeWithScore[]> {
    // Parallel retrieval
    const [vectorResults, graphResults] = await Promise.all([
      this.milvusRetriever._retrieve(queryBundle),
      this.graphRetriever._retrieve(queryBundle),
    ]);

    // RRF fusion
    return reciprocalRankFusion(vectorResults, graphResults, this.rrfOptions);
  }
}
```

**Graph Query Patterns for Competition Tutoring**:
```cypher
-- Find related algorithms for a problem type
MATCH (p:Problem {type: $problemType})-[:SOLVED_BY]->(a:Algorithm)
RETURN a.name, a.complexity, a.description

-- Get comparison between two techniques
MATCH (a:Technique {name: $technique1})-[r:COMPARED_TO]-(b:Technique {name: $technique2})
RETURN r.comparison, r.useCase

-- Find learning path for a concept
MATCH path = (start:Concept {name: $concept})-[:PREREQUISITE*]->(end:Concept)
WHERE NOT (end)-[:PREREQUISITE]->()
RETURN path
```

**Sources**:
- [LlamaIndex Neo4j Labs Integration](https://neo4j.com/labs/genai-ecosystem/llamaindex/)
- [Property Graph Index Customization](https://neo4j.com/blog/developer/property-graph-index-llamaindex/)
- [GraphRAG Design Patterns](https://gradientflow.com/graphrag-design-patterns/)
- [Building Knowledge Graph Agents](https://www.llamaindex.ai/blog/building-knowledge-graph-agents-with-llamaindex-workflows)

---

### 4.4 Score Normalization (Alternative to RRF)

**Decision**: If weighted combination is needed instead of RRF, use min-max normalization with theoretical bounds.

**Rationale**:
- Min-max normalizes to [0,1] range: `(score - min) / (max - min)`
- Theoretical min-max (tmm) uses known bounds: cosine similarity [-1,1], BM25 [0, ~25]
- Useful when explicit weight control between vector and graph is required

**Implementation Pattern**:
```typescript
type NormalizationMethod = "min-max" | "theoretical-min-max" | "z-score";

interface NormalizationConfig {
  method: NormalizationMethod;
  vectorBounds?: { min: number; max: number };  // For cosine: [-1, 1]
  graphBounds?: { min: number; max: number };   // For BM25: [0, 25]
}

function normalizeScores(
  results: RankedResult[],
  config: NormalizationConfig
): RankedResult[] {
  if (config.method === "min-max") {
    const scores = results.map(r => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    return results.map(r => ({
      ...r,
      score: (r.score - min) / range,
    }));
  }

  if (config.method === "theoretical-min-max") {
    const bounds = results[0].source === "vector"
      ? config.vectorBounds ?? { min: -1, max: 1 }
      : config.graphBounds ?? { min: 0, max: 25 };
    const range = bounds.max - bounds.min;

    return results.map(r => ({
      ...r,
      score: (r.score - bounds.min) / range,
    }));
  }

  // z-score normalization
  const scores = results.map(r => r.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(
    scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
  ) || 1;

  return results.map(r => ({
    ...r,
    score: (r.score - mean) / std,
  }));
}

function weightedCombination(
  vectorResults: RankedResult[],
  graphResults: RankedResult[],
  alpha: number = 0.7  // 70% vector, 30% graph
): NodeWithScore[] {
  // Normalize both result sets
  const normVector = normalizeScores(vectorResults, { method: "min-max" });
  const normGraph = normalizeScores(graphResults, { method: "min-max" });

  // Combine with weights
  const scoreMap = new Map<string, { node: BaseNode; score: number }>();

  normVector.forEach(r => {
    scoreMap.set(r.nodeId, { node: r.node, score: alpha * r.score });
  });

  normGraph.forEach(r => {
    const existing = scoreMap.get(r.nodeId);
    if (existing) {
      existing.score += (1 - alpha) * r.score;
    } else {
      scoreMap.set(r.nodeId, { node: r.node, score: (1 - alpha) * r.score });
    }
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score);
}
```

**Sources**:
- [Optimizing RAG with Hybrid Search & Reranking](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)
- [Hybrid Search Explained - Weaviate](https://weaviate.io/blog/hybrid-search-explained)
- [Weights in Hybrid Retrieval](https://medium.com/@autorag/weights-in-hybrid-retrieval-are-you-just-using-any-values-990fb8af6a27)

---

## 5. Summary: Recommended Technology Stack

| Component | Technology | Integration Method |
|-----------|------------|-------------------|
| **LLM** | Qwen3-32B via vLLM | `@llamaindex/openai` with custom `baseURL` |
| **Embeddings** | Qwen3-Embedding-8B | Custom `BaseEmbedding` class |
| **Reranker** | Qwen3-Reranker-4B | Custom `NodePostprocessor` class |
| **Vector DB** | Milvus | Custom `BaseRetriever` using existing `DatabaseManager` |
| **Graph DB** | Neo4j | Custom `BaseRetriever` with Cypher queries |
| **Chunking** | Custom Content-Aware | `MarkdownNodeParser` + custom special element handling |
| **Fusion** | RRF (k=60) | Custom implementation |
| **Streaming** | Native LlamaIndex.TS | `stream: true` with Hono response handler |

---

## 6. Open Questions / Next Steps

1. **Embedding Server**: Deploy Qwen3-Embedding-8B separately or co-locate with vLLM main server?
2. **Reranker API**: Standard `/v1/rerank` endpoint or custom implementation?
3. **Token Counting**: Use tiktoken (OpenAI) or implement Qwen-specific tokenizer?
4. **Caching Strategy**: Redis for embedding cache? Query result cache?
5. **Batch Processing**: How to handle bulk document ingestion efficiently?
6. **Testing**: What retrieval quality metrics to use (MRR, NDCG, recall@k)?

---

## References

### LlamaIndex.TS
- [LlamaIndex.TS Documentation](https://ts.llamaindex.ai/)
- [LlamaIndex.TS GitHub](https://github.com/run-llama/LlamaIndexTS)
- [Node Postprocessors](https://developers.llamaindex.ai/typescript/framework/modules/rag/node_postprocessors/)

### Qwen3 Models
- [Qwen3-32B HuggingFace](https://huggingface.co/Qwen/Qwen3-32B)
- [Qwen3-Embedding-8B HuggingFace](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [Qwen3-Embedding GitHub](https://github.com/QwenLM/Qwen3-Embedding)
- [Qwen vLLM Deployment](https://qwen.readthedocs.io/en/latest/deployment/vllm.html)

### Hybrid Search & Fusion
- [OpenSearch RRF](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
- [Milvus Reranking](https://milvus.io/docs/reranking.md)
- [Azure Hybrid Search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
- [Elasticsearch Weighted RRF](https://www.elastic.co/search-labs/blog/weighted-reciprocal-rank-fusion-rrf)

### Knowledge Graphs
- [Neo4j LlamaIndex Integration](https://neo4j.com/labs/genai-ecosystem/llamaindex/)
- [GraphRAG Design Patterns](https://gradientflow.com/graphrag-design-patterns/)
- [Advanced RAG with Neo4j](https://neo4j.com/blog/genai/advanced-rag-techniques/)

### Chunking
- [Pinecone Chunking Strategies](https://www.pinecone.io/learn/chunking-strategies/)
- [LlamaIndex Node Parsers](https://docs.llamaindex.ai/en/stable/module_guides/loading/node_parsers/modules/)
- [Evaluating Chunking Strategies](https://research.trychroma.com/evaluating-chunking)
