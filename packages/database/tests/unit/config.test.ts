import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// We need to test the schema validation logic without actually importing the config
// (which parses process.env on import). So we replicate the schema here for testing.
const envSchema = z.object({
  MILVUS_HOST: z.string().default('localhost'),
  MILVUS_PORT: z.string().default('19530'),
  MILVUS_USER: z.string().optional(),
  MILVUS_PASSWORD: z.string().optional(),
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1, 'NEO4J_PASSWORD is required'),
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.string().default('5432'),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().min(1, 'POSTGRES_PASSWORD is required'),
  POSTGRES_DB: z.string().default('jubilant_db'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

describe('Database Configuration Validation', () => {
  describe('Milvus Configuration', () => {
    it('should use default host and port when not provided', () => {
      const result = envSchema.parse({
        NEO4J_PASSWORD: 'test',
        POSTGRES_PASSWORD: 'test',
      });
      expect(result.MILVUS_HOST).toBe('localhost');
      expect(result.MILVUS_PORT).toBe('19530');
    });

    it('should accept custom host and port', () => {
      const result = envSchema.parse({
        MILVUS_HOST: 'milvus.example.com',
        MILVUS_PORT: '19531',
        NEO4J_PASSWORD: 'test',
        POSTGRES_PASSWORD: 'test',
      });
      expect(result.MILVUS_HOST).toBe('milvus.example.com');
      expect(result.MILVUS_PORT).toBe('19531');
    });

    it('should allow optional username and password', () => {
      const result = envSchema.parse({
        MILVUS_USER: 'admin',
        MILVUS_PASSWORD: 'secret',
        NEO4J_PASSWORD: 'test',
        POSTGRES_PASSWORD: 'test',
      });
      expect(result.MILVUS_USER).toBe('admin');
      expect(result.MILVUS_PASSWORD).toBe('secret');
    });
  });

  describe('Neo4j Configuration', () => {
    it('should use default URI and user when not provided', () => {
      const result = envSchema.parse({
        NEO4J_PASSWORD: 'testpassword',
        POSTGRES_PASSWORD: 'test',
      });
      expect(result.NEO4J_URI).toBe('bolt://localhost:7687');
      expect(result.NEO4J_USER).toBe('neo4j');
    });

    it('should require NEO4J_PASSWORD', () => {
      expect(() =>
        envSchema.parse({
          POSTGRES_PASSWORD: 'test',
        })
      ).toThrow();
    });

    it('should reject empty NEO4J_PASSWORD', () => {
      expect(() =>
        envSchema.parse({
          NEO4J_PASSWORD: '',
          POSTGRES_PASSWORD: 'test',
        })
      ).toThrow('NEO4J_PASSWORD is required');
    });

    it('should accept custom URI', () => {
      const result = envSchema.parse({
        NEO4J_URI: 'bolt://neo4j.example.com:7687',
        NEO4J_PASSWORD: 'secret',
        POSTGRES_PASSWORD: 'test',
      });
      expect(result.NEO4J_URI).toBe('bolt://neo4j.example.com:7687');
    });
  });

  describe('Postgres Configuration', () => {
    it('should use defaults for host, port, user, and db', () => {
      const result = envSchema.parse({
        NEO4J_PASSWORD: 'test',
        POSTGRES_PASSWORD: 'testpassword',
      });
      expect(result.POSTGRES_HOST).toBe('localhost');
      expect(result.POSTGRES_PORT).toBe('5432');
      expect(result.POSTGRES_USER).toBe('postgres');
      expect(result.POSTGRES_DB).toBe('jubilant_db');
    });

    it('should require POSTGRES_PASSWORD', () => {
      expect(() =>
        envSchema.parse({
          NEO4J_PASSWORD: 'test',
        })
      ).toThrow();
    });

    it('should reject empty POSTGRES_PASSWORD', () => {
      expect(() =>
        envSchema.parse({
          NEO4J_PASSWORD: 'test',
          POSTGRES_PASSWORD: '',
        })
      ).toThrow('POSTGRES_PASSWORD is required');
    });

    it('should accept custom configuration', () => {
      const result = envSchema.parse({
        POSTGRES_HOST: 'db.example.com',
        POSTGRES_PORT: '5433',
        POSTGRES_USER: 'admin',
        POSTGRES_PASSWORD: 'secret',
        POSTGRES_DB: 'myapp',
        NEO4J_PASSWORD: 'test',
      });
      expect(result.POSTGRES_HOST).toBe('db.example.com');
      expect(result.POSTGRES_PORT).toBe('5433');
      expect(result.POSTGRES_USER).toBe('admin');
      expect(result.POSTGRES_DB).toBe('myapp');
    });
  });

  describe('NODE_ENV Configuration', () => {
    it('should default to development', () => {
      const result = envSchema.parse({
        NEO4J_PASSWORD: 'test',
        POSTGRES_PASSWORD: 'test',
      });
      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept valid environments', () => {
      for (const env of ['development', 'production', 'test']) {
        const result = envSchema.parse({
          NODE_ENV: env,
          NEO4J_PASSWORD: 'test',
          POSTGRES_PASSWORD: 'test',
        });
        expect(result.NODE_ENV).toBe(env);
      }
    });

    it('should reject invalid environments', () => {
      expect(() =>
        envSchema.parse({
          NODE_ENV: 'staging',
          NEO4J_PASSWORD: 'test',
          POSTGRES_PASSWORD: 'test',
        })
      ).toThrow();
    });
  });

  describe('Complete Configuration', () => {
    it('should parse a complete valid configuration', () => {
      const config = {
        MILVUS_HOST: 'milvus.local',
        MILVUS_PORT: '19530',
        MILVUS_USER: 'root',
        MILVUS_PASSWORD: 'milvus',
        NEO4J_URI: 'bolt://neo4j.local:7687',
        NEO4J_USER: 'neo4j',
        NEO4J_PASSWORD: 'password',
        POSTGRES_HOST: 'postgres.local',
        POSTGRES_PORT: '5432',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres',
        POSTGRES_DB: 'jubilant_db',
        NODE_ENV: 'production',
      };

      const result = envSchema.parse(config);
      expect(result).toEqual(config);
    });

    it('should fail fast when multiple required fields are missing', () => {
      expect(() => envSchema.parse({})).toThrow();
    });
  });
});
