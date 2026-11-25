import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x18714d5aA9dB30054893714Ef1D4af8f42D7a2dc" as Address,
  forwarder: "0x371209e03691ef431FE1d3b1662cD07d55f922e8" as Address,
  escrow: "0x582D274ed6711e97e72c654AC99baa2A3eC32420" as Address,
  parameterRegistry: "0x2c6B9DEE7226c5383585B9C045572F9a6229fA22" as Address,
  arbitration: "0xAa5BeBefd20a045B208229BbceF4A8C62Fa6fA02" as Address,
  receipt: "0x0FE4E6Dd91d565E604bc1859b826fF054c945760" as Address,
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
