import { createPublicClient, http, parseAbi, type Address } from "viem";
import { sepolia } from "viem/chains";
import { indexedContracts } from "./contracts";

// Lecturas del estado de la cadena que antes hacía cada celular por su cuenta. Ahora las hace el servidor una vez cada pocos
// segundos y las comparten todas las personas que miran el mismo trabajo o caso.

const escrow = indexedContracts.find((contract) => contract.name === "escrow")!.address as Address;
const arbitration = indexedContracts.find((contract) => contract.name === "arbitration")!.address as Address;

const orderAbi = parseAbi([
  "struct Order { address payer; uint8 status; uint8 mode; uint8 modality; uint8 sizeClass; bool extended; uint8 category; uint8 changeRequests; bool hasMilestones; bool isGroup; uint40 createdAt; address payee; uint40 startsAt; uint40 deliveredAt; uint40 settledAt; bool paidOut; address token; uint40 agreedAt; uint40 deadline; address reservedPayee; uint40 reservedAt; uint40 checkedInAt; bool arrivalConfirmed; uint128 deposited; uint128 price; bytes32 specHash; bytes32 termsHash; bytes32 evidenceHash; }",
  "function getOrder(uint256 orderId) view returns (Order)",
]);

const groupAbi = parseAbi([
  "struct GroupInfo { uint128 target; uint128 totalContributed; uint40 fundingDeadline; address proposedPayee; uint40 proposedAt; uint32 proposalEpoch; uint128 vetoMoney; uint8 vetoCount; uint32 coordinatorEpoch; bytes32 reviewKey; uint128 objectionMoney; uint8 objectionCount; }",
  "function getGroup(uint256 orderId) view returns (GroupInfo)",
  "function contributorsOf(uint256 orderId) view returns (address[])",
  "function contributionOf(uint256 orderId, address account) view returns (uint128)",
]);

const milestoneAbi = parseAbi([
  "struct Milestone { uint128 amount; uint8 status; uint40 deliveredAt; bytes32 evidenceHash; }",
  "struct MilestonePlan { uint8 count; uint8 next; uint8 disputedIndex; bool firstIsAdvance; bool started; bool disputing; uint16 progressBps; uint16 ratingSum; uint16 ratingCount; uint128 paidTotal; uint128 refundedTotal; uint128 feeTotal; bytes32 progressEvidence; }",
  "function getMilestones(uint256 orderId) view returns (Milestone[])",
  "function getPlan(uint256 orderId) view returns (MilestonePlan)",
]);

const caseAbi = parseAbi([
  "struct Case { uint256 orderId; address payer; address payee; address claimant; address token; uint128 fee; uint8 jurors; uint8 phase; uint8 round; uint8 revealedVotes; uint8 payeeVotes; uint8 payerVotes; uint40 commitEnd; uint40 revealEnd; bytes32 reasonHash; uint8 roundBase; uint8 roundStart; bool appealed; bool round1Paid; bool verdictPayee; uint40 appealEnd; address appellant; uint128 appealFee; }",
  "function getCase(uint256 caseId) view returns (Case)",
  "function jurorsOf(uint256 caseId) view returns (address[])",
]);

// Los números grandes viajan como texto: JSON no tiene enteros de 128 bits.
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, jsonSafe(inner)]));
  return value;
}

export interface ChainReads {
  order(orderId: number): Promise<unknown>;
  milestones(orderId: number): Promise<unknown>;
  group(orderId: number): Promise<unknown>;
  caseOf(caseId: number): Promise<unknown>;
}

export function createChainReads(rpcUrl: string): ChainReads {
  // `multicall: true` junta las lecturas que se piden en el mismo instante en una sola llamada a la red.
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl), batch: { multicall: true } });
  return {
    async order(orderId) {
      return jsonSafe(await client.readContract({ address: escrow, abi: orderAbi, functionName: "getOrder", args: [BigInt(orderId)] }));
    },
    async milestones(orderId) {
      const [milestones, plan] = await Promise.all([
        client.readContract({ address: escrow, abi: milestoneAbi, functionName: "getMilestones", args: [BigInt(orderId)] }),
        client.readContract({ address: escrow, abi: milestoneAbi, functionName: "getPlan", args: [BigInt(orderId)] }),
      ]);
      return jsonSafe({ milestones, plan });
    },
    async group(orderId) {
      const [info, contributors] = await Promise.all([
        client.readContract({ address: escrow, abi: groupAbi, functionName: "getGroup", args: [BigInt(orderId)] }),
        client.readContract({ address: escrow, abi: groupAbi, functionName: "contributorsOf", args: [BigInt(orderId)] }),
      ]);
      const amounts = await Promise.all(contributors.map((account) => client.readContract({ address: escrow, abi: groupAbi, functionName: "contributionOf", args: [BigInt(orderId), account] })));
      return jsonSafe({ info, contributors: contributors.map((address, index) => ({ address, amount: amounts[index] })) });
    },
    async caseOf(caseId) {
      const [snapshot, jurors] = await Promise.all([
        client.readContract({ address: arbitration, abi: caseAbi, functionName: "getCase", args: [BigInt(caseId)] }),
        client.readContract({ address: arbitration, abi: caseAbi, functionName: "jurorsOf", args: [BigInt(caseId)] }),
      ]);
      return jsonSafe({ case: snapshot, jurors });
    },
  };
}

// Para las pruebas: se puede cambiar quién lee la cadena.
let factory: (rpcUrl: string) => ChainReads = createChainReads;
export const chainReadsFor = (rpcUrl: string): ChainReads => factory(rpcUrl);
export const overrideChainReads = (next: ((rpcUrl: string) => ChainReads) | null): void => {
  factory = next ?? createChainReads;
};
