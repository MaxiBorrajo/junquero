// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArbitrationEvents {
    event CaseOpened(
        uint256 indexed caseId, uint256 indexed orderId, address indexed claimant, uint8 jurors, uint128 fee
    );
    event Responded(uint256 indexed caseId, address indexed respondent, bytes32 responseHash);
    event ResolvedByDefault(uint256 indexed caseId, address indexed winner);
    event SeedRoundStarted(uint256 indexed caseId, uint8 round, uint40 commitEnd, uint40 revealEnd);
    event SeedCommitted(uint256 indexed caseId, address indexed juror);
    event SeedRevealed(uint256 indexed caseId, address indexed juror);
    event Recused(uint256 indexed caseId, address indexed by, address indexed juror);
    event JuryDrawn(uint256 indexed caseId, address[] jurors, uint40 commitEnd, uint40 revealEnd);
    event NeedsEmergencyResolution(uint256 indexed caseId, uint8 reason);
    event VoteCommitted(uint256 indexed caseId, address indexed juror);
    event VoteRevealed(uint256 indexed caseId, address indexed juror, uint8 vote);
    event CaseDecided(uint256 indexed caseId, bool payeeWins, uint8 payeeVotes, uint8 payerVotes);
    event EmergencyResolved(uint256 indexed caseId, bool payeeWins, bytes32 reasonHash);
    event VerdictReached(uint256 indexed caseId, bool payeeWins, uint40 appealEnd);
    event Appealed(uint256 indexed caseId, address indexed appellant, uint128 fee, uint8 jurors);
    event JurorPaid(uint256 indexed caseId, address indexed juror, uint256 reward);
    event JurorSlashed(uint256 indexed caseId, address indexed juror, uint256 amount);
    event Staked(address indexed juror, uint256 amount);
    event Unstaked(address indexed juror, uint256 amount);
    event RewardWithdrawn(address indexed token, address indexed juror, uint256 amount);
    event SeedJurorSet(address indexed juror, bool seed);

    error ZeroAddress();
    error NotEscrow(address caller);
    error UnknownCase(uint256 caseId);
    error WrongPhase(uint256 caseId, uint8 phase);
    error NotRespondent(address caller);
    error WindowClosed(uint40 endsAt);
    error WindowOpen(uint40 endsAt);
    error ResponseWindowOpen(uint40 endsAt);
    error NotEligible(address juror);
    error AlreadyCommitted(address juror);
    error TooManyParticipants();
    error NothingCommitted(address juror);
    error AlreadyRevealed(address juror);
    error HashMismatch();
    error NotParty(address caller);
    error RecusalLimitReached(uint64 max);
    error NotSelected(address juror);
    error InvalidVote(uint8 vote);
    error VotingNotOver(uint40 revealEnd);
    error InsufficientStake(uint256 available, uint256 requested);
    error NothingToWithdraw();
    error NotLoser(address caller);
}
