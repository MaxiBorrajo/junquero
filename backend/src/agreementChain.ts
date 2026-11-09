import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { indexedContracts } from "./contracts";
import type { Agreement, AgreementChain } from "./agreements";

const escrow = indexedContracts.find((contract) => contract.name === "escrow")!;

export function createAgreementChain(rpcUrl: string, privateKey: Hex): AgreementChain {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const client = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  return {
    async agree(agreement: Agreement, payerSignature: Hex, payeeSignature: Hex) {
      const call = {
        address: escrow.address as Address,
        abi: escrow.abi as Abi,
        functionName: "agree",
        args: [agreement, payerSignature, payeeSignature],
        account,
      } as const;
      let gas: bigint;
      try {
        gas = await client.estimateContractGas(call);
      } catch (error) {
        const name = (error as { name?: string }).name ?? "";
        return { ok: false, reason: name === "ContractFunctionExecutionError" ? "revert" : "unavailable" };
      }
      try {
        return { ok: true, txHash: await wallet.writeContract({ ...call, gas: (gas * 12n) / 10n }) };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}
