import { parseAbi } from "viem";

export const orderAbi = parseAbi([
  "struct Order { address payer; uint8 status; uint8 mode; uint8 modality; uint8 sizeClass; bool extended; uint8 category; uint8 changeRequests; bool hasMilestones; bool isGroup; uint40 createdAt; address payee; uint40 startsAt; uint40 deliveredAt; uint40 settledAt; bool paidOut; address token; uint40 agreedAt; uint40 deadline; address reservedPayee; uint40 reservedAt; uint40 checkedInAt; bool arrivalConfirmed; uint128 deposited; uint128 price; bytes32 specHash; bytes32 termsHash; bytes32 evidenceHash; }",
  "struct Release { uint256 orderId; address payee; uint128 amount; uint8 rating; bytes32 evidenceHash; uint40 expiry; }",
  "struct DepositAuth { uint8 method; uint256 nonce; uint256 deadline; bytes signature; }",
  "function getOrder(uint256 orderId) view returns (Order)",
  "function deliver(uint256 orderId, bytes32 evidenceHash)",
  "function release(Release releaseData, bytes payerSignature)",
  "function checkIn(uint256 orderId)",
  "function confirmArrival(uint256 orderId)",
  "function cancel(uint256 orderId)",
  "function extendReview(uint256 orderId)",
  "function requestChanges(uint256 orderId, bytes32 reasonHash)",
  "function openDispute(uint256 orderId, bytes32 reasonHash, DepositAuth auth)",
  "function autoRelease(uint256 orderId)",
]);

export enum OrderStatus {
  None = 0,
  Open = 1,
  Reserved = 2,
  Agreed = 3,
  Delivered = 4,
  Disputed = 5,
  Settled = 6,
  Cancelled = 7,
  Funding = 8,
}

export const releaseTypes = {
  Release: [
    { name: "orderId", type: "uint256" },
    { name: "payee", type: "address" },
    { name: "amount", type: "uint128" },
    { name: "rating", type: "uint8" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "expiry", type: "uint40" },
  ],
} as const;
