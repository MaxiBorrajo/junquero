import { parseAbi } from "viem";

export const arbitrationAbi = parseAbi([
  "struct Case { uint256 orderId; address payer; address payee; address claimant; address token; uint128 fee; uint8 jurors; uint8 phase; uint8 round; uint8 revealedVotes; uint8 payeeVotes; uint8 payerVotes; uint40 commitEnd; uint40 revealEnd; bytes32 reasonHash; uint8 roundBase; uint8 roundStart; bool appealed; bool round1Paid; bool verdictPayee; uint40 appealEnd; address appellant; uint128 appealFee; }",
  "struct JurorAccount { uint128 staked; uint128 locked; uint8 active; bool seed; }",
  "struct JurorCase { bool selected; bytes32 voteCommit; uint8 vote; }",
  "function getCase(uint256 caseId) view returns (Case)",
  "function jurorsOf(uint256 caseId) view returns (address[])",
  "function jurorCase(uint256 caseId, address juror) view returns (JurorCase)",
  "function account(address juror) view returns (JurorAccount)",
  "function isEligible(address juror, uint256 caseId) view returns (bool)",
  "function committersOf(uint256 caseId, uint8 round) view returns (address[])",
  "function revealersOf(uint256 caseId, uint8 round) view returns (address[])",
  "function rewards(address token, address juror) view returns (uint256)",
  "function respond(uint256 caseId, bytes32 responseHash)",
  "function commitSeed(uint256 caseId, bytes32 commitment)",
  "function revealSeed(uint256 caseId, bytes32 secret)",
  "function commitVote(uint256 caseId, bytes32 commitment)",
  "function revealVote(uint256 caseId, uint8 vote, bytes32 salt)",
  "function appeal(uint256 caseId)",
  "function appealWithPermit(uint256 caseId, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function stake(uint128 amount)",
  "function stakeWithPermit(uint128 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function unstake(uint128 amount)",
  "function withdrawReward(address token)",
  "function recuse(uint256 caseId, address juror)",
]);

export enum CasePhase {
  None = 0,
  Response = 1,
  Seed = 2,
  Vote = 3,
  NeedsEmergency = 4,
  Resolved = 5,
  Decided = 6,
}

export const VOTE_PAYER = 1;
export const VOTE_PAYEE = 2;
