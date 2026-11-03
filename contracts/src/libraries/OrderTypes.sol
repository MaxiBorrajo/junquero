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
    Cancelled
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
    Expired
}

struct Order {
    address payer;
    OrderStatus status;
    PaymentMode mode;
    Modality modality;
    SizeClass sizeClass;
    bool extended;
    uint40 createdAt;
    address payee;
    uint40 startsAt;
    uint40 deliveredAt;
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
    uint128 milestoneAmount;
    uint128 witnessAmount;
    uint128 reputationMin;
    uint128 feeFloor;
    uint128 feeCap;
    uint128 cashFeeFloor;
    uint128 reservationCap;
}
