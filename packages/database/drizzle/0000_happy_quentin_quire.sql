CREATE TABLE IF NOT EXISTS "analytics_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"user_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"format" text NOT NULL,
	"author" text,
	"file_hash" text,
	"file_size" integer,
	"chunk_count" integer DEFAULT 0,
	"status" text DEFAULT 'pending',
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ingested_at" timestamp,
	CONSTRAINT "documents_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid,
	"rating" integer,
	"comment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"status" text DEFAULT 'queued',
	"current_step" text,
	"progress" integer DEFAULT 0,
	"total_chunks" integer,
	"processed_chunks" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rag_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"query_hash" text,
	"execution_time_ms" integer,
	"milvus_hits" integer,
	"neo4j_hits" integer,
	"strategy_used" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retrieval_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid,
	"vector_search_ms" integer,
	"vector_result_count" integer,
	"vector_top_score" real,
	"vector_avg_score" real,
	"graph_traversal_ms" integer,
	"graph_result_count" integer,
	"graph_max_depth" integer,
	"concepts_found" integer,
	"fusion_ms" integer,
	"overlap_count" integer,
	"rrf_top_score" real,
	"rerank_ms" integer,
	"rerank_top_score" real,
	"confidence_threshold_met" boolean,
	"final_context_tokens" integer,
	"citation_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_query_id_rag_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "rag_queries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rag_queries" ADD CONSTRAINT "rag_queries_session_id_analytics_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "analytics_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "retrieval_metrics" ADD CONSTRAINT "retrieval_metrics_query_id_rag_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "rag_queries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
