import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x18714d5aA9dB30054893714Ef1D4af8f42D7a2dc" as Address,
  forwarder: "0xcCB173C2E6AB19421aAC62537cfE752F9258b71d" as Address,
  escrow: "0x99C9117F940c0a9f8e9C70971d39B3bB6b5697fe" as Address,
  parameterRegistry: "0x27678b49807A463aDDCB1537919179Bc61bAB7Bd" as Address,
  arbitration: "0x800408863B0164c57bBB31556A537413F984eB18" as Address,
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
