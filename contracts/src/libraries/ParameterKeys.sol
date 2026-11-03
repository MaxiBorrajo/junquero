// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library ParameterKeys {
    bytes32 internal constant FEE_BPS = keccak256("FEE_BPS");
    bytes32 internal constant AGREEMENT_WINDOW = keccak256("AGREEMENT_WINDOW");
    bytes32 internal constant AUTO_RELEASE_SHORT = keccak256("AUTO_RELEASE_SHORT");
    bytes32 internal constant AUTO_RELEASE_MILESTONE = keccak256("AUTO_RELEASE_MILESTONE");
    bytes32 internal constant DISPUTE_RESPONSE_WINDOW = keccak256("DISPUTE_RESPONSE_WINDOW");
    bytes32 internal constant RESERVATION_GRACE = keccak256("RESERVATION_GRACE");
    bytes32 internal constant RESERVATION_RAMP = keccak256("RESERVATION_RAMP");
    bytes32 internal constant RESERVATION_MAX_BPS = keccak256("RESERVATION_MAX_BPS");
    bytes32 internal constant CASH_FEE_BPS = keccak256("CASH_FEE_BPS");
    bytes32 internal constant CANCEL_FEE_AGREED_BPS = keccak256("CANCEL_FEE_AGREED_BPS");
    bytes32 internal constant NO_SHOW_COMPENSATION_BPS = keccak256("NO_SHOW_COMPENSATION_BPS");
    bytes32 internal constant CANCEL_PAYEE_SHARE_BPS = keccak256("CANCEL_PAYEE_SHARE_BPS");
    bytes32 internal constant NO_SHOW_WAIT = keccak256("NO_SHOW_WAIT");
    bytes32 internal constant FREE_CANCEL_NOTICE = keccak256("FREE_CANCEL_NOTICE");
    bytes32 internal constant FREE_CANCELS_PER_ACCOUNT_MONTH = keccak256("FREE_CANCELS_PER_ACCOUNT_MONTH");
    bytes32 internal constant FREE_CANCELS_PER_PAIR_MONTH = keccak256("FREE_CANCELS_PER_PAIR_MONTH");
    bytes32 internal constant ADVANCE_MAX_BPS = keccak256("ADVANCE_MAX_BPS");
    bytes32 internal constant ADVANCE_MIN_CLOSED_ORDERS = keccak256("ADVANCE_MIN_CLOSED_ORDERS");
    bytes32 internal constant MILESTONE_MIN_DURATION = keccak256("MILESTONE_MIN_DURATION");
    bytes32 internal constant CONTRIBUTION_MIN_BPS = keccak256("CONTRIBUTION_MIN_BPS");
    bytes32 internal constant CONTRIBUTION_MAX_BPS = keccak256("CONTRIBUTION_MAX_BPS");
    bytes32 internal constant OBJECTION_MONEY_BPS = keccak256("OBJECTION_MONEY_BPS");
    bytes32 internal constant OBJECTION_MIN_PEOPLE = keccak256("OBJECTION_MIN_PEOPLE");
    bytes32 internal constant JUROR_INVITE_WINDOW = keccak256("JUROR_INVITE_WINDOW");
    bytes32 internal constant JUROR_REPLACEMENT_ROUNDS = keccak256("JUROR_REPLACEMENT_ROUNDS");
    bytes32 internal constant JUROR_MAX_ACTIVE_CASES = keccak256("JUROR_MAX_ACTIVE_CASES");
}
