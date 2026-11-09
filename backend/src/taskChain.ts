import { ContractFunctionRevertedError, createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { indexedContracts } from "./contracts";
import type { AttemptResult, CaseState, OrderState, TaskChain, TaskKind } from "./tasks";

const escrow = indexedContracts.find((contract) => contract.name === "escrow")!;
const arbitration = indexedContracts.find((contract) => contract.name === "arbitration")!;

const TIMED_ERRORS = new Set([
  "AutoReleaseNotReady",
  "DeadlineNotReached",
  "FundingNotExpired",
  "ResponseWindowOpen",
  "WindowOpen",
  "VotingNotOver",
]);

const RETRY_MARGIN_SECONDS = 2;

export function retryAtFrom(error: unknown): number | null {
  const reverted = (error as { walk?: (fn: (e: unknown) => boolean) => unknown }).walk?.(
    (inner) => inner instanceof ContractFunctionRevertedError,
  );
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  const { errorName, args } = reverted.data ?? {};
  if (!errorName || !TIMED_ERRORS.has(errorName) || !args?.length) return null;
  const until = Number(args[0]);
  return until > 0 ? until + RETRY_MARGIN_SECONDS : null;
}

const target = (kind: TaskKind) => (kind === "order" ? escrow : arbitration);

export function createTaskChain(rpcUrl: string, privateKey: Hex): TaskChain {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const client = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });

  return {
    async readOrders(ids) {
      const results = await client.multicall({
        contracts: ids.map((id) => ({
          address: escrow.address as Address,
          abi: escrow.abi as Abi,
          functionName: "getOrder",
          args: [BigInt(id)],
        })),
        allowFailure: true,
      });
      return results.map((entry): OrderState | null => {
        if (entry.status !== "success") return null;
        const order = entry.result as { status: number; hasMilestones: boolean };
        return { status: Number(order.status), hasMilestones: order.hasMilestones };
      });
    },
    async readCases(ids) {
      const results = await client.multicall({
        contracts: ids.map((id) => ({
          address: arbitration.address as Address,
          abi: arbitration.abi as Abi,
          functionName: "getCase",
          args: [BigInt(id)],
        })),
        allowFailure: true,
      });
      return results.map((entry): CaseState | null => {
        if (entry.status !== "success") return null;
        return { phase: Number((entry.result as { phase: number }).phase) };
      });
    },
    async attempt(kind, action, id) {
      const contract = target(kind);
      const call = {
        address: contract.address as Address,
        abi: contract.abi as Abi,
        functionName: action,
        args: [BigInt(id)],
        account,
      };
      try {
        await client.simulateContract(call);
      } catch (error) {
        return { sent: false, retryAt: retryAtFrom(error) } satisfies AttemptResult;
      }
      return { sent: true, txHash: await wallet.writeContract(call) } satisfies AttemptResult;
    },
  };
}
