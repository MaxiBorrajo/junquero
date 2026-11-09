import { describe, expect, it } from "vitest";
import { applyBlock } from "../src/lib/apply";
import { boundsQuery, clampBounds, roundBounds, toFeatures } from "../src/lib/changaMap";
import { formatDistance, formatDuration } from "../src/lib/format";
import { formatAmount, formatUsdc, toMicro } from "../src/lib/money";
import { parseCounterOffer } from "../src/lib/offer";
import type { Changa } from "../src/api/types";

describe("money", () => {
  it("formatea montos con separador argentino", () => {
    expect(formatAmount("25000000")).toBe("25");
    expect(formatAmount("25500000")).toBe("25,5");
    expect(formatAmount("1234567890000")).toBe("1.234.567,89");
    expect(formatAmount("1500")).toBe("0");
    expect(formatAmount("10")).toBe("0");
    expect(formatAmount(null)).toBe("-");
    expect(formatAmount("abc")).toBe("-");
    expect(formatUsdc("5000000")).toBe("5 USDC");
  });

  it("convierte a unidades mínimas sin perder precisión", () => {
    expect(toMicro("25")).toBe(25_000_000n);
    expect(toMicro("25,5")).toBe(25_500_000n);
    expect(toMicro("0.000001")).toBe(1n);
    expect(toMicro("1.1234567")).toBe(1_123_456n);
  });

  it("valida la contraoferta", () => {
    expect(parseCounterOffer("")).toEqual({ ok: true, value: null });
    expect(parseCounterOffer("25,5")).toEqual({ ok: true, value: "25500000" });
    expect(parseCounterOffer("0")).toEqual({ ok: false });
    expect(parseCounterOffer("-3")).toEqual({ ok: false });
    expect(parseCounterOffer("1e3")).toEqual({ ok: false });
    expect(parseCounterOffer("1.1234567")).toEqual({ ok: false });
  });
});

describe("format", () => {
  it("duración y distancia", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(150)).toBe("2 h 30 min");
    expect(formatDuration(2880)).toBe("2 d");
    expect(formatDistance(20)).toBe("50 m");
    expect(formatDistance(480)).toBe("500 m");
    expect(formatDistance(1530)).toBe("1,5 km");
    expect(formatDistance(25000)).toBe("25 km");
  });
});

const changa = (patch: Partial<Changa> & { owner?: string } = {}): Changa => ({
  id: 1,
  owner: "0xaa",
  specHash: "0x1",
  spec: { v: 1, title: "t", description: "", category: 0, modality: "onsite", nonce: "n", area: { lat: -34.6, lng: -58.4, radiusM: 300 }, evidence: [], attachments: [] },
  orderId: 1,
  token: "0x",
  amount: "5000000",
  status: "open",
  createdAt: 0,
  ...patch,
});

describe("mapa", () => {
  it("limita el tamaño del recuadro que se pide al servidor", () => {
    const big = clampBounds({ west: -60, south: -36, east: -57, north: -33 });
    expect(big.north - big.south).toBeCloseTo(2);
    expect(big.east - big.west).toBeCloseTo(2);
    expect((big.north + big.south) / 2).toBeCloseTo(-34.5);
  });

  it("redondear el recuadro evita pedidos repetidos por movimientos mínimos", () => {
    const a = roundBounds({ west: -58.401, south: -34.611, east: -58.36, north: -34.58 });
    const b = roundBounds({ west: -58.405, south: -34.609, east: -58.362, north: -34.582 });
    expect(boundsQuery(a)).toBe(boundsQuery(b));
  });

  it("arma pines solo con las changas presenciales", () => {
    const remote = changa({ id: 2, spec: { ...changa().spec, modality: "remote", area: undefined } });
    const features = toFeatures([changa(), remote]);
    expect(features.features).toHaveLength(1);
    expect(features.features[0]?.properties).toMatchObject({ id: 1, label: "5" });
  });
});

describe("postularse", () => {
  const ready = { address: "0xbb", hasProfile: true, selfieStatus: "approved" as const };
  it("devuelve el motivo que bloquea", () => {
    expect(applyBlock(changa(), { ...ready, address: null })).toBe("anonymous");
    expect(applyBlock(changa(), { ...ready, address: "0xAA" })).toBe("own");
    expect(applyBlock(changa({ status: "agreed" }), ready)).toBe("closed");
    expect(applyBlock(changa(), { ...ready, hasProfile: false, selfieStatus: null })).toBe("no-profile");
    expect(applyBlock(changa(), { ...ready, selfieStatus: "pending" })).toBe("selfie");
    expect(applyBlock(changa(), ready)).toBeNull();
  });
});
