/**
 * Conversation Routes
 *
 * Endpoints for managing multi-turn conversations:
 * - POST /api/conversations - Create a new conversation
 *
 * @module apps/api/routes/conversations
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, postgresSchema } from '@jubilant/database';
import type { ErrorResponse } from '@jubilant/rag';

const conversations = new Hono();

// ============================================================================
// Validation Schemas
// ============================================================================

const createConversationSchema = z.object({
  id: z.string().uuid().optional(),
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(100, 'Title exceeds maximum length of 100 characters'),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/conversations
 *
 * Create a new conversation session.
 */
conversations.post(
  '/',
  zValidator('json', createConversationSchema, (result, c) => {
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid conversation request',
        details: result.error.flatten().fieldErrors,
      };
      return c.json(errorResponse, 400);
    }
  }),
  async (c) => {
    try {
      if (!db.isConnected) {
        const errorResponse: ErrorResponse = {
          error: 'SERVICE_UNAVAILABLE',
          message: 'Database not connected',
        };
        return c.json(errorResponse, 503);
      }

      const body = c.req.valid('json');

      const [conversation] = await db.postgres
        .insert(postgresSchema.conversations)
        .values({
          ...(body.id ? { id: body.id } : {}),
          title: body.title,
        })
        .returning({
          id: postgresSchema.conversations.id,
          title: postgresSchema.conversations.title,
          createdAt: postgresSchema.conversations.createdAt,
        });

      return c.json(conversation, 201);
    } catch (error) {
      console.error('Failed to create conversation:', error);

      const errorResponse: ErrorResponse = {
        error: 'CONVERSATION_CREATE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to create conversation',
      };

      return c.json(errorResponse, 500);
    }
  }
);

export default conversations;
