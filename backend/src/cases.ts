export interface CaseRef {
  caseId: number;
  orderId: number;
  // Solo en los reclamos propios: quién lo abrió y si ya se resolvió (para marcar los trabajos y filtrarlos).
  claimant?: string | null;
  resolved?: boolean;
}

const LIMIT = 50;
const OPEN_LIMIT = 20;

const toRef = (row: { case_id: number; order_id: number }): CaseRef => ({ caseId: row.case_id, orderId: row.order_id });

// Los casos que esperan jurado son los mismos para todos (menos los propios): se piden una vez cada 30 segundos y después
// cada persona descarta los suyos. Antes se recorría la tabla de eventos entera por cada pedido de cada persona.
const OPEN_CACHE_MS = 30_000;
let openCache: { at: number; rows: { case_id: number; order_id: number; payer: string | null; payee: string | null }[] } | null = null;

export const clearOpenCasesCache = (): void => {
  openCache = null;
};

async function openCases(db: D1Database, now: number) {
  if (openCache && now - openCache.at < OPEN_CACHE_MS) return openCache.rows;
  const { results } = await db
    .prepare(
      `SELECT DISTINCT e.case_id AS case_id, oc.order_id AS order_id, p.payer AS payer, p.payee AS payee FROM events e
       JOIN order_cases oc ON oc.case_id = e.case_id
       LEFT JOIN order_parties p ON p.order_id = oc.order_id
       WHERE e.name IN ('Responded', 'Appealed')
         AND NOT EXISTS (
           SELECT 1 FROM events x
           WHERE x.case_id = e.case_id
             AND (x.block_number > e.block_number OR (x.block_number = e.block_number AND x.log_index > e.log_index))
             AND x.name IN ('JuryDrawn', 'NeedsEmergencyResolution', 'EmergencyResolved', 'ResolvedByDefault', 'CaseDecided'))
       ORDER BY e.case_id DESC LIMIT ${OPEN_LIMIT * 3}`,
    )
    .all<{ case_id: number; order_id: number; payer: string | null; payee: string | null }>();
  openCache = { at: now, rows: results };
  return results;
}

export async function casesFor(db: D1Database, address: string, now = Date.now()) {
  const [party, juror] = await db.batch([
    db
      .prepare(
        `SELECT oc.case_id AS case_id, oc.order_id AS order_id,
                (SELECT lower(json_extract(e.args, '$.claimant')) FROM events e WHERE e.case_id = oc.case_id AND e.name = 'CaseOpened' LIMIT 1) AS claimant,
                EXISTS (SELECT 1 FROM events e JOIN events x ON x.order_id = e.order_id AND x.name = 'DisputeResolved'
                          AND (x.block_number > e.block_number OR (x.block_number = e.block_number AND x.log_index > e.log_index))
                        WHERE e.case_id = oc.case_id AND e.name = 'CaseOpened') AS resolved
         FROM order_cases oc
         JOIN order_parties p ON p.order_id = oc.order_id
         WHERE p.payer = ?1 OR p.payee = ?1 ORDER BY oc.case_id DESC LIMIT ${LIMIT}`,
      )
      .bind(address),
    db
      .prepare(
        `SELECT j.case_id AS case_id, oc.order_id AS order_id FROM case_jurors j
         JOIN order_cases oc ON oc.case_id = j.case_id
         WHERE j.juror = ? ORDER BY j.case_id DESC LIMIT ${LIMIT}`,
      )
      .bind(address),
  ]);
  type Rows = { results: { case_id: number; order_id: number }[] };
  const open = (await openCases(db, now)).filter((row) => row.payer !== address && row.payee !== address).slice(0, OPEN_LIMIT);
  return {
    asParty: (party as unknown as { results: { case_id: number; order_id: number; claimant: string | null; resolved: number }[] }).results.map((row) => ({ ...toRef(row), claimant: row.claimant, resolved: Boolean(row.resolved) })),
    asJuror: (juror as unknown as Rows).results.map(toRef),
    openForJury: open.map(toRef),
  };
}

// Lo que cada jurado puso, perdió y ganó: sale de los eventos del contrato (en micro-USDC, como texto).
// Por caso: lo que perdió de garantía (JurorSlashed) y la recompensa que ganó (JurorPaid). En total, además, todo lo que depositó (Staked).
export async function juryResultsFor(db: D1Database, address: string) {
  const [perCase, deposits] = await db.batch([
    db
      .prepare(
        `SELECT case_id AS case_id,
                COALESCE(SUM(CASE WHEN name = 'JurorSlashed' THEN CAST(json_extract(args, '$.amount') AS INTEGER) END), 0) AS slashed,
                COALESCE(SUM(CASE WHEN name = 'JurorPaid' THEN CAST(json_extract(args, '$.reward') AS INTEGER) END), 0) AS earned
         FROM events
         WHERE name IN ('JurorSlashed', 'JurorPaid') AND lower(json_extract(args, '$.juror')) = ?1 AND case_id IS NOT NULL
         GROUP BY case_id`,
      )
      .bind(address),
    db
      .prepare(`SELECT COALESCE(SUM(CAST(json_extract(args, '$.amount') AS INTEGER)), 0) AS deposited FROM events WHERE name = 'Staked' AND lower(json_extract(args, '$.juror')) = ?1`)
      .bind(address),
  ]);
  const rows = (perCase as unknown as { results: { case_id: number; slashed: number; earned: number }[] }).results;
  const cases: Record<string, { slashed: string; earned: string }> = {};
  let slashed = 0n;
  let earned = 0n;
  for (const row of rows) {
    cases[String(row.case_id)] = { slashed: String(row.slashed), earned: String(row.earned) };
    slashed += BigInt(row.slashed);
    earned += BigInt(row.earned);
  }
  const deposited = (deposits as unknown as { results: { deposited: number }[] }).results[0]?.deposited ?? 0;
  return { cases, totals: { deposited: String(deposited), slashed: slashed.toString(), earned: earned.toString() } };
}
