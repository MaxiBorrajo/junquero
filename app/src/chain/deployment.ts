import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x18714d5aA9dB30054893714Ef1D4af8f42D7a2dc" as Address,
  forwarder: "0xf9A95F4Dec87121da3cddb921D0c8c60361485E6" as Address,
  escrow: "0xdc05BE8B7587e39De3fCC06d6F9D0eB827f311B5" as Address,
  parameterRegistry: "0x6c523B229Df30030F21c26c74f9AE58185106280" as Address,
  arbitration: "0x7BC3012dEbcBEC295468DA44247d7357daF28742" as Address,
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
