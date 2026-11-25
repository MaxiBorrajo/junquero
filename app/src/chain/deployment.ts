import type { Address } from "viem";
import { CHAIN_ID } from "../config";

export const deployment = {
  chainId: CHAIN_ID,
  token: "0x18714d5aA9dB30054893714Ef1D4af8f42D7a2dc" as Address,
  forwarder: "0x37B4b8d022e59C70F512E27AE3f6a0621D518b6c" as Address,
  escrow: "0x668B95EE87Af4f7E995647C68A109a4B8c5B685f" as Address,
  parameterRegistry: "0x1EDE81496348c213B80F051E02CF7a7A529731fe" as Address,
  arbitration: "0x398Ac7b188e6dcFF7Ac1918068D8896E051Cb990" as Address,
  receipt: "0x1aaA132a95d67f8FaA01c018B8572D4064b36B81" as Address,
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
