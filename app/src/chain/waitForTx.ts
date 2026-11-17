import type { Hex } from "viem";
import { waitForTransactionReceipt } from "wagmi/actions";
import { publicConfig } from "./publicConfig";
import { CONFIRMATION_TIMEOUT_MS, waitForConfirmation, type Confirmation } from "./confirmation";

// Espera el recibo de la transacción en la red (Sepolia).
export const waitForTx = (hash: Hex): Promise<Confirmation> =>
  waitForConfirmation(
    hash,
    async (value) => (await waitForTransactionReceipt(publicConfig, { hash: value as Hex, timeout: CONFIRMATION_TIMEOUT_MS })).status === "success",
    CONFIRMATION_TIMEOUT_MS,
  );
