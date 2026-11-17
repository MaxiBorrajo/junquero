import { BPS, protocolFee } from "./fee";

export interface TerminationInput {
  deposited: bigint;
  currentAmount: bigint;
  progressBps: number;
  compBps: bigint;
  payeeShareBps: bigint;
  fee: { bps: bigint; floor: bigint; cap: bigint };
}

// Replica `terminateEarly` del contrato: el avance del hito en curso (menos comisión) más la parte de la compensación que se lleva quien trabajó.
export function terminationPreview(input: TerminationInput): { toPayee: bigint; refund: bigint; compensation: bigint; progress: bigint } {
  const progress = (input.currentAmount * BigInt(input.progressBps)) / BPS;
  const compensation = ((input.deposited - progress) * input.compBps) / BPS;
  const fee = protocolFee(progress, input.fee.bps, input.fee.floor, input.fee.cap);
  const compToPayee = (compensation * input.payeeShareBps) / BPS;
  return { toPayee: progress - fee + compToPayee, refund: input.deposited - progress - compensation, compensation, progress };
}
