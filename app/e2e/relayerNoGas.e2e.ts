import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { numberToHex } from "viem";
import { publishChanga } from "../src/chain/publish";
import { emptyDraft } from "../src/publish/draft";
import { balanceOf, chain, deployment, login, makeActor, mint, readNonces, RPC, until } from "./harness";
import type { Changa } from "../src/api/types";

// 15.5: con el relayer sin ETH, la app muestra un error sin mover plata; al recargarlo se recupera.
const RELAYER = privateKeyToAccount("0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6").address;
const payer = makeActor(generatePrivateKey());

async function setEth(wei: bigint): Promise<void> {
  await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [RELAYER, numberToHex(wei)] }) });
}

let original = 0n;
beforeAll(async () => {
  original = await chain.getBalance({ address: RELAYER });
  await login(payer);
  await payer.api.send("PUT", "/me/profile", { name: "Ana", categories: [], work: { lat: -34.6, lng: -58.4, radiusM: 5000 } });
  await mint(payer.address, 100_000_000n);
});

afterAll(async () => {
  await setEth(original);
});

const publish = () => {
  const now = () => Math.floor(Date.now() / 1000);
  const draft = { ...emptyDraft(), evidence: ["Foto"], title: "Cambiar una canilla", category: 0, point: { lat: -34.6, lng: -58.4 }, approx: { lat: -34.601, lng: -58.401 }, startsAt: now() + 7200, amount: "25" };
  const nonces = readNonces(payer);
  return publishChanga({ api: payer.api, deployment, account: payer.address, now, nonce: () => `e2e-${Date.now()}`, readBalance: nonces.balance, readTokenNonce: nonces.token, readForwarderNonce: nonces.forwarder, signTypedData: payer.signTyped }, draft, 25_000_000n);
};

describe("15.5 relayer sin gas", () => {
  it("sin ETH el servidor no puede enviar: error claro y la plata de Ana no se mueve", async () => {
    await setEth(0n);
    const before = await balanceOf(payer.address);
    await expect(publish()).rejects.toBeDefined();
    expect(await balanceOf(payer.address)).toBe(before);
  });

  it("al volver a cargar el relayer, publicar funciona", async () => {
    await setEth(original > 0n ? original : 10n ** 18n);
    const result = await publish();
    const changa = await until("changa abierta", async () => {
      const found = (await payer.api.get<{ changas: Changa[] }>(`/changas/${result.specHash}`)).changas[0];
      return found && found.status === "open" ? found : null;
    });
    expect(changa.amount).toBe("25000000");
  });
});
