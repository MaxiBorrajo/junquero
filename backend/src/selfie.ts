export interface PendingSelfie {
  address: string;
  name: string;
  submittedAt: number;
}

export async function markSelfiePending(db: D1Database, address: string, nowSeconds: number): Promise<boolean> {
  const result = await db
    .prepare("UPDATE profiles SET selfie_status = 'pending', updated_at = ? WHERE address = ?")
    .bind(nowSeconds, address)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function listPendingSelfies(db: D1Database, limit: number): Promise<PendingSelfie[]> {
  const { results } = await db
    .prepare(
      `SELECT p.address AS address, p.name AS name, f.created_at AS submittedAt
       FROM profiles p JOIN files f ON f.owner = p.address AND f.kind = 'selfie'
       WHERE p.selfie_status = 'pending' ORDER BY f.created_at LIMIT ?`,
    )
    .bind(limit)
    .all<PendingSelfie>();
  return results;
}

export async function reviewSelfie(db: D1Database, address: string, approved: boolean, nowSeconds: number): Promise<boolean> {
  const result = await db
    .prepare("UPDATE profiles SET selfie_status = ?, updated_at = ? WHERE address = ? AND selfie_status = 'pending'")
    .bind(approved ? "approved" : "rejected", nowSeconds, address)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export const pendingSelfieHash = (db: D1Database, address: string) =>
  db.prepare("SELECT hash FROM files WHERE owner = ? AND kind = 'selfie'").bind(address).first<{ hash: string }>();
