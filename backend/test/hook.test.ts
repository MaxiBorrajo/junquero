import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasNoLogs, verifySignature } from "../src/hook";

const key = "whsec_test_key";
const body = JSON.stringify({ webhookId: "wh_1", type: "ADDRESS_ACTIVITY" });
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("hex");

describe("verifySignature", () => {
  it("acepta la firma correcta, también en mayúsculas", async () => {
    expect(await verifySignature(body, key, sign(body, key))).toBe(true);
    expect(await verifySignature(body, key, sign(body, key).toUpperCase())).toBe(true);
  });

  it("rechaza una firma de otra clave, de otro cuerpo, vacía o ausente", async () => {
    expect(await verifySignature(body, key, sign(body, "otra"))).toBe(false);
    expect(await verifySignature(body + " ", key, sign(body, key))).toBe(false);
    expect(await verifySignature(body, key, "")).toBe(false);
    expect(await verifySignature(body, key, null)).toBe(false);
    expect(await verifySignature(body, key, "abc")).toBe(false);
  });
});

describe("hasNoLogs", () => {
  it("detecta un bloque sin eventos y no confunde otros formatos", () => {
    expect(hasNoLogs(JSON.stringify({ event: { data: { block: { logs: [] } } } }))).toBe(true);
    expect(hasNoLogs(JSON.stringify({ event: { data: { block: { logs: [{ data: "0x" }] } } } }))).toBe(false);
    expect(hasNoLogs(JSON.stringify({ type: "ADDRESS_ACTIVITY", event: { activity: [] } }))).toBe(false);
    expect(hasNoLogs("no es json")).toBe(false);
  });
});
