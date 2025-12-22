import { z } from 'zod';

const envSchema = z.object({
  // Milvus Configuration
  MILVUS_HOST: z.string().default('localhost'),
  MILVUS_PORT: z.string().default('19530'),
  MILVUS_USER: z.string().optional(),
  MILVUS_PASSWORD: z.string().optional(),
  
  // Neo4j Configuration
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1, "NEO4J_PASSWORD is required"),
  
  // Postgres Configuration
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().default('5432'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().min(1, "POSTGRES_PASSWORD is required"),
  POSTGRES_DB: z.string().default('jubilant_db'),
  
  // App Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type DatabaseConfig = z.infer<typeof envSchema>;

// Parse and validate process.env with nicer error handling.
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => {
      const path = issue.path.join('.') || 'ROOT';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');

  const message = `Invalid environment configuration:\n${issues}`;
  console.error(message);
  throw new Error(message);
}

const config: DatabaseConfig = parsedEnv.data;

export default config;
