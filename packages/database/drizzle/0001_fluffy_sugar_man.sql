CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"message_count" integer DEFAULT 0,
	"user_hash" text
);
--> statement-breakpoint
ALTER TABLE "rag_queries" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rag_queries" ADD CONSTRAINT "rag_queries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
