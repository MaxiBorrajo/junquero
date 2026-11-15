import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { indexedContracts } from "./contracts";
import { noLock, type Lock } from "./relayerLock";
import type { MarkChain } from "./marks";

const escrow = indexedContracts.find((contract) => contract.name === "escrow")!;

export function createMarkChain(rpcUrl: string, privateKey: Hex, lock: Lock = noLock): MarkChain {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const client = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  return {
    async hadApplicants(ids) {
      const results = await client.multicall({
        contracts: ids.map((id) => ({ address: escrow.address as Address, abi: escrow.abi as Abi, functionName: "hadApplicants", args: [BigInt(id)] })),
        allowFailure: true,
      });
      return results.map((entry) => (entry.status === "success" ? Boolean(entry.result) : null));
    },
    async mark(id) {
      const call = { address: escrow.address as Address, abi: escrow.abi as Abi, functionName: "markApplicant", args: [BigInt(id)], account };
      try {
        await client.simulateContract(call);
      } catch {
        return { sent: false };
      }
      return { sent: true, txHash: await lock(() => wallet.writeContract(call)) };
    },
  };
}
