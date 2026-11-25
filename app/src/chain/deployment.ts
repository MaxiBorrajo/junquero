import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x18714d5aA9dB30054893714Ef1D4af8f42D7a2dc" as Address,
  forwarder: "0xE892a7B4349B115FA8bAEABfA810363F4b03C78c" as Address,
  escrow: "0x4cD68F659560aFc94Ae8CB07ed6E2Cff87F16846" as Address,
  parameterRegistry: "0xf7b853b9383525b4f70d6cF014f8765FE3023b4E" as Address,
  arbitration: "0x02C3c5549a33Ec9c5Fa3A6CF80c4Ae4179227944" as Address,
  receipt: "0x01dA3B0a81ba0d27c178F1d00eCd1cD78d20fCa7" as Address,
  tokenName: "USDC",
  tokenPermitVersion: "1",
  tokenDecimals: 6,
} as const;

export type Deployment = {
  chainId: number;
  token: Address;
  forwarder: Address;
  escrow: Address;
  tokenName: string;
  tokenPermitVersion: string;
};
