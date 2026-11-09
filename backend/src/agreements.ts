import { getAddress, isAddress, isHex, verifyTypedData, type Address, type Hex } from "viem";
import deployment from "../../contracts/deployments/sepolia.json";
import { queueNotification } from "./notifications";
import type { Spec } from "./spec";
import { milestoneTerms, milestoneTermsHash, milestoneTotal, type MilestoneTermsData } from "./terms";

export const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;
export const MIN_PROPOSAL_SECONDS = 3600;
export const MAX_PROPOSAL_SECONDS = 24 * 3600 + 300;

export const agreementTypes = {
  Agreement: [
    { name: "orderId", type: "uint256" },
    { name: "payer", type: "address" },
    { name: "payee", type: "address" },
    { name: "price", type: "uint128" },
    { name: "specHash", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
    { name: "expiry", type: "uint40" },
  ],
} as const;

export const escrowDomain = {
  name: "Escrow",
  version: "1",
  chainId: deployment.chainId,
  verifyingContract: deployment.contracts.escrow.address as Address,
} as const;

export interface Agreement {
  orderId: bigint;
  payer: Address;
  payee: Address;
  price: bigint;
  specHash: Hex;
  termsHash: Hex;
  expiry: number;
}

export interface AgreementRow {
  order_id: number;
  payer: string;
  payee: string;
  price: string;
  spec_hash: string;
  terms_hash: string;
  expiry: number;
  payer_signature: string;
  status: string;
  tx_hash: string | null;
  plan: string | null;
  created_at: number;
  updated_at: number;
}

export type AgreeResult = { ok: true; txHash: Hex } | { ok: false; reason: "revert" | "unavailable" };

export interface AgreementChain {
  agree(agreement: Agreement, payerSignature: Hex, payeeSignature: Hex, terms?: MilestoneTermsData): Promise<AgreeResult>;
}

export interface ProposalInput {
  payee: Address;
  price: string;
  expiry: number;
  signature: Hex;
}

export type ProposalResult = { ok: true; value: ProposalInput } | { ok: false; error: string };

export function validateProposal(input: unknown): ProposalResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "proposal must be an object" };
  const raw = input as Record<string, unknown>;
  if (typeof raw.payee !== "string" || !isAddress(raw.payee)) return { ok: false, error: "invalid payee" };
  if (typeof raw.price !== "string" || !/^[1-9][0-9]{0,38}$/.test(raw.price)) return { ok: false, error: "price must be a positive integer in token units" };
  if (!Number.isSafeInteger(raw.expiry)) return { ok: false, error: "invalid expiry" };
  if (typeof raw.signature !== "string" || !isHex(raw.signature)) return { ok: false, error: "invalid signature" };
  return { ok: true, value: { payee: getAddress(raw.payee), price: raw.price, expiry: raw.expiry as number, signature: raw.signature } };
}

export const toAgreement = (row: Pick<AgreementRow, "order_id" | "payer" | "payee" | "price" | "spec_hash" | "terms_hash" | "expiry">): Agreement => ({
  orderId: BigInt(row.order_id),
  payer: getAddress(row.payer),
  payee: getAddress(row.payee),
  price: BigInt(row.price),
  specHash: row.spec_hash as Hex,
  termsHash: row.terms_hash as Hex,
  expiry: row.expiry,
});

export async function signatureMatches(agreement: Agreement, signer: string, signature: Hex): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: getAddress(signer),
      domain: escrowDomain,
      types: agreementTypes,
      primaryType: "Agreement",
      message: agreement,
      signature,
    });
  } catch {
    return false;
  }
}

interface ChangaForOrder {
  id: number;
  owner: string;
  spec_hash: string;
  spec: string;
  amount: string | null;
  status: string;
}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409 | 422 | 503; error: string };

export async function propose(db: D1Database, payer: string, orderId: number, input: ProposalInput, nowSeconds: number): Promise<ActionResult<{ row: AgreementRow }>> {
  const changa = await db
    .prepare("SELECT id, owner, spec_hash, spec, amount, status FROM changas WHERE order_id = ?")
    .bind(orderId)
    .first<ChangaForOrder>();
  if (!changa) return { ok: false, status: 404, error: "order not found" };
  const coordinator = await db.prepare("SELECT payer FROM order_parties WHERE order_id = ?").bind(orderId).first<{ payer: string | null }>();
  if ((coordinator?.payer ?? changa.owner) !== payer) return { ok: false, status: 403, error: "only the owner can propose an agreement" };
  if (changa.status !== "open") return { ok: false, status: 409, error: "the changa is not open" };
  if (input.expiry < nowSeconds + MIN_PROPOSAL_SECONDS || input.expiry > nowSeconds + MAX_PROPOSAL_SECONDS) {
    return { ok: false, status: 400, error: "expiry out of range" };
  }

  const payee = input.payee.toLowerCase();
  if (payee === payer) return { ok: false, status: 400, error: "payee cannot be the owner" };
  const application = await db
    .prepare("SELECT amount, plan FROM applications WHERE changa_id = ? AND applicant = ? AND status = 'active'")
    .bind(changa.id, payee)
    .first<{ amount: string | null; plan: string | null }>();
  if (!application) return { ok: false, status: 400, error: "payee has no active application" };

  const expected = application.amount ?? changa.amount;
  if (expected === null || input.price !== expected) return { ok: false, status: 400, error: "price must match the application" };
  if (changa.amount !== null && BigInt(input.price) > BigInt(changa.amount)) return { ok: false, status: 400, error: "price exceeds the deposit" };

  const spec = JSON.parse(changa.spec) as Spec;
  const applied = application.plan ? (JSON.parse(application.plan) as { milestones: Spec["milestones"]; advance: boolean }) : null;
  const terms = milestoneTerms(applied ? { milestones: applied.milestones, advance: applied.advance } : spec, changa.spec_hash as Hex);
  const planTotal = applied ? (applied.milestones ?? []).reduce((sum, item) => sum + BigInt(item.amount), 0n) : milestoneTotal(spec);
  if (terms && (input.price !== changa.amount || BigInt(input.price) !== planTotal)) {
    return { ok: false, status: 400, error: "with milestones the price must be the published amount, equal to the sum of the milestones" };
  }

  const row: AgreementRow = {
    order_id: orderId,
    payer,
    payee,
    price: input.price,
    spec_hash: changa.spec_hash,
    terms_hash: terms ? milestoneTermsHash(terms) : ZERO_HASH,
    expiry: input.expiry,
    payer_signature: input.signature,
    status: "pending",
    tx_hash: null,
    plan: applied ? application.plan : null,
    created_at: nowSeconds,
    updated_at: nowSeconds,
  };
  if (!(await signatureMatches(toAgreement(row), payer, input.signature))) return { ok: false, status: 400, error: "invalid signature" };

  const current = await db.prepare("SELECT status FROM agreements WHERE order_id = ?").bind(orderId).first<{ status: string }>();
  if (current && (current.status === "sending" || current.status === "submitted")) return { ok: false, status: 409, error: "an agreement is already being confirmed" };

  await db
    .prepare(
      `INSERT INTO agreements (order_id, payer, payee, price, spec_hash, terms_hash, expiry, payer_signature, status, tx_hash, plan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET payee = excluded.payee, price = excluded.price, spec_hash = excluded.spec_hash,
         terms_hash = excluded.terms_hash, expiry = excluded.expiry, payer_signature = excluded.payer_signature,
         status = 'pending', tx_hash = NULL, plan = excluded.plan, updated_at = excluded.updated_at`,
    )
    .bind(orderId, payer, payee, input.price, row.spec_hash, row.terms_hash, input.expiry, input.signature, row.plan, nowSeconds, nowSeconds)
    .run();
  await queueNotification(db, payee, "agreement_proposed", String(orderId), 0, nowSeconds).run();
  return { ok: true, row };
}

export async function accept(db: D1Database, chain: AgreementChain, orderId: number, payee: string, signature: Hex, nowSeconds: number): Promise<ActionResult<{ txHash: Hex }>> {
  const row = await db.prepare("SELECT * FROM agreements WHERE order_id = ?").bind(orderId).first<AgreementRow>();
  if (!row || row.payee !== payee) return { ok: false, status: 404, error: "no agreement to confirm" };
  if (row.status !== "pending") return { ok: false, status: 409, error: "the agreement is not pending" };
  if (nowSeconds > row.expiry) return { ok: false, status: 409, error: "the agreement expired" };
  const agreement = toAgreement(row);
  if (!(await signatureMatches(agreement, payee, signature))) return { ok: false, status: 400, error: "invalid signature" };

  const claimed = await db
    .prepare("UPDATE agreements SET status = 'sending', updated_at = ? WHERE order_id = ? AND status = 'pending'")
    .bind(nowSeconds, orderId)
    .run();
  if (!claimed.meta.changes) return { ok: false, status: 409, error: "the agreement is not pending" };

  const changa = await db.prepare("SELECT spec FROM changas WHERE order_id = ?").bind(orderId).first<{ spec: string }>();
  const planned = row.plan ? (JSON.parse(row.plan) as { milestones: Spec["milestones"]; advance: boolean }) : null;
  const terms = changa ? milestoneTerms(planned ? { milestones: planned.milestones, advance: planned.advance } : (JSON.parse(changa.spec) as Spec), row.spec_hash as Hex) : null;
  const outcome = await chain.agree(agreement, row.payer_signature as Hex, signature, terms ?? undefined);
  if (!outcome.ok) {
    await db.prepare("UPDATE agreements SET status = 'pending', updated_at = ? WHERE order_id = ?").bind(nowSeconds, orderId).run();
    return outcome.reason === "revert"
      ? { ok: false, status: 422, error: "transaction would revert" }
      : { ok: false, status: 503, error: "relayer unavailable" };
  }
  await db.prepare("UPDATE agreements SET status = 'submitted', tx_hash = ?, updated_at = ? WHERE order_id = ?").bind(outcome.txHash, nowSeconds, orderId).run();
  return { ok: true, txHash: outcome.txHash };
}

export async function cancel(db: D1Database, orderId: number, who: string, nowSeconds: number): Promise<ActionResult> {
  const row = await db.prepare("SELECT payer, payee, status FROM agreements WHERE order_id = ?").bind(orderId).first<Pick<AgreementRow, "payer" | "payee" | "status">>();
  if (!row || (row.payer !== who && row.payee !== who)) return { ok: false, status: 404, error: "no agreement" };
  if (row.status !== "pending") return { ok: false, status: 409, error: "the agreement is not pending" };
  await db.prepare("DELETE FROM agreements WHERE order_id = ? AND status = 'pending'").bind(orderId).run();
  return { ok: true };
}

export const presentAgreement = (row: AgreementRow, nowSeconds: number) => ({
  orderId: row.order_id,
  payer: row.payer,
  payee: row.payee,
  price: row.price,
  specHash: row.spec_hash,
  termsHash: row.terms_hash,
  expiry: row.expiry,
  status: row.status === "pending" && nowSeconds > row.expiry ? "expired" : row.status,
  txHash: row.tx_hash,
  plan: row.plan ? JSON.parse(row.plan) : null,
});

export async function listMine(db: D1Database, address: string, nowSeconds: number) {
  const { results } = await db
    .prepare("SELECT * FROM agreements WHERE (payer = ? OR payee = ?) AND status IN ('pending', 'sending', 'submitted') ORDER BY updated_at DESC LIMIT 50")
    .bind(address, address)
    .all<AgreementRow>();
  return results.map((row) => presentAgreement(row, nowSeconds)).filter((row) => row.status !== "expired");
}

export async function purgeAgreements(db: D1Database, nowSeconds: number): Promise<void> {
  await db.prepare("DELETE FROM agreements WHERE (status = 'pending' AND expiry < ?) OR (status = 'submitted' AND updated_at < ?)").bind(nowSeconds, nowSeconds - 7 * 24 * 3600).run();
}
