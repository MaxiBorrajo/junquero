import { describe, expect, it } from "vitest";
import { canonicalize, validateSpec } from "../src/spec";

const now = 1_800_000_000;
const base = {
  v: 1,
  title: "Cambiar una canilla",
  description: "Pierde agua en la cocina",
  category: 2,
  modality: "onsite",
  nonce: "abc12345",
  area: { lat: -34.60371234, lng: -58.38159876, radiusM: 300 },
};

const ok = (input: unknown) => {
  const result = validateSpec(input, now);
  if (!result.ok) throw new Error(result.error);
  return result;
};
const error = (input: unknown) => {
  const result = validateSpec(input, now);
  return result.ok ? null : result.error;
};

describe("canonicalize", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(canonicalize({ b: 1, a: { d: [2, { z: 1, y: undefined }], c: "x" } })).toBe('{"a":{"c":"x","d":[2,{"z":1}]},"b":1}');
  });
});

describe("validateSpec", () => {
  it("rounds the area to three decimals so exact positions are never stored", () => {
    const result = ok(base);
    expect(result.spec.area).toEqual({ lat: -34.604, lng: -58.382, radiusM: 300 });
  });

  it("produces the same hash regardless of key order and the same canonical text", () => {
    const reordered = { nonce: base.nonce, area: base.area, modality: base.modality, category: 2, description: base.description, title: base.title, v: 1 };
    expect(ok(reordered).hash).toBe(ok(base).hash);
    expect(ok(base).hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes the hash when any field changes", () => {
    expect(ok({ ...base, title: "Cambiar una llave" }).hash).not.toBe(ok(base).hash);
    expect(ok({ ...base, nonce: "zzz12345" }).hash).not.toBe(ok(base).hash);
  });

  it("requires an area for onsite and forbids it for remote", () => {
    expect(error({ ...base, area: undefined })).toBe("area must be an object");
    expect(error({ ...base, modality: "remote" })).toBe("remote changas must not have an area");
    const remote = ok({ ...base, modality: "remote", area: undefined });
    expect(remote.spec.area).toBeUndefined();
  });

  it("validates ranges", () => {
    expect(error({ ...base, area: { lat: 91, lng: 0, radiusM: 300 } })).toBe("area.lat out of range");
    expect(error({ ...base, area: { lat: 0, lng: 181, radiusM: 300 } })).toBe("area.lng out of range");
    expect(error({ ...base, area: { lat: 0, lng: 0, radiusM: 50 } })).toBe("area.radiusM must be between 200 and 2000");
    expect(error({ ...base, title: "ab" })).toBe("title must have 3 to 80 characters");
    expect(error({ ...base, category: 300 })).toBe("category must be an integer between 0 and 255");
    expect(error({ ...base, nonce: "short" })).toBe("nonce must have 8 to 64 characters");
    expect(error({ ...base, description: "x".repeat(2001) })).toBe("description must have at most 2000 characters");
  });

  it("rejects unknown fields, bad versions and non objects", () => {
    expect(error({ ...base, exactAddress: "Calle 1" })).toBe("unknown field exactAddress");
    expect(error({ ...base, v: 2 })).toBe("unsupported spec version");
    expect(error(null)).toBe("spec must be an object");
    expect(error([])).toBe("spec must be an object");
  });

  it("validates dates against now and order", () => {
    expect(error({ ...base, startsAt: now - 1 })).toBe("startsAt must be a future date");
    expect(error({ ...base, startsAt: now + 100, deadline: now + 50 })).toBe("deadline must be after startsAt");
    expect(ok({ ...base, startsAt: now + 100, deadline: now + 200, durationMin: 90 }).spec.durationMin).toBe(90);
  });

  it("validates evidence and attachments", () => {
    expect(error({ ...base, evidence: new Array(6).fill("foto") })).toBe("evidence must be a list of at most 5");
    expect(error({ ...base, evidence: [""] })).toBe("invalid evidence item");
    const hash = "0x" + "ab".repeat(32);
    expect(ok({ ...base, attachments: [{ hash: hash.toUpperCase().replace("0X", "0x"), name: "a.jpg", mime: "image/jpeg", size: 10 }] }).spec.attachments[0].hash).toBe(hash);
    expect(error({ ...base, attachments: [{ hash: "0x12", name: "a", mime: "image/jpeg", size: 10 }] })).toBe("invalid attachment");
  });

  it("rejects control characters in text", () => {
    expect(error({ ...base, title: "hola\u0000mundo" })).toBe("title must have 3 to 80 characters");
  });
});
