-- Initial Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- We use Drizzle for schema management usually, but this init script 
-- ensures the database and extension are ready if needed by other tools.
-- Drizzle will create tables.
