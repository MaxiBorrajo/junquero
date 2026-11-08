import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { indexedContracts } from "./contracts";
import type { ForwardRequest, RelayChain, RelayTarget } from "./relay";

const forwarder = indexedContracts.find((contract) => contract.name === "forwarder")!;

const RELAYED_CONTRACTS = ["escrow", "arbitration", "receipt", "governor"];

export const relayTargets: RelayTarget[] = indexedContracts
  .filter((contract) => RELAYED_CONTRACTS.includes(contract.name))
  .map(({ address, abi }) => ({ address, abi }));

const tuple = (request: ForwardRequest) => ({
  from: request.from,
  to: request.to,
  value: request.value,
  gas: request.gas,
  deadline: request.deadline,
  data: request.data,
  signature: request.signature,
});

export function createRelayChain(rpcUrl: string, privateKey: Hex): RelayChain {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  const base = { address: forwarder.address as Address, abi: forwarder.abi as Abi };

  return {
    relayerBalance: () => publicClient.getBalance({ address: account.address }),
    verify: async (request) =>
      (await publicClient.readContract({ ...base, functionName: "verify", args: [tuple(request)] })) as boolean,
    estimate: (request) =>
      publicClient.estimateContractGas({
        ...base,
        functionName: "execute",
        args: [tuple(request)],
        account: account.address,
      }),
    send: (request) => wallet.writeContract({ ...base, functionName: "execute", args: [tuple(request)] }),
  };
}

export const relayerAddress = (privateKey: Hex): Address => privateKeyToAccount(privateKey).address;
