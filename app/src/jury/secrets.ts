import { keccak256, type Hex } from "viem";

export interface SecretStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const seedKey = (address: string, caseId: number, round: number) => `junquero.jury.seed.${address.toLowerCase()}.${caseId}.${round}`;
const voteKey = (address: string, caseId: number) => `junquero.jury.vote.${address.toLowerCase()}.${caseId}`;

export async function saveSeed(storage: SecretStorage, address: string, caseId: number, round: number, secret: Hex): Promise<void> {
  await storage.set(seedKey(address, caseId, round), secret);
}

export async function loadSeed(storage: SecretStorage, address: string, caseId: number, round: number): Promise<Hex | null> {
  const value = await storage.get(seedKey(address, caseId, round));
  return value && /^0x[0-9a-f]{64}$/.test(value) ? (value as Hex) : null;
}

export interface SavedVote {
  vote: number;
  salt: Hex;
}

export async function saveVote(storage: SecretStorage, address: string, caseId: number, vote: SavedVote): Promise<void> {
  await storage.set(voteKey(address, caseId), JSON.stringify(vote));
}

export async function loadVote(storage: SecretStorage, address: string, caseId: number): Promise<SavedVote | null> {
  const raw = await storage.get(voteKey(address, caseId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedVote;
    return (parsed.vote === 1 || parsed.vote === 2) && /^0x[0-9a-f]{64}$/.test(parsed.salt) ? parsed : null;
  } catch {
    return null;
  }
}

// El secreto del sorteo sale de una firma de la billetera sobre este mensaje (única por cuenta, reclamo y ronda). Así se puede volver a calcular
// en cualquier dispositivo con la misma cuenta y no depende de lo guardado en el teléfono.
export const seedMessage = (address: string, caseId: number, round: number): string =>
  `Junquero: mi número del sorteo\nCuenta: ${address.toLowerCase()}\nReclamo: ${caseId}\nRonda: ${round}\nNo mueve plata ni garantía.`;

export const secretFromSignature = (signature: Hex): Hex => keccak256(signature);

// El secreto guardado en el teléfono (si hay) o, si no, el derivado de la firma. Si el guardado existe tiene prioridad: así siguen andando los anotados con secretos al azar de versiones anteriores.
export async function resolveSeed(storage: SecretStorage, signText: (message: string) => Promise<Hex>, address: string, caseId: number, round: number): Promise<Hex> {
  const saved = await loadSeed(storage, address, caseId, round);
  if (saved) return saved;
  const secret = secretFromSignature(await signText(seedMessage(address, caseId, round)));
  await saveSeed(storage, address, caseId, round, secret);
  return secret;
}
