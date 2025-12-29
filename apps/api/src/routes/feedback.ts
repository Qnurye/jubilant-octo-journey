/**
 * Feedback Routes
 *
 * Endpoints for collecting user feedback on query responses:
 * - POST /api/feedback - Submit feedback for a query
 *
 * @module apps/api/routes/feedback
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, postgresSchema, eq } from '@jubilant/database';
import type { ErrorResponse } from '@jubilant/rag';

const feedback = new Hono();

// ============================================================================
// Validation Schemas (T077)
// ============================================================================

/**
 * Feedback request schema with validation rules:
 * - queryId: Must be a valid UUID and must exist in rag_queries table
 * - rating: Must be 1-5
 * - comment: Optional, max 2000 characters
 */
const feedbackSchema = z.object({
  queryId: z
    .string()
    .uuid('Invalid query ID format')
    .min(1, 'Query ID is required'),
  rating: z
    .number()
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  comment: z
    .string()
    .max(2000, 'Comment must be 2000 characters or less')
    .optional(),
});

/**
 * Response type for successful feedback submission
 */
interface FeedbackResponse {
  success: true;
  feedbackId: string;
  message: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a query exists in the rag_queries table
 */
async function queryExists(queryId: string): Promise<boolean> {
  const results = await db.postgres
    .select({ id: postgresSchema.ragQueries.id })
    .from(postgresSchema.ragQueries)
    .where(eq(postgresSchema.ragQueries.id, queryId))
    .limit(1);

  return results.length > 0;
}

/**
 * Check if feedback already exists for a query
 */
async function feedbackExists(queryId: string): Promise<boolean> {
  const results = await db.postgres
    .select({ id: postgresSchema.feedbackEvents.id })
    .from(postgresSchema.feedbackEvents)
    .where(eq(postgresSchema.feedbackEvents.queryId, queryId))
    .limit(1);

  return results.length > 0;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/feedback
 *
 * Submit feedback for a query response.
 * Validates that:
 * - queryId is a valid UUID
 * - queryId exists in rag_queries table
 * - rating is between 1 and 5
 * - No duplicate feedback for the same query
 */
feedback.post(
  '/',
  zValidator('json', feedbackSchema, (result, c) => {
    if (!result.success) {
      const errorResponse: ErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Invalid feedback request',
        details: result.error.flatten().fieldErrors,
      };
      return c.json(errorResponse, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid('json');

    try {
      // Validate queryId exists (T077)
      const exists = await queryExists(body.queryId);
      if (!exists) {
        const errorResponse: ErrorResponse = {
          error: 'QUERY_NOT_FOUND',
          message: `Query ${body.queryId} not found. Feedback can only be submitted for existing queries.`,
        };
        return c.json(errorResponse, 404);
      }

      // Check for duplicate feedback (optional - could also allow updates)
      const duplicate = await feedbackExists(body.queryId);
      if (duplicate) {
        const errorResponse: ErrorResponse = {
          error: 'FEEDBACK_EXISTS',
          message: 'Feedback has already been submitted for this query.',
        };
        return c.json(errorResponse, 409);
      }

      // Store feedback in feedbackEvents table (T078)
      const feedbackId = crypto.randomUUID();
      await db.postgres.insert(postgresSchema.feedbackEvents).values({
        id: feedbackId,
        queryId: body.queryId,
        rating: body.rating,
        comment: body.comment || null,
        createdAt: new Date(),
      });

      const response: FeedbackResponse = {
        success: true,
        feedbackId,
        message: 'Feedback submitted successfully. Thank you for your input!',
      };

      return c.json(response, 201);
    } catch (error) {
      console.error('Feedback submission error:', error);

      const errorResponse: ErrorResponse = {
        error: 'FEEDBACK_ERROR',
        message:
          error instanceof Error ? error.message : 'Failed to submit feedback',
      };

      return c.json(errorResponse, 500);
    }
  }
);

/**
 * GET /api/feedback/:queryId
 *
 * Get feedback for a specific query (optional endpoint for debugging/analytics).
 */
feedback.get('/:queryId', async (c) => {
  const queryId = c.req.param('queryId');

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(queryId)) {
    const errorResponse: ErrorResponse = {
      error: 'INVALID_QUERY_ID',
      message: 'Query ID must be a valid UUID',
    };
    return c.json(errorResponse, 400);
  }

  try {
    const results = await db.postgres
      .select()
      .from(postgresSchema.feedbackEvents)
      .where(eq(postgresSchema.feedbackEvents.queryId, queryId))
      .limit(1);

    if (results.length === 0) {
      const errorResponse: ErrorResponse = {
        error: 'FEEDBACK_NOT_FOUND',
        message: `No feedback found for query ${queryId}`,
      };
      return c.json(errorResponse, 404);
    }

    const feedbackRecord = results[0];
    return c.json(
      {
        feedbackId: feedbackRecord.id,
        queryId: feedbackRecord.queryId,
        rating: feedbackRecord.rating,
        comment: feedbackRecord.comment,
        createdAt: feedbackRecord.createdAt,
      },
      200
    );
  } catch (error) {
    console.error('Feedback retrieval error:', error);

    const errorResponse: ErrorResponse = {
      error: 'FEEDBACK_RETRIEVAL_ERROR',
      message:
        error instanceof Error ? error.message : 'Failed to retrieve feedback',
    };

    return c.json(errorResponse, 500);
  }
});

export default feedback;
