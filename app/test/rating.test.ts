import { keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/api/client";
import { ZERO_HASH } from "../src/chain/agreement";
import { commentHashOf, saveRatingComment } from "../src/chain/rating";

const apiReturning = (hash: string, calls: { url: string; body: unknown }[] = []) =>
  createApi({ baseUrl: "https://x", getToken: () => "t", fetcher: async (url, init) => (calls.push({ url: String(url), body: JSON.parse(init!.body as string) }), new Response(JSON.stringify({ hash }), { status: 200, headers: { "content-type": "application/json" } })) });

describe("comentario de la calificación", () => {
  it("sin texto la huella es cero y con texto es el keccak del texto sin espacios de más", () => {
    expect(commentHashOf("")).toBe(ZERO_HASH);
    expect(commentHashOf("   ")).toBe(ZERO_HASH);
    expect(commentHashOf("  Muy prolijo  ")).toBe(keccak256(toBytes("Muy prolijo")));
  });

  it("sin texto no llama al servidor", async () => {
    const calls: { url: string; body: unknown }[] = [];
    expect(await saveRatingComment(apiReturning("0x", calls), 3, "  ")).toBe(ZERO_HASH);
    expect(calls).toHaveLength(0);
  });

  it("guarda el texto y devuelve la huella si el servidor calcula la misma", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const expected = keccak256(toBytes("Excelente"));
    expect(await saveRatingComment(apiReturning(expected, calls), 3, " Excelente ")).toBe(expected);
    expect(calls[0]!.url).toContain("/me/orders/3/rating-comment");
    expect(calls[0]!.body).toEqual({ text: "Excelente" });
  });

  it("si el servidor calcula otra huella no se firma nada", async () => {
    await expect(saveRatingComment(apiReturning(`0x${"11".repeat(32)}`), 3, "Excelente")).rejects.toThrow("comment_hash_mismatch");
  });
});
