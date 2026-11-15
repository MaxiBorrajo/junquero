import { isAddress } from "viem";
import type { EventHandler, StreamEvent } from "./eventStream";

const parse = <T>(args: string | null): T | null => {
  if (!args) return null;
  try {
    return JSON.parse(args) as T;
  } catch {
    return null;
  }
};

// Guarda la calificación de cada pago cerrado, para el historial público de quien trabajó.
export const ratingsHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (event.order_id === null) continue;
    if (event.name === "OrderSettled") {
      const args = parse<{ payee?: string; rating?: string | number }>(event.args);
      const rating = Number(args?.rating);
      if (args?.payee && isAddress(args.payee) && rating >= 1 && rating <= 5) {
        statements.push(db.prepare("INSERT OR IGNORE INTO payee_ratings (payee, order_id, idx, rating) VALUES (?, ?, -1, ?)").bind(args.payee.toLowerCase(), event.order_id, rating));
      }
    } else if (event.name === "MilestonePaid") {
      const args = parse<{ index?: string | number; rating?: string | number }>(event.args);
      const rating = Number(args?.rating);
      const index = Number(args?.index);
      if (Number.isInteger(index) && rating >= 1 && rating <= 5) {
        statements.push(
          db
            .prepare("INSERT OR IGNORE INTO payee_ratings (payee, order_id, idx, rating) SELECT payee, ?1, ?2, ?3 FROM order_parties WHERE order_id = ?1 AND payee IS NOT NULL")
            .bind(event.order_id, index, rating),
        );
      }
    }
  }
  return statements;
};
