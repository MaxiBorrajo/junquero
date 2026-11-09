export const RETENTION_SECONDS = 30 * 24 * 3600;

export const isPurgeMinute = (scheduledTimeMs: number): boolean => {
  const at = new Date(scheduledTimeMs);
  return at.getUTCHours() === 3 && at.getUTCMinutes() === 0;
};

export async function purgeOldLogs(db: D1Database, nowSeconds: number, retentionSeconds = RETENTION_SECONDS) {
  const cutoff = nowSeconds - retentionSeconds;
  await db.batch([
    db.prepare("DELETE FROM relay_log WHERE created_at < ?").bind(cutoff),
    db.prepare("DELETE FROM task_log WHERE created_at < ?").bind(cutoff),
  ]);
}
