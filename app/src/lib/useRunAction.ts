import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { waitForTx } from "../chain/waitForTx";
import { useToast } from "../components/Toast";
import { t } from "../i18n";
import { isRejection } from "../wallet/sign";
import { runAction, type RunActionOptions } from "./runAction";

// Ejecuta una acción de la pantalla: maneja "ocupado", el error en pantalla, el cartel de éxito y la espera de la red.
export function useRunAction() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (action: () => Promise<string | void>, options: RunActionOptions = {}): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const result = await runAction(
          {
            toast: (value) => toast(value as Parameters<typeof toast>[0]),
            invalidate: async (keys) => void (await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })))),
            confirm: (hash) => waitForTx(hash as `0x${string}`),
            isRejection,
            messages: { pending: t.common.txPending, slow: t.common.txSlow, cancelled: t.order.signCancelled, failed: t.common.genericError },
          },
          action,
          options,
        );
        setError(result.error);
        return result.ok;
      } finally {
        setBusy(false);
      }
    },
    [toast, queryClient],
  );

  return { run, busy, error, setError };
}
