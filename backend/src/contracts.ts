import type { Abi, Address } from "viem";
import deployment from "../../contracts/deployments/sepolia.json";
import arbitration from "../../contracts/deployments/abi/Arbitration.json";
import credentials from "../../contracts/deployments/abi/Credentials.json";
import escrow from "../../contracts/deployments/abi/Escrow.json";
import forwarder from "../../contracts/deployments/abi/Forwarder.json";
import parameterRegistry from "../../contracts/deployments/abi/ParameterRegistry.json";
import governor from "../../contracts/deployments/abi/ProtocolGovernor.json";
import receipt from "../../contracts/deployments/abi/Receipt.json";
import reputation from "../../contracts/deployments/abi/Reputation.json";
import timelock from "../../contracts/deployments/abi/TimelockController.json";
import treasury from "../../contracts/deployments/abi/Treasury.json";
import votingWeight from "../../contracts/deployments/abi/VotingWeight.json";

export interface IndexedContract {
  name: string;
  address: Address;
  abi: Abi;
}

const abis: Record<string, Abi> = {
  escrow: escrow as Abi,
  arbitration: arbitration as Abi,
  credentials: credentials as Abi,
  forwarder: forwarder as Abi,
  parameterRegistry: parameterRegistry as Abi,
  governor: governor as Abi,
  receipt: receipt as Abi,
  reputation: reputation as Abi,
  timelock: timelock as Abi,
  treasury: treasury as Abi,
  votingWeight: votingWeight as Abi,
};

export const indexedContracts: IndexedContract[] = Object.entries(abis).map(([name, abi]) => ({
  name,
  abi,
  address: (deployment.contracts as Record<string, { address: string }>)[name].address.toLowerCase() as Address,
}));

export const startBlock: number = deployment.startBlock;
