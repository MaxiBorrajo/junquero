export interface CaseRef {
  caseId: number;
  orderId: number;
}

const LIMIT = 50;
const OPEN_LIMIT = 20;

const toRef = (row: { case_id: number; order_id: number }): CaseRef => ({ caseId: row.case_id, orderId: row.order_id });

export async function casesFor(db: D1Database, address: string) {
  const [party, juror, open] = await db.batch([
    db
      .prepare(
        `SELECT oc.case_id AS case_id, oc.order_id AS order_id FROM order_cases oc
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
    db
      .prepare(
        `SELECT DISTINCT e.case_id AS case_id, oc.order_id AS order_id FROM events e
         JOIN order_cases oc ON oc.case_id = e.case_id
         WHERE e.name IN ('Responded', 'Appealed')
           AND NOT EXISTS (
             SELECT 1 FROM events x
             WHERE x.case_id = e.case_id
               AND (x.block_number > e.block_number OR (x.block_number = e.block_number AND x.log_index > e.log_index))
               AND x.name IN ('JuryDrawn', 'NeedsEmergencyResolution', 'EmergencyResolved', 'ResolvedByDefault', 'CaseDecided'))
           AND NOT EXISTS (SELECT 1 FROM order_parties p WHERE p.order_id = oc.order_id AND (p.payer = ?1 OR p.payee = ?1))
         ORDER BY e.case_id DESC LIMIT ${OPEN_LIMIT}`,
      )
      .bind(address),
  ]);
  type Rows = { results: { case_id: number; order_id: number }[] };
  return {
    asParty: (party as unknown as Rows).results.map(toRef),
    asJuror: (juror as unknown as Rows).results.map(toRef),
    openForJury: (open as unknown as Rows).results.map(toRef),
  };
}
