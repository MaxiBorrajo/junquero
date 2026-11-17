export interface ActivitySummary {
  earned: string;
  spent: string;
  toCollect: string;
  inEscrow: string;
  settledAsPayee: number;
  settledAsPayer: number;
}

const OPEN_STATES = "('agreed','delivered','disputed')";
// Quien publica ya depositó el pago al publicar, aunque todavía no haya prestador.
const ESCROW_STATES = "('open','agreed','delivered','disputed')";

export interface MoneyEvent {
  order_id: number;
  name: string;
  args: string | null;
}

// Lo que se movió de verdad en cada trabajo, por persona: lo cobrado por cada hito, por un cierre anticipado o por un reclamo,
// atribuido a quien tenía el trabajo en ese momento (si lo dejó y otra persona lo tomó, cada una cuenta lo suyo).
export interface OrderMoney {
  received: Map<string, bigint>;
  // Lo que salió de la garantía de quien publicó: lo cobrado, la comisión y lo devuelto.
  released: bigint;
  spent: bigint;
  paidAny: boolean;
}

const big = (value: unknown): bigint => (typeof value === "string" || typeof value === "number" ? BigInt(value) : 0n);

export function moneyByOrder(events: MoneyEvent[], fallbackPayee: Map<number, string | null> = new Map()): Map<number, OrderMoney> {
  const result = new Map<number, OrderMoney>();
  const segment = new Map<number, { payee: string | null; milestones: boolean }>();
  for (const event of events) {
    const args = (event.args ? JSON.parse(event.args) : {}) as Record<string, unknown>;
    const money = result.get(event.order_id) ?? { received: new Map<string, bigint>(), released: 0n, spent: 0n, paidAny: false };
    result.set(event.order_id, money);
    const state = segment.get(event.order_id) ?? { payee: fallbackPayee.get(event.order_id) ?? null, milestones: false };
    segment.set(event.order_id, state);
    const credit = (to: string | null, paid: bigint, fee: bigint, back: bigint) => {
      if (paid > 0n && to) money.received.set(to, (money.received.get(to) ?? 0n) + paid);
      money.released += paid + fee + back;
      money.spent += paid + fee;
      if (paid + fee > 0n) money.paidAny = true;
    };
    switch (event.name) {
      case "OrderAgreed":
        state.payee = typeof args.payee === "string" ? args.payee.toLowerCase() : state.payee;
        state.milestones = false;
        break;
      case "OrderAbandoned":
        // El trabajo se reabre con lo que quedó depositado: lo anterior ya no cuenta como pendiente.
        money.released = 0n;
        break;
      case "MilestonesAgreed":
        state.milestones = true;
        break;
      case "MilestonePaid":
        credit(state.payee, big(args.paid), big(args.fee), big(args.refunded));
        break;
      case "OrderTerminated":
        credit(state.payee, big(args.paidToPayee), big(args.toTreasury), big(args.refunded));
        break;
      case "DisputeResolved":
        credit(state.payee, big(args.paidToPayee), big(args.protocolFee), big(args.refundedToPayer));
        break;
      case "OrderSettled":
        // En un trabajo por hitos trae los totales acumulados: ya se contaron hito por hito.
        if (!state.milestones) credit(typeof args.payee === "string" ? args.payee.toLowerCase() : state.payee, big(args.paid), big(args.fee), big(args.refunded));
        break;
    }
  }
  return result;
}

const MONEY_EVENTS = "('OrderAgreed', 'MilestonesAgreed', 'MilestonePaid', 'OrderTerminated', 'DisputeResolved', 'OrderSettled', 'OrderAbandoned')";

export async function activitySummary(db: D1Database, address: string): Promise<ActivitySummary> {
  const orders = await db
    .prepare(
      `SELECT p.order_id AS order_id, p.payer AS payer, p.payee AS payee, c.status AS status, COALESCE(c.amount_micro, 0) AS amount
       FROM order_parties p LEFT JOIN changas c ON c.order_id = p.order_id
       WHERE p.payee = ?1 OR p.payer = ?1 OR p.order_id IN (SELECT order_id FROM abandonments WHERE payee = ?1)`,
    )
    .bind(address)
    .all<{ order_id: number; payer: string | null; payee: string | null; status: string | null; amount: number }>();
  const ids = orders.results.map((row) => row.order_id);
  const events = ids.length === 0 ? [] : (
    await db
      .prepare(`SELECT order_id, name, args FROM events WHERE name IN ${MONEY_EVENTS} AND order_id IN (SELECT value FROM json_each(?)) ORDER BY block_number, log_index`)
      .bind(JSON.stringify(ids))
      .all<MoneyEvent>()
  ).results;
  const money = moneyByOrder(events, new Map(orders.results.map((row) => [row.order_id, row.payee])));

  let earned = 0n, spent = 0n, toCollect = 0n, inEscrow = 0n, asPayee = 0, asPayer = 0;
  for (const row of orders.results) {
    const moved = money.get(row.order_id);
    const mine = address.toLowerCase();
    const received = moved?.received.get(mine) ?? 0n;
    const settled = row.status === "settled";
    // Sin movimientos registrados (datos viejos) se toma el monto acordado del trabajo cerrado.
    const legacy = settled && !moved?.paidAny ? BigInt(row.amount) : 0n;
    if (row.payer === address) {
      spent += moved?.paidAny ? moved.spent : legacy;
      if (moved?.paidAny || settled) asPayer += 1;
      if (row.status !== null && ESCROW_STATES.includes(`'${row.status}'`)) inEscrow += max0(BigInt(row.amount) - (moved?.released ?? 0n));
    }
    const worked = received > 0n || (row.payee === address && settled);
    if (received > 0n) earned += received;
    else if (row.payee === address) earned += legacy;
    if (worked) asPayee += 1;
    if (row.payee === address && row.status !== null && OPEN_STATES.includes(`'${row.status}'`)) toCollect += max0(BigInt(row.amount) - (moved?.released ?? 0n));
  }
  return { earned: String(earned), spent: String(spent), toCollect: String(toCollect), inEscrow: String(inEscrow), settledAsPayee: asPayee, settledAsPayer: asPayer };
}

const max0 = (value: bigint) => (value < 0n ? 0n : value);

export interface NotificationItem {
  id: number;
  kind: string;
  ref: string;
  createdAt: number;
}

export const NOTIFICATIONS_LIMIT = 50;

export async function listNotifications(db: D1Database, address: string, nowSeconds: number): Promise<NotificationItem[]> {
  const { results } = await db
    .prepare("SELECT id, kind, ref, created_at FROM notifications WHERE address = ? AND due_at <= ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .bind(address, nowSeconds, NOTIFICATIONS_LIMIT)
    .all<{ id: number; kind: string; ref: string; created_at: number }>();
  return results.map((row) => ({ id: row.id, kind: row.kind, ref: row.ref, createdAt: row.created_at }));
}
