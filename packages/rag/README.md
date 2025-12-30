# @jubilant/rag

Hybrid Retrieval-Augmented Generation pipeline for CompetitionTutor. Implements content-aware chunking, parallel vector+graph retrieval, RRF fusion, reranking, and streaming response generation with citations.

## Installation

```bash
bun add @jubilant/rag
```

## Features

- **Hybrid Retrieval**: Parallel vector search (Milvus) + graph traversal (Neo4j)
- **RRF Fusion**: Reciprocal Rank Fusion for combining retrieval results
- **Qwen3 Reranker**: Cross-encoder reranking with confidence thresholds
- **Content-Aware Chunking**: Preserves code blocks, formulas, and tables
- **Citation Tracking**: Links response claims to source materials
- **Streaming Responses**: SSE-based progressive token delivery
- **Error Handling**: Graceful degradation with user-friendly messages

## Quick Start

### Content-Aware Chunking

```typescript
import { ContentAwareChunker } from '@jubilant/rag';

const chunker = new ContentAwareChunker({
  minTokens: 512,
  maxTokens: 1024,
});

const chunks = chunker.chunk(documentContent, {
  documentId: 'doc-123',
  documentTitle: 'Algorithm Handbook',
  documentUrl: 'https://example.com/algorithms',
});

// Chunks preserve:
// - Code blocks (```...```) as atomic units
// - Mathematical formulas ($...$, $$...$$) intact
// - Tables (|...|) without fragmentation
```

### Hybrid Retrieval

```typescript
import { HybridRetriever, reciprocalRankFusion } from '@jubilant/rag';

// Create retriever with database clients
const retriever = new HybridRetriever(milvusClient, neo4jDriver);

// Retrieve with automatic RRF fusion
const results = await retriever.retrieve(query, {
  vectorTopK: 10,
  graphMaxHops: 2,
  strategy: 'balanced', // or 'vector_preferred', 'graph_preferred'
});

// Results include source tracking
results.forEach(r => {
  console.log(`${r.id}: score=${r.fusedScore}, source=${r.sources.join('+')}`);
});
```

### Reranking

```typescript
import { Qwen3Reranker } from '@jubilant/rag';

const reranker = new Qwen3Reranker({
  baseUrl: 'http://localhost:8002/v1',
  model: 'Qwen/Qwen3-Reranker-4B',
  topN: 5,
  confidenceThreshold: 0.6, // Below this triggers uncertainty
});

const ranked = await reranker.rerank(query, documents);

// Check confidence levels
ranked.forEach(r => {
  console.log(`${r.content}: score=${r.score}, above_threshold=${r.isAboveThreshold}`);
});

// Static confidence classification
const level = Qwen3Reranker.getConfidenceLevel(0.75); // 'medium'
```

### Citations

```typescript
import { createCitations, validateCitations, renumberCitations } from '@jubilant/rag';

// Create citations from ranked results
const citations = createCitations(rankedResults, { maxSnippetLength: 150 });
// Returns: [{ id: '[1]', chunkId, documentTitle, snippet, relevanceScore }]

// Validate all citations are present
const validation = validateCitations(responseText, citations);
if (!validation.valid) {
  console.error('Missing citations:', validation.missing);
}

// Renumber citations sequentially (removes gaps)
const { text, citations: renumbered } = renumberCitations(responseText, citations);
```

### Streaming Responses

```typescript
import {
  createTokenChunk,
  createCitationChunk,
  createConfidenceChunk,
  createDoneChunk,
  CitationDetector,
  StreamResponseBuilder,
} from '@jubilant/rag';

// Build streaming chunks
const chunks = [
  createTokenChunk('Dynamic programming '),
  createTokenChunk('breaks problems [1].'),
  createCitationChunk(citations[0]),
  createConfidenceChunk({ level: 'high', topScore: 0.85 }),
  createDoneChunk(),
];

// Detect citations in stream
const detector = new CitationDetector(citations);
const detected = detector.processToken('See [1] and [2].');

// Accumulate response
const builder = new StreamResponseBuilder();
builder.addToken('Hello ');
builder.addToken('world!');
console.log(builder.getText()); // "Hello world!"
```

### Prompt Building

```typescript
import {
  getConfidenceLevel,
  hasInsufficientEvidence,
  buildChatMessages,
  createQueryPrompt,
} from '@jubilant/rag';

// Check confidence
const level = getConfidenceLevel(0.55); // 'low'
const insufficient = hasInsufficientEvidence(0.55); // true (< 0.6)

// Build messages for LLM
const messages = buildChatMessages(
  query,
  rankedResults,
  citations,
  false, // isFollowUp
  level
);
```

### Document Parsing

```typescript
import {
  parseDocument,
  parseDocumentSafe,
  detectFormat,
  getSupportedFormats,
} from '@jubilant/rag';

// Auto-detect format and parse
const doc = await parseDocument('/path/to/file.md');
console.log(doc.content, doc.title, doc.format);

// Safe parsing (returns null on error)
const { document, error } = await parseDocumentSafe('/path/to/file.pdf');
if (error) {
  console.error(`Parse error: ${error.errorType} - ${error.message}`);
}

// Supported formats
getSupportedFormats(); // ['markdown', 'pdf', 'text']
```

### Triple Extraction

```typescript
import { parseTriples, validateTriple, VALID_PREDICATES } from '@jubilant/rag';

// Parse LLM response containing triples
const llmResponse = JSON.stringify([
  { subject: 'DP', predicate: 'PREREQUISITE', object: 'Recursion', confidence: 0.9 },
]);

const triples = parseTriples(llmResponse, 'chunk-123');
// Filters by MIN_CONFIDENCE (0.5) and validates predicates

// Valid predicates
console.log(VALID_PREDICATES);
// ['PREREQUISITE', 'RELATED_TO', 'PART_OF', 'EXAMPLE_OF', 'COMPARED_TO', ...]
```

### Error Handling

```typescript
import { LLMServiceError, classifyLLMError } from '@jubilant/rag';

try {
  await callLLM(prompt);
} catch (error) {
  const classified = classifyLLMError(error);

  console.log(classified.type);      // 'TIMEOUT_ERROR', 'RATE_LIMIT_ERROR', etc.
  console.log(classified.message);   // User-friendly message
  console.log(classified.isRetryable); // true for transient errors
}
```

## Configuration

Environment variables:

```bash
# Reranker
RERANKER_BASE_URL="http://localhost:8002/v1"
RERANKER_MODEL="Qwen/Qwen3-Reranker-4B"
RERANKER_API_KEY=""

# RAG settings
RAG_VECTOR_TOP_K="10"
RAG_GRAPH_MAX_HOPS="2"
RAG_RERANK_TOP_K="5"
RAG_CONFIDENCE_THRESHOLD="0.6"
RAG_CHUNK_SIZE="768"
```

## Testing

```bash
# Run all tests (363 tests)
bun test

# Run specific test files
bun test tests/unit/chunker.test.ts
bun test tests/unit/citations.test.ts
bun test tests/integration/query-pipeline.test.ts
```

## API Reference

### Modules

| Module | Exports |
|--------|---------|
| `ingestion/chunker` | `ContentAwareChunker`, `extractCodeBlocks`, `extractFormulas`, `extractTables`, `countTokens` |
| `ingestion/parsers` | `parseDocument`, `DocumentParseError`, `detectFormat`, `getSupportedFormats` |
| `ingestion/extractor` | `parseTriples`, `validateTriple`, `VALID_PREDICATES`, `MIN_CONFIDENCE` |
| `retrieval/hybrid` | `HybridRetriever`, `reciprocalRankFusion`, `RetrievalStrategy` |
| `reranking/reranker` | `Qwen3Reranker`, `createReranker` |
| `generation/citations` | `createCitations`, `validateCitations`, `renumberCitations`, `filterUsedCitations` |
| `generation/prompts` | `getConfidenceLevel`, `hasInsufficientEvidence`, `buildChatMessages` |
| `generation/streaming` | `createTokenChunk`, `CitationDetector`, `StreamResponseBuilder` |
| `generation/llm` | `LLMServiceError`, `classifyLLMError` |

### Types

```typescript
interface Chunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  chunkIndex: number;
  hasCode?: boolean;
  hasFormula?: boolean;
  hasTable?: boolean;
}

interface Citation {
  id: string;           // '[1]', '[2]', etc.
  chunkId: string;
  documentTitle: string;
  documentUrl: string;
  snippet: string;
  relevanceScore: number;
}

interface RankedResult {
  id: string;
  content: string;
  metadata: ChunkMetadata;
  rerankScore: number;
  originalScore: number;
  source: 'vector' | 'graph' | 'both';
}

type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

type LLMErrorType =
  | 'CONNECTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'MODEL_ERROR'
  | 'CONTEXT_LENGTH_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR';
```

## Constitution Compliance

This package implements:
- **FR-001 to FR-004**: Hybrid retrieval with parallel vector + graph search and RRF fusion
- **FR-006**: Citation linking claims to source materials
- **FR-007**: Uncertainty acknowledgment when confidence < 0.6
- **FR-008 to FR-010**: Content-aware chunking preserving code, formulas, tables
- **FR-011**: LLM-based triple extraction (not rule-based)
- **FR-012**: Support for Markdown, PDF, text formats
- **FR-014**: Graceful error handling with user-friendly messages
- **FR-015**: 512-1024 token chunk targeting
- **FR-016**: Streaming response support
