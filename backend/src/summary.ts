// Los tres números que muestran los globitos de la app (chats sin leer, notificaciones nuevas, acuerdos por confirmar) en una
// sola consulta barata. Antes la app mantenía tres listas enteras al día solo para contarlas.
export interface Summary {
  unreadChats: number;
  unreadNotifications: number;
  pendingAgreements: number;
}

const UNREAD = "m.last_sender IS NOT NULL AND m.last_sender != ?1 AND m.last_seq > COALESCE(r.seq, 0)";

export async function summaryFor(db: D1Database, address: string, seenNotificationId: number, nowSeconds: number): Promise<Summary> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM (
            SELECT a.id FROM applications a JOIN chat_meta m ON m.application_id = a.id LEFT JOIN chat_reads r ON r.application_id = a.id AND r.address = ?1
              WHERE a.applicant = ?1 AND ${UNREAD}
            UNION ALL
            SELECT a.id FROM changas c JOIN applications a ON a.changa_id = c.id JOIN chat_meta m ON m.application_id = a.id LEFT JOIN chat_reads r ON r.application_id = a.id AND r.address = ?1
              WHERE c.owner = ?1 AND ${UNREAD}
          )) AS unread_chats,
         (SELECT COUNT(*) FROM notifications WHERE address = ?1 AND due_at <= ?2 AND id > ?3) AS unread_notifications,
         (SELECT COUNT(*) FROM agreements WHERE payee = ?1 AND status = 'pending' AND expiry > ?2) AS pending_agreements`,
    )
    .bind(address, nowSeconds, seenNotificationId)
    .first<{ unread_chats: number; unread_notifications: number; pending_agreements: number }>();
  return { unreadChats: row?.unread_chats ?? 0, unreadNotifications: row?.unread_notifications ?? 0, pendingAgreements: row?.pending_agreements ?? 0 };
}
