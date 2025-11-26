import { db, outboxJobs } from '@/lib/db';
import { eq, lt, sql } from 'drizzle-orm';

export type OutboxStatus = 'pending' | 'processing' | 'failed' | 'done';

export interface OutboxJob {
  id: number;
  topic: string;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  nextRunAt: Date;
}

function toOutboxJob(row: typeof outboxJobs.$inferSelect): OutboxJob {
  return {
    id: row.id,
    topic: row.topic,
    payload: row.payload,
    status: row.status as OutboxStatus,
    attempts: row.attempts,
    nextRunAt: row.nextRunAt,
  };
}

class OutboxService {
  /**
   * Enqueue a job for async processing.
   */
  async enqueue(topic: string, payload: Record<string, unknown>, nextRunAt: Date = new Date()): Promise<OutboxJob> {
    const [job] = await db.insert(outboxJobs).values({
      topic,
      payload,
      nextRunAt,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return toOutboxJob(job);
  }

  /**
   * Fetch due jobs. Useful for cron-driven workers.
   */
  async fetchDue(limit: number = 25): Promise<OutboxJob[]> {
    const now = new Date();
    const rows = await db.select().from(outboxJobs)
      .where(lt(outboxJobs.nextRunAt, now))
      .orderBy(outboxJobs.nextRunAt)
      .limit(limit);
    return rows.map(toOutboxJob);
  }

  async markProcessing(id: number) {
    await db.update(outboxJobs).set({
      status: 'processing',
      attempts: sql`${outboxJobs.attempts} + 1`,
      updatedAt: new Date(),
    }).where(eq(outboxJobs.id, id));
  }

  async markDone(id: number) {
    await db.update(outboxJobs).set({
      status: 'done',
      updatedAt: new Date(),
    }).where(eq(outboxJobs.id, id));
  }

  async reschedule(id: number, delayMs: number) {
    const nextRunAt = new Date(Date.now() + delayMs);
    await db.update(outboxJobs).set({
      status: 'pending',
      nextRunAt,
      updatedAt: new Date(),
    }).where(eq(outboxJobs.id, id));
  }

  async markFailed(id: number, delayMs: number = 5 * 60 * 1000) {
    await this.reschedule(id, delayMs);
  }
}

export const outboxService = new OutboxService();
