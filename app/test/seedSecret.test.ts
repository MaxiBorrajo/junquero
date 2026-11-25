import { describe, expect, it } from "vitest";
import { loadSeed, resolveSeed, secretFromSignature, seedMessage, type SecretStorage } from "../src/jury/secrets";

const memory = (): SecretStorage & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => void (data[k] = v) };
};
const ME = "0xAbC0000000000000000000000000000000000001";
const SIG = `0x${"ab".repeat(65)}` as const;

describe("secreto del sorteo derivado de la firma", () => {
  it("el mensaje es único por cuenta, reclamo y ronda", () => {
    expect(seedMessage(ME, 3, 0)).not.toBe(seedMessage(ME, 3, 1));
    expect(seedMessage(ME, 3, 0)).not.toBe(seedMessage(ME, 4, 0));
    expect(seedMessage(ME, 3, 0)).toBe(seedMessage(ME.toLowerCase(), 3, 0));
  });

  it("la misma firma da siempre el mismo secreto de 32 bytes", () => {
    expect(secretFromSignature(SIG)).toBe(secretFromSignature(SIG));
    expect(secretFromSignature(SIG)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("sin nada guardado lo calcula con la firma y lo guarda", async () => {
    const storage = memory();
    let asked = 0;
    const sign = async () => (asked += 1, SIG);
    const secret = await resolveSeed(storage, sign, ME, 3, 0);
    expect(secret).toBe(secretFromSignature(SIG));
    expect(await loadSeed(storage, ME, 3, 0)).toBe(secret);
    expect(asked).toBe(1);
  });

  it("si ya hay uno guardado lo usa sin pedir firma (sirve para los anotados de versiones anteriores)", async () => {
    const storage = memory();
    const legacy = `0x${"11".repeat(32)}` as const;
    await storage.set(`junquero.jury.seed.${ME.toLowerCase()}.3.0`, legacy);
    const sign = async () => {
      throw new Error("no debería pedir firma");
    };
    expect(await resolveSeed(storage, sign, ME, 3, 0)).toBe(legacy);
  });

  it("en otro teléfono, sin nada guardado, vuelve a dar el mismo secreto", async () => {
    const first = await resolveSeed(memory(), async () => SIG, ME, 3, 0);
    const second = await resolveSeed(memory(), async () => SIG, ME, 3, 0);
    expect(second).toBe(first);
  });
});
