import { describe, expect, it, vi } from "vitest";
import { waitForConfirmation } from "../src/chain/confirmation";
import { runAction, type RunActionDeps } from "../src/lib/runAction";

const HASH = "0x" + "ab".repeat(32);

function deps(overrides: Partial<RunActionDeps> = {}) {
  const toasts: { text: string; tone?: string }[] = [];
  const invalidated: (readonly unknown[])[][] = [];
  const base: RunActionDeps = {
    toast: (options) => void toasts.push(options),
    invalidate: async (keys) => void invalidated.push([...keys]),
    confirm: async () => "confirmed",
    isRejection: (error) => String((error as Error)?.message).includes("User rejected"),
    messages: { pending: "Enviado…", slow: "Se está confirmando", cancelled: "Cancelaste la firma", failed: "Algo salió mal" },
    ...overrides,
  };
  return { deps: base, toasts, invalidated };
}

describe("runAction", () => {
  it("espera la confirmación, refresca y recién entonces avisa del éxito", async () => {
    const order: string[] = [];
    const { deps: d, toasts } = deps({
      confirm: async () => {
        order.push("confirm");
        return "confirmed";
      },
      invalidate: async () => void order.push("invalidate"),
      toast: (options) => void (order.push(`toast:${options.text}`), toasts.push(options)),
    });
    const result = await runAction(d, async () => HASH, { success: "Sumamos tu aporte", invalidate: [["group", 1]] });
    expect(result).toEqual({ ok: true, error: null });
    expect(order).toEqual(["toast:Enviado…", "confirm", "invalidate", "toast:Sumamos tu aporte"]);
  });

  it("no espera ninguna transacción si la acción no devuelve un hash", async () => {
    const confirm = vi.fn(async () => "confirmed" as const);
    const { deps: d, toasts } = deps({ confirm });
    await runAction(d, async () => undefined, { success: "Guardado" });
    expect(confirm).not.toHaveBeenCalled();
    expect(toasts.map((item) => item.text)).toEqual(["Guardado"]);
  });

  it("si la red tarda demasiado, refresca igual y avisa que se sigue confirmando", async () => {
    const { deps: d, toasts, invalidated } = deps({ confirm: async () => "timeout" });
    const result = await runAction(d, async () => HASH, { success: "Listo", invalidate: [["order", 2]] });
    expect(result.ok).toBe(true);
    expect(invalidated).toHaveLength(1);
    expect(toasts.map((item) => item.text)).toEqual(["Enviado…", "Se está confirmando"]);
  });

  it("si la persona cancela la firma avisa sin tono de error y no hay texto de error", async () => {
    const { deps: d, toasts } = deps();
    const result = await runAction(d, async () => Promise.reject(new Error("User rejected the request")), { failure: "No se pudo" });
    expect(result).toEqual({ ok: false, error: null });
    expect(toasts).toEqual([{ text: "Cancelaste la firma", tone: "info" }]);
  });

  it("devuelve el texto de error para mostrarlo en la pantalla y no refresca", async () => {
    const { deps: d, toasts, invalidated } = deps();
    const result = await runAction(d, async () => Promise.reject(new Error("boom")), { failure: "No pudimos aportar", invalidate: [["group", 1]] });
    expect(result).toEqual({ ok: false, error: "No pudimos aportar" });
    expect(toasts).toEqual([]);
    expect(invalidated).toEqual([]);
  });

  it("usa el texto genérico y permite traducir errores conocidos", async () => {
    const { deps: d } = deps();
    expect((await runAction(d, async () => Promise.reject(new Error("boom")))).error).toBe("Algo salió mal");
    const mapped = await runAction(d, async () => Promise.reject(new Error("balance:5")), { mapError: (error) => ((error as Error).message.startsWith("balance:") ? "Te faltan 5 USDC" : null) });
    expect(mapped.error).toBe("Te faltan 5 USDC");
  });

  it("si la transacción se revierte en la red lo trata como un error", async () => {
    const { deps: d } = deps({ confirm: async () => Promise.reject(new Error("transaction_reverted")) });
    const result = await runAction(d, async () => HASH, { success: "Listo", failure: "No se pudo" });
    expect(result).toEqual({ ok: false, error: "No se pudo" });
  });

  it("llama a onSuccess al terminar", async () => {
    const { deps: d } = deps();
    const onSuccess = vi.fn();
    await runAction(d, async () => undefined, { onSuccess });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("waitForConfirmation", () => {
  it("confirma cuando la red devuelve el recibo", async () => {
    expect(await waitForConfirmation(HASH, async () => true, 1000)).toBe("confirmed");
  });

  it("falla si la transacción se revirtió", async () => {
    await expect(waitForConfirmation(HASH, async () => false, 1000)).rejects.toThrow("transaction_reverted");
  });

  it("da tiempo agotado si la red no responde", async () => {
    vi.useFakeTimers();
    const pending = waitForConfirmation(HASH, () => new Promise<boolean>(() => {}), 5000);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await pending).toBe("timeout");
    vi.useRealTimers();
  });

  it("propaga el error si la espera falla", async () => {
    await expect(waitForConfirmation(HASH, async () => Promise.reject(new Error("rpc down")), 1000)).rejects.toThrow("rpc down");
  });
});
