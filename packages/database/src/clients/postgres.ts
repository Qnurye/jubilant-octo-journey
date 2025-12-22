import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema/postgres';
import config from '../config/index';

// We use postgres.js driver as it is recommended for Drizzle + Bun/Node
let clientInstance: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getPostgresClient = () => {
  if (dbInstance) return dbInstance;

  const connectionString = `postgres://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`;

  console.log(`Connecting to Postgres at ${config.POSTGRES_HOST}:${config.POSTGRES_PORT}...`);
  
  // postgres.js handles connection pooling and reconnection automatically
  clientInstance = postgres(connectionString, {
    max: 10,
    onnotice: () => {}, // suppress notice logs
  });

  dbInstance = drizzle(clientInstance, { schema });
  return dbInstance;
};

export const closePostgresClient = async () => {
  if (clientInstance) {
    await clientInstance.end();
    clientInstance = null;
    dbInstance = null;
  }
};
