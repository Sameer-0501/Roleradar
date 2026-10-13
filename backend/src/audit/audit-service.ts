import { getDb } from '../database/connection.js';
import { schema } from '../database/index.js';
import { createLogger } from '../utils/logger.js';
import { sql, desc, eq, and } from 'drizzle-orm';



const log = createLogger('audit:service');

export const AuditActions = {
  ADMIN_SOURCE_SCAN: 'ADMIN_SOURCE_SCAN',
  ADMIN_JOB_REVERIFY: 'ADMIN_JOB_REVERIFY',
  ADMIN_NOTIFICATION_RETRY: 'ADMIN_NOTIFICATION_RETRY',
  ADMIN_AUTHORIZATION_FAILED: 'ADMIN_AUTHORIZATION_FAILED',
  ADMIN_RATE_LIMIT_EXCEEDED: 'ADMIN_RATE_LIMIT_EXCEEDED',
} as const;
export type AuditAction = typeof AuditActions[keyof typeof AuditActions];

export const AuditOutcomes = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  CONFLICT: 'CONFLICT',
  REJECTED: 'REJECTED',
} as const;
export type AuditOutcome = typeof AuditOutcomes[keyof typeof AuditOutcomes];

export interface LogAuditPayload {
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  /** Optional transaction client for atomic operations */
  tx?: any;
}

export interface AuditQueryOptions {
  page?: number;
  pageSize?: number;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  outcome?: AuditOutcome;
}

class AuditService {
  /**
   * Appends a new administrative audit log.
   * This is an append-only operation.
   */
  async logAdminAction(payload: LogAuditPayload): Promise<void> {
    try {
      const dbClient = payload.tx ?? getDb();

      await dbClient.insert(schema.adminAuditLogs).values({
        actor_user_id: payload.actorUserId,
        action: payload.action,
        resource_type: payload.resourceType,
        resource_id: payload.resourceId,
        outcome: payload.outcome,
        ip_address: payload.ipAddress,
        user_agent: payload.userAgent,
        metadata: payload.metadata ?? null,
      });

    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err), action: payload.action },
        'CRITICAL: Failed to write admin audit log'
      );
      // If we are in a transaction, re-throwing is required to roll back the entire operation
      if (payload.tx) {
        throw err;
      }
    }
  }

  /**
   * Retrieves audit logs for the admin dashboard.
   */
  async getAuditLogs(options: AuditQueryOptions) {
    const db = getDb();
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (options.action) conditions.push(eq(schema.adminAuditLogs.action, options.action));
    if (options.resourceType) conditions.push(eq(schema.adminAuditLogs.resource_type, options.resourceType));
    if (options.resourceId) conditions.push(eq(schema.adminAuditLogs.resource_id, options.resourceId));
    if (options.actorId) conditions.push(eq(schema.adminAuditLogs.actor_user_id, options.actorId));
    if (options.outcome) conditions.push(eq(schema.adminAuditLogs.outcome, options.outcome));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select()
      .from(schema.adminAuditLogs)
      .where(whereClause)
      .orderBy(desc(schema.adminAuditLogs.created_at))
      .limit(pageSize)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.adminAuditLogs)
      .where(whereClause);
      
    return {
      data: results,
      pagination: {
        page,
        pageSize,
        total: Number(count),
      },
    };
  }
}

export const auditService = new AuditService();
