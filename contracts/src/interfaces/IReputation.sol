// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum Role {
    Provider,
    Requester,
    Witness,
    Juror
}

struct Stats {
    uint32 closed;
    uint32 closedClean;
    uint32 cashClosed;
    uint32 disputes;
    uint32 disputesLost;
    uint32 failures;
    uint32 ratingSum;
    uint32 ratingCount;
}

interface IReputation {
    event SettlementRecorded(address indexed payer, address indexed payee, uint8 rating, bool automatic, bool disputed);
    event SettlementSkipped(address indexed payer, address indexed payee, uint8 reason);
    event CashRecorded(address indexed payer, address indexed payee, uint8 rating);
    event FailureRecorded(address indexed account, Role role);
    event DisputeRecorded(address indexed account, Role role, bool lost);

    error ZeroAddress();
    error InvalidRating(uint8 rating);

    function recordSettled(address payer, address payee, uint8 rating, bool automatic, bool disputed, bool qualifies)
        external;
    function recordCash(address payer, address payee, uint8 rating) external;
    function recordFailure(address account, Role role) external;
    function recordDispute(address account, Role role, bool lost) external;

    function stats(address account, Role role) external view returns (Stats memory);
    function closedWithoutDispute(address account) external view returns (uint32);
    function pairCount(address a, address b) external view returns (uint32);
}
