import { describe, expect, it } from "vitest";
import { formatCode, isShortCode, normalizeCode, releaseCode } from "../src/chain/releaseCode";

describe("código corto de liberación", () => {
  it("da el mismo código que el servidor para la misma firma", () => {
    // Mismo vector que backend/test/closing.test.ts: si cambia la regla en un lado, falla en los dos.
    expect(releaseCode("0x" + "ab".repeat(65))).toBe("228DQV28");
    expect(formatCode("228DQV28")).toBe("228D-QV28");
  });

  it("firmas distintas dan códigos distintos", () => {
    expect(releaseCode("0x" + "cd".repeat(65))).not.toBe(releaseCode("0x" + "ab".repeat(65)));
  });

  it("al escribirlo da lo mismo con guiones, espacios, minúsculas y letras confundibles", () => {
    expect(normalizeCode("228d-qv28")).toBe("228DQV28");
    expect(normalizeCode(" 22 8D qv2b ")).toBe("228DQV2B");
    expect(normalizeCode("O1IL")).toBe("0111");
  });

  it("distingue un código corto del texto largo del QR", () => {
    expect(isShortCode("228D-QV28")).toBe(true);
    expect(isShortCode("228D")).toBe(false);
    expect(isShortCode('{"v":1,"o":1}')).toBe(false);
  });
});
