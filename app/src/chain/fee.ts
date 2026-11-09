export const BPS = 10_000n;

export function protocolFee(amount: bigint, bps: bigint, floor: bigint, cap: bigint): bigint {
  if (bps === 0n) return 0n;
  let fee = (amount * bps) / BPS;
  if (fee < floor) fee = floor;
  if (cap !== 0n && fee > cap) fee = cap;
  if (fee > amount) fee = amount;
  return fee;
}
