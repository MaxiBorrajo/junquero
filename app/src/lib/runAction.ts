import type { Confirmation } from "../chain/confirmation";

export interface ToastLike {
  (options: { text: string; tone?: "success" | "error" | "info"; icon?: string; durationMs?: number }): void;
}

export interface RunActionMessages {
  pending: string;
  slow: string;
  cancelled: string;
  failed: string;
}

export interface RunActionDeps {
  toast: ToastLike;
  invalidate: (keys: readonly (readonly unknown[])[]) => Promise<void>;
  confirm: (hash: string) => Promise<Confirmation>;
  isRejection: (error: unknown) => boolean;
  messages: RunActionMessages;
}

export interface RunActionOptions {
  // Texto del toast cuando todo salió bien.
  success?: string;
  successIcon?: string;
  // Texto del error en pantalla si algo falla (por defecto, el genérico).
  failure?: string;
  // Convierte un error conocido (por ejemplo "saldo insuficiente") en el texto a mostrar.
  mapError?: (error: unknown) => string | null;
  // Consultas a refrescar una vez confirmada la acción.
  invalidate?: readonly (readonly unknown[])[];
  onSuccess?: () => void;
}

export interface RunActionResult {
  ok: boolean;
  // Texto para mostrar en la pantalla (ErrorText); null si salió bien o si la persona canceló la firma.
  error: string | null;
}

const PENDING_TOAST_MS = 30_000;

// Corre una acción de la app. Si devuelve el hash de una transacción, espera a que la red la confirme y recién entonces
// refresca los datos y avisa con un toast: así nunca se dice "Listo" con la pantalla todavía en el estado viejo.
export async function runAction(deps: RunActionDeps, action: () => Promise<string | void>, options: RunActionOptions = {}): Promise<RunActionResult> {
  try {
    const hash = await action();
    let confirmation: Confirmation = "confirmed";
    if (typeof hash === "string" && hash.startsWith("0x")) {
      deps.toast({ text: deps.messages.pending, tone: "info", icon: "clock", durationMs: PENDING_TOAST_MS });
      confirmation = await deps.confirm(hash);
    }
    if (options.invalidate?.length) await deps.invalidate(options.invalidate);
    if (confirmation === "timeout") deps.toast({ text: deps.messages.slow, tone: "info" });
    else if (options.success) deps.toast({ text: options.success, tone: "success", icon: options.successIcon });
    options.onSuccess?.();
    return { ok: true, error: null };
  } catch (error) {
    if (deps.isRejection(error)) {
      deps.toast({ text: deps.messages.cancelled, tone: "info" });
      return { ok: false, error: null };
    }
    return { ok: false, error: options.mapError?.(error) ?? options.failure ?? deps.messages.failed };
  }
}
