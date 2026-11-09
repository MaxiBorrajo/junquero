import { encodeFunctionData, keccak256, parseAbi, toBytes, type Address, type Hex } from "viem";
import type { Eip1193 } from "./login";

export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

const abi = parseAbi(["function resolveEmergency(uint256 caseId, bool payeeWins, bytes32 reasonHash)"]);

export const reasonHash = (reason: string): Hex => keccak256(toBytes(reason.trim()));

export const encodeEmergency = (caseId: number, payeeWins: boolean, reason: string): Hex =>
  encodeFunctionData({ abi, functionName: "resolveEmergency", args: [BigInt(caseId), payeeWins, reasonHash(reason)] });

export async function sendEmergency(provider: Eip1193, from: string, arbitration: Address, caseId: number, payeeWins: boolean, reason: string): Promise<Hex> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }] });
  } catch (error) {
    if ((error as { code?: number }).code === 4001) throw error;
  }
  return (await provider.request({ method: "eth_sendTransaction", params: [{ from, to: arbitration, data: encodeEmergency(caseId, payeeWins, reason) }] })) as Hex;
}
