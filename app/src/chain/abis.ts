import { parseAbi } from "viem";

export const tokenAbi = parseAbi(["function nonces(address owner) view returns (uint256)", "function balanceOf(address account) view returns (uint256)"]);

export const forwarderAbi = parseAbi(["function nonces(address owner) view returns (uint256)"]);

export const registryAbi = parseAbi(["function get(bytes32 key) view returns (uint64)"]);

export const escrowAbi = parseAbi([
  "struct CreateParams { address token; uint128 amount; bytes32 specHash; uint8 mode; uint8 modality; uint40 startsAt; uint40 deadline; uint8 category; }",
  "struct DepositAuth { uint8 method; uint256 nonce; uint256 deadline; bytes signature; }",
  "function createOrder(CreateParams params, DepositAuth auth) returns (uint256 orderId)",
  "function tokenConfig(address token) view returns ((bool allowed, uint8 method, uint128 smallMax, uint128 mediumMax, uint128 milestoneAmount, uint128 witnessAmount, uint128 reputationMin, uint128 feeFloor, uint128 feeCap, uint128 cashFeeFloor, uint128 reservationCap, uint128 jurorFee))",
]);
