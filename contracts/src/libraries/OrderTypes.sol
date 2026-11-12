// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum OrderStatus {
    None,
    Open,
    Reserved,
    Agreed,
    Delivered,
    Disputed,
    Settled,
    Cancelled,
    Funding
}

enum PaymentMode {
    Escrowed,
    Cash
}

enum Modality {
    OnSite,
    Remote
}

enum DepositMethod {
    Permit,
    Permit2,
    Allowance
}

enum SizeClass {
    Small,
    Medium,
    Large
}

enum CancelReason {
    PayerCancelled,
    PayeeCancelled,
    NoShow,
    Expired,
    Moderated
}

struct Order {
    address payer;
    OrderStatus status;
    PaymentMode mode;
    Modality modality;
    SizeClass sizeClass;
    bool extended;
    uint8 category;
    uint8 changeRequests;
    bool hasMilestones;
    bool isGroup;
    uint40 createdAt;
    address payee;
    uint40 startsAt;
    uint40 deliveredAt;
    uint40 settledAt;
    bool paidOut;
    address token;
    uint40 agreedAt;
    uint40 deadline;
    address reservedPayee;
    uint40 reservedAt;
    uint40 checkedInAt;
    bool arrivalConfirmed;
    uint128 deposited;
    uint128 price;
    bytes32 specHash;
    bytes32 termsHash;
    bytes32 evidenceHash;
}

struct CreateParams {
    address token;
    uint128 amount;
    bytes32 specHash;
    PaymentMode mode;
    Modality modality;
    uint40 startsAt;
    uint40 deadline;
    uint8 category;
}

enum MilestoneStatus {
    Pending,
    Delivered,
    Paid
}

struct Milestone {
    uint128 amount;
    MilestoneStatus status;
    uint40 deliveredAt;
    bytes32 evidenceHash;
}

struct MilestonePlan {
    uint8 count;
    uint8 next;
    uint8 disputedIndex;
    bool firstIsAdvance;
    bool started;
    bool disputing;
    uint16 progressBps;
    uint16 ratingSum;
    uint16 ratingCount;
    uint128 paidTotal;
    uint128 refundedTotal;
    uint128 feeTotal;
    bytes32 progressEvidence;
}

struct MilestoneTerms {
    bytes32 baseTerms;
    uint128[] amounts;
    bytes32[] criteria;
    bool firstIsAdvance;
}

struct MilestoneRelease {
    uint256 orderId;
    uint8 index;
    uint128 amount;
    uint8 rating;
    bytes32 evidenceHash;
    uint40 expiry;
}

struct GroupParams {
    address coordinator;
    uint40 fundingDeadline;
}

struct GroupInfo {
    uint128 target;
    uint128 totalContributed;
    uint40 fundingDeadline;
    address proposedPayee;
    uint40 proposedAt;
    uint32 proposalEpoch;
    uint128 vetoMoney;
    uint8 vetoCount;
    uint32 coordinatorEpoch;
    bytes32 reviewKey;
    uint128 objectionMoney;
    uint8 objectionCount;
}

struct WitnessAssignment {
    uint256 orderId;
    address witness;
    uint40 expiry;
}

struct Attestation {
    uint256 orderId;
    uint8 index;
    bytes32 evidenceHash;
    bool approved;
    uint40 expiry;
}

struct AttestationRecord {
    bytes32 evidenceHash;
    bool approved;
}

struct DepositAuth {
    DepositMethod method;
    uint256 nonce;
    uint256 deadline;
    bytes signature;
}

struct Reservation {
    uint256 orderId;
    address payer;
    address payee;
    uint40 expiry;
}

struct Agreement {
    uint256 orderId;
    address payer;
    address payee;
    uint128 price;
    bytes32 specHash;
    bytes32 termsHash;
    uint40 expiry;
}

struct Release {
    uint256 orderId;
    address payee;
    uint128 amount;
    uint8 rating;
    bytes32 evidenceHash;
    uint40 expiry;
}

struct TokenConfig {
    bool allowed;
    DepositMethod method;
    uint128 smallMax;
    uint128 mediumMax;
    uint128 witnessAmount;
    uint128 reputationMin;
    uint128 feeFloor;
    uint128 feeCap;
    uint128 cashFeeFloor;
    uint128 reservationCap;
    uint128 jurorFee;
    uint128 witnessFee;
}

struct Dispute {
    address claimant;
    uint128 fee;
    uint40 openedAt;
    uint256 caseId;
    bytes32 reasonHash;
}
