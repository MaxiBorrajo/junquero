import { describe, expect, it, vi } from "vitest";
import { withWallet } from "../src/wallet/withWallet";

const later = <T>(value: T, ms: number) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withWallet", () => {
  it("abre la billetera si la firma tarda y vuelve a la app al terminar", async () => {
    const open = vi.fn(async () => undefined);
    const back = vi.fn(async () => undefined);
    const result = await withWallet(() => later("0xfirma", 40), open, back, 5, 5);
    expect(result).toBe("0xfirma");
    expect(open).toHaveBeenCalledTimes(1);
    await pause(20);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("vuelve a la app también si la firma se rechaza", async () => {
    const back = vi.fn(async () => undefined);
    await expect(withWallet(() => later(0, 30).then(() => Promise.reject(new Error("rechazó"))), async () => undefined, back, 5, 5)).rejects.toThrow("rechazó");
    await pause(20);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("no abre ni vuelve si la firma se resuelve antes", async () => {
    const open = vi.fn(async () => undefined);
    const back = vi.fn(async () => undefined);
    await withWallet(async () => "0xfirma", open, back, 30, 5);
    await pause(50);
    expect(open).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("si no se puede abrir la billetera o volver, la firma sigue igual", async () => {
    const fail = vi.fn(async () => {
      throw new Error("no se pudo");
    });
    await expect(withWallet(() => later("ok", 30), fail, fail, 5, 5)).resolves.toBe("ok");
    await pause(20);
    expect(fail).toHaveBeenCalledTimes(2);
  });
});
