import { keccak256, toBytes, type Address } from "viem";
import { readContract } from "wagmi/actions";
import { wagmiAdapter } from "../wallet/appkit";
import { escrowAbi, forwarderAbi, registryAbi, tokenAbi } from "./abis";
import { deployment } from "./deployment";

const config = () => wagmiAdapter.wagmiConfig;

export const readTokenBalance = (owner: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.token, abi: tokenAbi, functionName: "balanceOf", args: [owner] });

export const readTokenNonce = (owner: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.token, abi: tokenAbi, functionName: "nonces", args: [owner] });

export const readForwarderNonce = (owner: Address): Promise<bigint> =>
  readContract(config(), { address: deployment.forwarder, abi: forwarderAbi, functionName: "nonces", args: [owner] });

export interface FeeRule {
  bps: bigint;
  floor: bigint;
  cap: bigint;
}

export async function readFeeRule(): Promise<FeeRule> {
  const [bps, tokenConfig] = await Promise.all([
    readContract(config(), { address: deployment.parameterRegistry, abi: registryAbi, functionName: "get", args: [keccak256(toBytes("FEE_BPS"))] }),
    readContract(config(), { address: deployment.escrow, abi: escrowAbi, functionName: "tokenConfig", args: [deployment.token] }),
  ]);
  return { bps: BigInt(bps), floor: tokenConfig.feeFloor, cap: tokenConfig.feeCap };
}
