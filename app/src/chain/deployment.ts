import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x18714d5aA9dB30054893714Ef1D4af8f42D7a2dc" as Address,
  forwarder: "0x98ca8312406c3b1D74919e75667976093D365bAb" as Address,
  escrow: "0x5cF0e730Dd9AFcf8061d69Bb6ccdacAb4e31E2Bc" as Address,
  parameterRegistry: "0x3B6BB6a36996A7d1512f4076f030F28C6dA41F9a" as Address,
  arbitration: "0xfF7Dd03064B21FaeC9cd14aA66851Ed1136C81cF" as Address,
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
