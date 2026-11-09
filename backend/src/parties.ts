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

export const partiesHandler: EventHandler = (db: D1Database, events: StreamEvent[]) => {
  const statements: D1PreparedStatement[] = [];
  for (const event of events) {
    if (event.name === "OrderCreated" && event.order_id !== null) {
      const payer = parse<{ payer?: string }>(event.args)?.payer;
      if (payer && isAddress(payer)) {
        statements.push(
          db
            .prepare("INSERT INTO order_parties (order_id, payer) VALUES (?, ?) ON CONFLICT(order_id) DO UPDATE SET payer = excluded.payer")
            .bind(event.order_id, payer.toLowerCase()),
        );
      }
    } else if ((event.name === "OrderAgreed" || event.name === "OrderReserved") && event.order_id !== null) {
      const payee = parse<{ payee?: string }>(event.args)?.payee;
      if (payee && isAddress(payee)) {
        statements.push(
          db
            .prepare("INSERT INTO order_parties (order_id, payee) VALUES (?, ?) ON CONFLICT(order_id) DO UPDATE SET payee = excluded.payee")
            .bind(event.order_id, payee.toLowerCase()),
        );
      }
    } else if ((event.name === "GroupCreated" || event.name === "CoordinatorChanged") && event.order_id !== null) {
      const args = parse<{ coordinator?: string; current?: string }>(event.args);
      const coordinator = event.name === "GroupCreated" ? args?.coordinator : args?.current;
      if (coordinator && isAddress(coordinator)) {
        statements.push(
          db
            .prepare("INSERT INTO order_parties (order_id, payer) VALUES (?, ?) ON CONFLICT(order_id) DO UPDATE SET payer = excluded.payer")
            .bind(event.order_id, coordinator.toLowerCase()),
        );
      }
    } else if (event.name === "ReservationWithdrawn" && event.order_id !== null) {
      statements.push(db.prepare("UPDATE order_parties SET payee = NULL WHERE order_id = ?").bind(event.order_id));
    } else if (event.name === "CaseOpened" && event.order_id !== null && event.case_id !== null) {
      statements.push(db.prepare("INSERT OR IGNORE INTO order_cases (case_id, order_id) VALUES (?, ?)").bind(event.case_id, event.order_id));
    } else if (event.name === "JuryDrawn" && event.case_id !== null) {
      const jurors = parse<{ jurors?: string[] }>(event.args)?.jurors ?? [];
      for (const juror of jurors) {
        if (isAddress(juror)) {
          statements.push(db.prepare("INSERT OR IGNORE INTO case_jurors (case_id, juror) VALUES (?, ?)").bind(event.case_id, juror.toLowerCase()));
        }
      }
    }
  }
  return statements;
};
