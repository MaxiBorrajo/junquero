import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x057Dc87344bB1f7B213433C959B23bAACc711EEA" as Address,
  forwarder: "0xdcED2C36F0F1ad8F923427D6cc1010785F9C4F02" as Address,
  escrow: "0x739e7c41627E91F541B7DaCe2D5d3BEb997B0C02" as Address,
  parameterRegistry: "0x2fcf110E95EEaF5a47cB3FC39D1aEB403506632d" as Address,
  arbitration: "0x1204d91dcD99e9Fb8928Ccf5c3A7c0EcE837a642" as Address,
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
