import { ContractFunctionRevertedError, createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { indexedContracts } from "./contracts";
import type { EstimateResult, ForwardRequest, RelayChain, RelayTarget } from "./relay";

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

const INVALID_REQUEST_ERRORS = new Set([
  "ERC2771ForwarderInvalidSigner",
  "ERC2771ForwarderExpiredRequest",
  "ERC2771ForwarderMismatchedValue",
  "ERC2771UntrustfulTarget",
]);

export function classifyEstimateError(error: unknown): EstimateResult | null {
  const reverted = (error as { walk?: (fn: (e: unknown) => boolean) => unknown }).walk?.(
    (inner) => inner instanceof ContractFunctionRevertedError,
  );
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  const name = reverted.data?.errorName;
  return { ok: false, reason: name && INVALID_REQUEST_ERRORS.has(name) ? "invalid_request" : "revert" };
}

export function createRelayChain(rpcUrl: string, privateKey: Hex): RelayChain {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  const base = { address: forwarder.address as Address, abi: forwarder.abi as Abi };

  return {
    estimate: async (request) => {
      try {
        const gas = await publicClient.estimateContractGas({
          ...base,
          functionName: "execute",
          args: [tuple(request)],
          account: account.address,
        });
        return { ok: true, gas } satisfies EstimateResult;
      } catch (error) {
        const failure = classifyEstimateError(error);
        if (failure) return failure;
        throw error;
      }
    },
    send: (request, gas) => wallet.writeContract({ ...base, functionName: "execute", args: [tuple(request)], gas }),
  };
}

export const relayerAddress = (privateKey: Hex): Address => privateKeyToAccount(privateKey).address;
