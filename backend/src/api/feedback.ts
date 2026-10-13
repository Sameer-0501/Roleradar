import { Response } from 'express';
import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { AuthenticatedRequest } from '../auth/middleware.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('feedback-api');

export async function submitBetaFeedbackHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!req.user || !req.user.is_beta_user) {
    res.status(403).json({ error: 'Forbidden. User is not a beta user.' });
    return;
  }

  const { job_id, category, message } = req.body;

  if (!category || !message) {
    res.status(400).json({ error: 'Category and message are required.' });
    return;
  }

  const validCategories = [
    'JOB_RELEVANCE',
    'JOB_CLOSED',
    'WRONG_ROLE',
    'WRONG_LOCATION',
    'WRONG_EXPERIENCE',
    'WORKPLACE_MISMATCH',
    'APPLICATION_URL_PROBLEM',
    'GENERAL_FEEDBACK',
    'OTHER',
  ];

  if (!validCategories.includes(category)) {
    res.status(400).json({ error: 'Invalid category.' });
    return;
  }

  try {
    const db = getDb();
    const result = await db.insert(schema.betaFeedback).values({
      user_id: req.user.id,
      job_id: job_id || null,
      category: category as any,
      message,
    }).returning();

    res.status(201).json({ message: 'Feedback submitted successfully', feedback: result[0] });
  } catch (error: any) {
    logger.error({ err: error }, 'Failed to submit beta feedback');
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
}
