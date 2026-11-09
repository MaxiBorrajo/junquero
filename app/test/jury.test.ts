import { readFileSync } from "node:fs";
import { keccak256, toBytes, toFunctionSelector, type Abi, type AbiFunction, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { arbitrationAbi, CasePhase } from "../src/chain/arbitrationAbi";
import { appealCost, canAppeal, canRespond, disputeCost, jurorAction, loser, partyRole, phaseView, reasonHash, randomHex32, seedCommitment, stakeNeeded, voteCommitment, type CaseSnapshot, type JurorSnapshot } from "../src/chain/jury";
import { loadSeed, loadVote, saveSeed, saveVote, type SecretStorage } from "../src/jury/secrets";

const deployed = JSON.parse(readFileSync(new URL("../../contracts/deployments/abi/Arbitration.json", import.meta.url), "utf8"));
const realAbi = (deployed.abi ?? deployed) as Abi;
const selectors = (abi: readonly unknown[]) => new Map((abi as AbiFunction[]).filter((x) => x.type === "function").map((x) => [x.name, toFunctionSelector(x)]));

describe("funciones del contrato de arbitraje", () => {
  it("todas las que usa la app existen con los mismos tipos", () => {
    const real = selectors(realAbi);
    for (const [name, selector] of selectors(arbitrationAbi)) expect(real.get(name), name).toBe(selector);
  });
});

const juror = "0x01CA95Ba9a19e6F88A90082367c285D179275De4" as Address;
const secret = ("0x" + "ab".repeat(32)) as Hex;

describe("compromisos", () => {
  it("la semilla y el voto dependen del caso, del jurado y del secreto", () => {
    const base = seedCommitment(7n, juror, secret);
    expect(base).toMatch(/^0x[0-9a-f]{64}$/);
    expect(seedCommitment(8n, juror, secret)).not.toBe(base);
    expect(seedCommitment(7n, "0xd9B0025F32f8d1b5010e81E77754bF35839Aa1BD", secret)).not.toBe(base);
    expect(voteCommitment(7n, juror, 1, secret)).not.toBe(voteCommitment(7n, juror, 2, secret));
    expect(voteCommitment(7n, juror, 1, secret)).not.toBe(seedCommitment(7n, juror, secret));
  });

  it("coincide con keccak256(abi.encode(...)) armado a mano", () => {
    const word = (value: bigint) => value.toString(16).padStart(64, "0");
    const manual = keccak256(`0x${word(7n)}${"0".repeat(24)}${juror.slice(2).toLowerCase()}${secret.slice(2)}`);
    expect(seedCommitment(7n, juror, secret)).toBe(manual);
    const manualVote = keccak256(`0x${word(7n)}${"0".repeat(24)}${juror.slice(2).toLowerCase()}${word(2n)}${secret.slice(2)}`);
    expect(voteCommitment(7n, juror, 2, secret)).toBe(manualVote);
  });

  it("el motivo se resume sin importar espacios en los bordes", () => {
    expect(reasonHash("  no terminó  ")).toBe(keccak256(toBytes("no terminó")));
  });

  it("genera secretos de 32 bytes", () => {
    expect(randomHex32((n) => new Uint8Array(n).fill(1))).toBe("0x" + "01".repeat(32));
  });
});

const snapshot = (patch: Partial<CaseSnapshot> = {}): CaseSnapshot => ({
  orderId: 1,
  payer: "0xAaa0000000000000000000000000000000000001",
  payee: "0xBbb0000000000000000000000000000000000002",
  claimant: "0xAaa0000000000000000000000000000000000001",
  token: "0xCcc0000000000000000000000000000000000003",
  fee: 3_000_000n,
  jurors: 3,
  phase: CasePhase.Response,
  round: 0,
  revealedVotes: 0,
  payeeVotes: 0,
  payerVotes: 0,
  commitEnd: 1000,
  revealEnd: 2000,
  appealed: false,
  verdictPayee: false,
  appealEnd: 3000,
  appellant: "0x0000000000000000000000000000000000000000",
  appealFee: 0n,
  ...patch,
});

describe("estado del caso", () => {
  it("traduce fase y horario a lo que corresponde hacer", () => {
    expect(phaseView(snapshot({ phase: CasePhase.Response }), 500)).toBe("waiting-response");
    expect(phaseView(snapshot({ phase: CasePhase.Seed }), 900)).toBe("seed-commit");
    expect(phaseView(snapshot({ phase: CasePhase.Seed }), 1500)).toBe("seed-reveal");
    expect(phaseView(snapshot({ phase: CasePhase.Seed }), 2500)).toBe("seed-draw");
    expect(phaseView(snapshot({ phase: CasePhase.Vote }), 900)).toBe("vote-commit");
    expect(phaseView(snapshot({ phase: CasePhase.Vote }), 1500)).toBe("vote-reveal");
    expect(phaseView(snapshot({ phase: CasePhase.Vote }), 2500)).toBe("vote-wait");
    expect(phaseView(snapshot({ phase: CasePhase.Decided }), 2500)).toBe("verdict-appealable");
    expect(phaseView(snapshot({ phase: CasePhase.Decided }), 3500)).toBe("verdict-final");
    expect(phaseView(snapshot({ phase: CasePhase.NeedsEmergency }), 0)).toBe("emergency");
    expect(phaseView(snapshot({ phase: CasePhase.Resolved }), 0)).toBe("resolved");
  });

  it("distingue quien reclama de quien responde", () => {
    const s = snapshot();
    expect(partyRole(s, s.payer.toLowerCase())).toBe("claimant");
    expect(partyRole(s, s.payee)).toBe("respondent");
    expect(partyRole(s, "0xddd")).toBe("none");
  });

  it("solo responde quien no reclamó y dentro de la ventana", () => {
    const s = snapshot();
    expect(canRespond(s, s.payee, 999)).toBe(true);
    expect(canRespond(s, s.payee, 1001)).toBe(false);
    expect(canRespond(s, s.payer, 500)).toBe(false);
    expect(canRespond(s, "0xddd", 500)).toBe(false);
    expect(canRespond(snapshot({ phase: CasePhase.Seed }), s.payee, 500)).toBe(false);
  });

  it("solo apela quien perdió, una vez y dentro del plazo", () => {
    const decided = snapshot({ phase: CasePhase.Decided, verdictPayee: true });
    expect(loser(decided)).toBe(decided.payer);
    expect(canAppeal(decided, decided.payer, 2500)).toBe(true);
    expect(canAppeal(decided, decided.payee, 2500)).toBe(false);
    expect(canAppeal(decided, decided.payer, 3500)).toBe(false);
    expect(canAppeal({ ...decided, appealed: true }, decided.payer, 2500)).toBe(false);
    expect(canAppeal(snapshot({ phase: CasePhase.Decided, verdictPayee: false }), decided.payee, 2500)).toBe(true);
  });

  it("calcula costos", () => {
    expect(appealCost(1_000_000n, 3)).toBe(7_000_000n);
    expect(appealCost(1_000_000n, 5)).toBe(11_000_000n);
    expect(disputeCost(0, 1_000_000n, 3)).toBe(0n);
    expect(disputeCost(1, 1_000_000n, 3)).toBe(3_000_000n);
    expect(stakeNeeded(10n, 4n)).toBe(6n);
    expect(stakeNeeded(10n, 10n)).toBe(0n);
  });
});

const zero = ("0x" + "0".repeat(64)) as Hex;
const j = (patch: Partial<JurorSnapshot>): JurorSnapshot => ({ selected: true, voteCommit: zero, vote: 0, ...patch });

describe("qué hace el jurado", () => {
  it("compromete en su ventana, revela en la suya y después espera", () => {
    expect(jurorAction("vote-commit", j({}), true)).toBe("commit-vote");
    expect(jurorAction("vote-commit", j({ voteCommit: secret }), true)).toBe("wait");
    expect(jurorAction("vote-reveal", j({ voteCommit: secret }), true)).toBe("reveal-vote");
    expect(jurorAction("vote-reveal", j({ voteCommit: secret, vote: 2 }), true)).toBe("done");
    expect(jurorAction("vote-reveal", j({}), true)).toBe("wait");
    expect(jurorAction("vote-commit", j({ selected: false }), true)).toBe("wait");
    expect(jurorAction("vote-wait", j({ voteCommit: secret }), true)).toBe("wait");
  });
});

function memory(): SecretStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) };
}

describe("secretos guardados", () => {
  it("guarda y recupera la semilla por caso y ronda", async () => {
    const store = memory();
    await saveSeed(store, juror, 7, 0, secret);
    expect(await loadSeed(store, juror.toLowerCase(), 7, 0)).toBe(secret);
    expect(await loadSeed(store, juror, 7, 1)).toBeNull();
    expect(await loadSeed(store, juror, 8, 0)).toBeNull();
  });

  it("guarda y recupera el voto con su sal, y descarta datos dañados", async () => {
    const store = memory();
    await saveVote(store, juror, 7, { vote: 2, salt: secret });
    expect(await loadVote(store, juror, 7)).toEqual({ vote: 2, salt: secret });
    store.data.set(`junquero.jury.vote.${juror.toLowerCase()}.9`, "{no es json");
    expect(await loadVote(store, juror, 9)).toBeNull();
    store.data.set(`junquero.jury.vote.${juror.toLowerCase()}.10`, JSON.stringify({ vote: 7, salt: secret }));
    expect(await loadVote(store, juror, 10)).toBeNull();
    store.data.set(`junquero.jury.seed.${juror.toLowerCase()}.7.2`, "no-es-hex");
    expect(await loadSeed(store, juror, 7, 2)).toBeNull();
  });
});

import { decodeFunctionData } from "viem";
import { permitTypedData, splitSignature } from "../src/chain/createOrder";
import type { Deployment } from "../src/chain/deployment";
import { encodeAppealWithPermit, encodeCommitSeed, encodeCommitVote, encodeRespond, encodeRevealSeed, encodeRevealVote, encodeStakeWithPermit } from "../src/chain/jury";
import { encodeOpenDispute, NO_AUTH } from "../src/chain/orderActions";
import { orderAbi } from "../src/chain/orderAbi";

describe("llamadas codificadas", () => {
  const sel = (data: Hex) => data.slice(0, 10);
  const real = selectors(realAbi);

  it("usan los selectores del contrato de arbitraje", () => {
    expect(sel(encodeRespond(1n, secret))).toBe(real.get("respond"));
    expect(sel(encodeCommitSeed(1n, secret))).toBe(real.get("commitSeed"));
    expect(sel(encodeRevealSeed(1n, secret))).toBe(real.get("revealSeed"));
    expect(sel(encodeCommitVote(1n, secret))).toBe(real.get("commitVote"));
    expect(sel(encodeRevealVote(1n, 2, secret))).toBe(real.get("revealVote"));
    expect(sel(encodeStakeWithPermit(10n, 5n, 27, secret, secret))).toBe(real.get("stakeWithPermit"));
    expect(sel(encodeAppealWithPermit(1n, 5n, 27, secret, secret))).toBe(real.get("appealWithPermit"));
  });

  it("abrir un reclamo chico va sin permiso y uno grande con el permiso del costo", () => {
    const small = decodeFunctionData({ abi: orderAbi, data: encodeOpenDispute(4n, secret, NO_AUTH) });
    expect(small.functionName).toBe("openDispute");
    const big = decodeFunctionData({ abi: orderAbi, data: encodeOpenDispute(4n, secret, { method: 0, nonce: 0n, deadline: 99n, signature: "0x1234" }) });
    expect((big.args as unknown as unknown[])[2]).toMatchObject({ deadline: 99n, signature: "0x1234" });
  });

  it("separa la firma en v, r y s", () => {
    const sig = ("0x" + "11".repeat(32) + "22".repeat(32) + "1b") as Hex;
    expect(splitSignature(sig)).toEqual({ r: "0x" + "11".repeat(32), s: "0x" + "22".repeat(32), v: 27 });
    expect(splitSignature(("0x" + "11".repeat(32) + "22".repeat(32) + "01") as Hex).v).toBe(28);
  });

  it("el permiso para apelar o depositar usa como gastador a quien se indique", () => {
    const d: Deployment = { chainId: 1, token: juror, forwarder: juror, escrow: juror, tokenName: "USDC", tokenPermitVersion: "1" };
    const arbitration = "0x1204d91dcD99e9Fb8928Ccf5c3A7c0EcE837a642" as Address;
    expect(permitTypedData(d, juror, 5n, 0n, 9n, arbitration).message.spender).toBe(arbitration);
    expect(permitTypedData(d, juror, 5n, 0n, 9n).message.spender).toBe(juror);
  });
});
