import { describe, expect, it } from "vitest";
import { decryptFile, encryptFile } from "../src/crypto/chatFile";
import { ATTACHMENTS_PER_MESSAGE, decodeEnvelope, encodeEnvelope, formatSize, type ChatFile } from "../src/chat/envelope";

const file = (overrides: Partial<ChatFile> = {}): ChatFile => ({
  hash: "ab".repeat(32),
  name: "foto.jpg",
  mime: "image/jpeg",
  size: 2048,
  key: "A".repeat(43) + "=",
  nonce: "B".repeat(32),
  ...overrides,
});

describe("chat attachment encryption", () => {
  it("round-trips the bytes and hides them from anyone without the key", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 200, 201]);
    const sealed = encryptFile(bytes);
    expect(sealed.cipher).not.toEqual(bytes);
    expect(sealed.cipher.length).toBe(bytes.length + 16);
    expect(decryptFile(sealed.cipher, sealed.key, sealed.nonce)).toEqual(bytes);
    expect(decryptFile(encryptFile(bytes).cipher, sealed.key, sealed.nonce)).toBeNull();
  });

  it("detects a tampered file", () => {
    const sealed = encryptFile(new Uint8Array([9, 9, 9, 9]));
    sealed.cipher[0] ^= 1;
    expect(decryptFile(sealed.cipher, sealed.key, sealed.nonce)).toBeNull();
  });

  it("uses a different key every time", () => {
    const a = encryptFile(new Uint8Array([1]));
    const b = encryptFile(new Uint8Array([1]));
    expect(a.key).not.toBe(b.key);
  });
});

describe("message envelope", () => {
  it("keeps plain text as it is", () => {
    expect(encodeEnvelope("hola", [])).toBe("hola");
    expect(decodeEnvelope("hola")).toEqual({ text: "hola", files: [] });
  });

  it("round-trips text with attachments", () => {
    const plain = encodeEnvelope("mirá esto", [file(), file({ name: "presupuesto.pdf", mime: "application/pdf" })]);
    const decoded = decodeEnvelope(plain);
    expect(decoded?.text).toBe("mirá esto");
    expect(decoded?.files.map((item) => item.name)).toEqual(["foto.jpg", "presupuesto.pdf"]);
  });

  it("allows attachments without text", () => {
    expect(decodeEnvelope(encodeEnvelope("", [file()]))?.text).toBe("");
  });

  it("returns null when the message could not be decrypted and when the envelope is corrupt", () => {
    expect(decodeEnvelope(null)).toBeNull();
    expect(decodeEnvelope("\u0001{no es json")).toBeNull();
    expect(decodeEnvelope('\u0001{"v":2,"t":"x","f":[]}')).toBeNull();
  });

  it("drops invalid attachments and caps the amount", () => {
    const many = Array.from({ length: 8 }, (_, i) => file({ name: `f${i}.jpg` }));
    expect(decodeEnvelope(encodeEnvelope("", many))?.files).toHaveLength(ATTACHMENTS_PER_MESSAGE);
    const bad = [file({ hash: "zz" }), file({ mime: "" }), file({ size: 11 * 1024 * 1024 }), file({ name: "" }), file({ key: "no válida!" }), file()];
    expect(decodeEnvelope(encodeEnvelope("", bad))?.files).toHaveLength(1);
  });

  it("formats sizes", () => {
    expect(formatSize(500)).toBe("1 KB");
    expect(formatSize(300 * 1024)).toBe("300 KB");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
