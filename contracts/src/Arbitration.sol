// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IArbitration} from "./interfaces/IArbitration.sol";
import {IArbitrationEvents} from "./interfaces/IArbitrationEvents.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";
import {IParameterRegistry} from "./interfaces/IParameterRegistry.sol";
import {IReputation} from "./interfaces/IReputation.sol";
import {ParameterKeys} from "./libraries/ParameterKeys.sol";
import {Credentials} from "./Credentials.sol";

contract Arbitration is IArbitration, IArbitrationEvents, ERC2771Context, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Phase {
        None,
        Response,
        Seed,
        Vote,
        NeedsEmergency,
        Resolved
    }

    struct Case {
        uint256 orderId;
        address payer;
        address payee;
        address claimant;
        address token;
        uint128 fee;
        uint8 jurors;
        Phase phase;
        uint8 round;
        uint8 revealedVotes;
        uint8 payeeVotes;
        uint8 payerVotes;
        uint40 commitEnd;
        uint40 revealEnd;
        bytes32 reasonHash;
    }

    struct JurorAccount {
        uint128 staked;
        uint128 locked;
        uint8 active;
        bool seed;
    }

    struct JurorCase {
        bool selected;
        bytes32 voteCommit;
        uint8 vote;
    }

    bytes32 public constant SEEDER_ROLE = keccak256("SEEDER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    uint256 private constant BPS = 10_000;
    uint8 private constant MAX_SEED_PARTICIPANTS = 40;
    uint8 public constant VOTE_PAYER = 1;
    uint8 public constant VOTE_PAYEE = 2;

    IEscrow public immutable escrow;
    IParameterRegistry public immutable registry;
    Credentials public immutable credentials;
    IReputation public immutable reputation;
    IERC20 public immutable stakeToken;
    address public immutable treasury;

    uint256 public lastCaseId;

    mapping(uint256 caseId => Case) private _cases;
    mapping(uint256 caseId => address[]) private _selected;
    mapping(uint256 caseId => mapping(address juror => JurorCase)) private _jurorCases;
    mapping(address juror => JurorAccount) private _accounts;
    mapping(address token => mapping(address juror => uint256)) public rewards;

    mapping(uint256 caseId => mapping(uint8 round => address[])) private _committers;
    mapping(uint256 caseId => mapping(uint8 round => mapping(address juror => bytes32))) private _seedCommits;
    mapping(uint256 caseId => mapping(uint8 round => address[])) private _revealers;
    mapping(uint256 caseId => mapping(uint8 round => bytes32[])) private _secrets;
    mapping(uint256 caseId => mapping(uint8 round => mapping(address juror => bool))) private _seedRevealed;
    mapping(uint256 caseId => mapping(address juror => bool)) private _recused;
    mapping(uint256 caseId => mapping(address party => uint8)) private _recusals;

    constructor(
        address admin,
        IEscrow escrow_,
        IParameterRegistry registry_,
        Credentials credentials_,
        IReputation reputation_,
        IERC20 stakeToken_,
        address treasury_,
        address forwarder
    ) ERC2771Context(forwarder) {
        if (
            admin == address(0) || address(escrow_) == address(0) || address(registry_) == address(0)
                || address(credentials_) == address(0) || address(reputation_) == address(0)
                || address(stakeToken_) == address(0) || treasury_ == address(0)
        ) revert ZeroAddress();
        escrow = escrow_;
        registry = registry_;
        credentials = credentials_;
        reputation = reputation_;
        stakeToken = stakeToken_;
        treasury = treasury_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(SEEDER_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);
    }

    function stake(uint128 amount) external nonReentrant {
        address juror = _msgSender();
        stakeToken.safeTransferFrom(juror, address(this), amount);
        _accounts[juror].staked += amount;
        emit Staked(juror, amount);
    }

    function stakeWithPermit(uint128 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        address juror = _msgSender();
        try IERC20Permit(address(stakeToken)).permit(juror, address(this), amount, deadline, v, r, s) {} catch {}
        stakeToken.safeTransferFrom(juror, address(this), amount);
        _accounts[juror].staked += amount;
        emit Staked(juror, amount);
    }

    function unstake(uint128 amount) external nonReentrant {
        address juror = _msgSender();
        JurorAccount storage acc = _accounts[juror];
        uint128 available = acc.staked - acc.locked;
        if (amount > available) revert InsufficientStake(available, amount);
        acc.staked -= amount;
        stakeToken.safeTransfer(juror, amount);
        emit Unstaked(juror, amount);
    }

    function withdrawReward(address token) external nonReentrant {
        address juror = _msgSender();
        uint256 amount = rewards[token][juror];
        if (amount == 0) revert NothingToWithdraw();
        rewards[token][juror] = 0;
        IERC20(token).safeTransfer(juror, amount);
        emit RewardWithdrawn(token, juror, amount);
    }

    function setSeedJuror(address juror, bool seed) external onlyRole(SEEDER_ROLE) {
        _accounts[juror].seed = seed;
        emit SeedJurorSet(juror, seed);
    }

    function openCase(
        uint256 orderId,
        address payer,
        address payee,
        address claimant,
        uint128 fee,
        address token,
        uint8 jurors,
        bytes32 reasonHash
    ) external returns (uint256 caseId) {
        if (msg.sender != address(escrow)) revert NotEscrow(msg.sender);
        caseId = ++lastCaseId;
        _cases[caseId] = Case({
            orderId: orderId,
            payer: payer,
            payee: payee,
            claimant: claimant,
            token: token,
            fee: fee,
            jurors: jurors,
            phase: Phase.Response,
            round: 0,
            revealedVotes: 0,
            payeeVotes: 0,
            payerVotes: 0,
            commitEnd: uint40(block.timestamp + registry.get(ParameterKeys.DISPUTE_RESPONSE_WINDOW)),
            revealEnd: 0,
            reasonHash: reasonHash
        });
        emit CaseOpened(caseId, orderId, claimant, jurors, fee);
    }

    function respond(uint256 caseId, bytes32 responseHash) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Response);
        address caller = _msgSender();
        address respondent = c.claimant == c.payer ? c.payee : c.payer;
        if (caller != respondent) revert NotRespondent(caller);
        if (block.timestamp > c.commitEnd) revert WindowClosed(c.commitEnd);
        emit Responded(caseId, caller, responseHash);
        _startSeedRound(caseId, c);
    }

    function resolveByDefault(uint256 caseId) external nonReentrant {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Response);
        if (block.timestamp <= c.commitEnd) revert ResponseWindowOpen(c.commitEnd);
        c.phase = Phase.Resolved;
        bool payeeWins = c.claimant == c.payee;
        emit ResolvedByDefault(caseId, c.claimant);
        escrow.resolveDispute(c.orderId, payeeWins ? uint16(BPS) : 0, true);
    }

    function recuse(uint256 caseId, address juror) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Seed);
        address caller = _msgSender();
        if (caller != c.payer && caller != c.payee) revert NotParty(caller);
        uint64 max = registry.get(ParameterKeys.RECUSALS_PER_PARTY);
        if (_recusals[caseId][caller] >= max) revert RecusalLimitReached(max);
        _recusals[caseId][caller] += 1;
        _recused[caseId][juror] = true;
        emit Recused(caseId, caller, juror);
    }

    function commitSeed(uint256 caseId, bytes32 commitment) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Seed);
        if (block.timestamp > c.commitEnd) revert WindowClosed(c.commitEnd);
        address juror = _msgSender();
        if (!_eligible(juror, caseId, c)) revert NotEligible(juror);
        if (_seedCommits[caseId][c.round][juror] != bytes32(0)) revert AlreadyCommitted(juror);
        if (_committers[caseId][c.round].length >= MAX_SEED_PARTICIPANTS) revert TooManyParticipants();
        _seedCommits[caseId][c.round][juror] = commitment;
        _committers[caseId][c.round].push(juror);
        emit SeedCommitted(caseId, juror);
    }

    function revealSeed(uint256 caseId, bytes32 secret) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Seed);
        if (block.timestamp <= c.commitEnd) revert WindowOpen(c.commitEnd);
        if (block.timestamp > c.revealEnd) revert WindowClosed(c.revealEnd);
        address juror = _msgSender();
        bytes32 commitment = _seedCommits[caseId][c.round][juror];
        if (commitment == bytes32(0)) revert NothingCommitted(juror);
        if (_seedRevealed[caseId][c.round][juror]) revert AlreadyRevealed(juror);
        if (commitment != seedHash(caseId, juror, secret)) revert HashMismatch();
        _seedRevealed[caseId][c.round][juror] = true;
        _revealers[caseId][c.round].push(juror);
        _secrets[caseId][c.round].push(secret);
        emit SeedRevealed(caseId, juror);
    }

    function draw(uint256 caseId) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Seed);
        if (block.timestamp <= c.revealEnd) revert WindowOpen(c.revealEnd);

        address[] memory pool = _eligibleRevealers(caseId, c);
        if (pool.length < c.jurors) {
            _nextRound(caseId, c);
            return;
        }
        bytes32 seed = keccak256(abi.encode(_secrets[caseId][c.round], blockhash(block.number - 1)));
        uint256 stakePerCase = registry.get(ParameterKeys.JUROR_STAKE);
        address[] storage chosen = _selected[caseId];
        for (uint256 i = 0; i < c.jurors; i++) {
            uint256 j = i + (uint256(keccak256(abi.encode(seed, i))) % (pool.length - i));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            address juror = pool[i];
            chosen.push(juror);
            _jurorCases[caseId][juror].selected = true;
            _accounts[juror].locked += uint128(stakePerCase);
            _accounts[juror].active += 1;
        }
        c.phase = Phase.Vote;
        c.commitEnd = uint40(block.timestamp + registry.get(ParameterKeys.VOTE_COMMIT_WINDOW));
        c.revealEnd = uint40(c.commitEnd + registry.get(ParameterKeys.VOTE_REVEAL_WINDOW));
        emit JuryDrawn(caseId, chosen, c.commitEnd, c.revealEnd);
    }

    function commitVote(uint256 caseId, bytes32 commitment) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Vote);
        if (block.timestamp > c.commitEnd) revert WindowClosed(c.commitEnd);
        address juror = _msgSender();
        JurorCase storage jc = _jurorCases[caseId][juror];
        if (!jc.selected) revert NotSelected(juror);
        if (jc.voteCommit != bytes32(0)) revert AlreadyCommitted(juror);
        jc.voteCommit = commitment;
        emit VoteCommitted(caseId, juror);
    }

    function revealVote(uint256 caseId, uint8 vote, bytes32 salt) external {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Vote);
        if (block.timestamp <= c.commitEnd) revert WindowOpen(c.commitEnd);
        if (block.timestamp > c.revealEnd) revert WindowClosed(c.revealEnd);
        if (vote != VOTE_PAYER && vote != VOTE_PAYEE) revert InvalidVote(vote);
        address juror = _msgSender();
        JurorCase storage jc = _jurorCases[caseId][juror];
        if (!jc.selected) revert NotSelected(juror);
        if (jc.voteCommit == bytes32(0)) revert NothingCommitted(juror);
        if (jc.vote != 0) revert AlreadyRevealed(juror);
        if (jc.voteCommit != voteHash(caseId, juror, vote, salt)) revert HashMismatch();
        jc.vote = vote;
        c.revealedVotes += 1;
        if (vote == VOTE_PAYEE) c.payeeVotes += 1;
        else c.payerVotes += 1;
        emit VoteRevealed(caseId, juror, vote);
    }

    function finalize(uint256 caseId) external nonReentrant {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.Vote);
        if (block.timestamp <= c.revealEnd && c.revealedVotes < c.jurors) revert VotingNotOver(c.revealEnd);

        if (c.payeeVotes == c.payerVotes) {
            c.phase = Phase.NeedsEmergency;
            _settleJurors(caseId, c, 0);
            emit NeedsEmergencyResolution(caseId, 2);
            return;
        }
        bool payeeWins = c.payeeVotes > c.payerVotes;
        c.phase = Phase.Resolved;
        emit CaseDecided(caseId, payeeWins, c.payeeVotes, c.payerVotes);
        escrow.resolveDispute(c.orderId, payeeWins ? uint16(BPS) : 0, false);
        _settleJurors(caseId, c, payeeWins ? VOTE_PAYEE : VOTE_PAYER);
    }

    function resolveEmergency(uint256 caseId, bool payeeWins, bytes32 reasonHash)
        external
        nonReentrant
        onlyRole(EMERGENCY_ROLE)
    {
        Case storage c = _case(caseId);
        _requirePhase(caseId, c, Phase.NeedsEmergency);
        c.phase = Phase.Resolved;
        emit EmergencyResolved(caseId, payeeWins, reasonHash);
        escrow.resolveDispute(c.orderId, payeeWins ? uint16(BPS) : 0, true);
    }

    function getCase(uint256 caseId) external view returns (Case memory) {
        return _cases[caseId];
    }

    function jurorsOf(uint256 caseId) external view returns (address[] memory) {
        return _selected[caseId];
    }

    function jurorCase(uint256 caseId, address juror) external view returns (JurorCase memory) {
        return _jurorCases[caseId][juror];
    }

    function account(address juror) external view returns (JurorAccount memory) {
        return _accounts[juror];
    }

    function availableStake(address juror) external view returns (uint128) {
        JurorAccount storage a = _accounts[juror];
        return a.staked - a.locked;
    }

    function committersOf(uint256 caseId, uint8 round) external view returns (address[] memory) {
        return _committers[caseId][round];
    }

    function revealersOf(uint256 caseId, uint8 round) external view returns (address[] memory) {
        return _revealers[caseId][round];
    }

    function isRecused(uint256 caseId, address juror) external view returns (bool) {
        return _recused[caseId][juror];
    }

    function isEligible(address juror, uint256 caseId) external view returns (bool) {
        return _eligible(juror, caseId, _cases[caseId]);
    }

    function seedHash(uint256 caseId, address juror, bytes32 secret) public pure returns (bytes32) {
        return keccak256(abi.encode(caseId, juror, secret));
    }

    function voteHash(uint256 caseId, address juror, uint8 vote, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(caseId, juror, vote, salt));
    }

    function _startSeedRound(uint256 caseId, Case storage c) private {
        c.phase = Phase.Seed;
        c.commitEnd = uint40(block.timestamp + registry.get(ParameterKeys.JUROR_INVITE_WINDOW));
        c.revealEnd = uint40(c.commitEnd + registry.get(ParameterKeys.SEED_REVEAL_WINDOW));
        emit SeedRoundStarted(caseId, c.round, c.commitEnd, c.revealEnd);
    }

    function _nextRound(uint256 caseId, Case storage c) private {
        c.round += 1;
        if (c.round > registry.get(ParameterKeys.JUROR_REPLACEMENT_ROUNDS)) {
            c.phase = Phase.NeedsEmergency;
            emit NeedsEmergencyResolution(caseId, 1);
            return;
        }
        _startSeedRound(caseId, c);
    }

    function _eligibleRevealers(uint256 caseId, Case storage c) private view returns (address[] memory pool) {
        address[] storage revealers = _revealers[caseId][c.round];
        address[] memory temp = new address[](revealers.length);
        uint256 count;
        for (uint256 i = 0; i < revealers.length; i++) {
            if (_eligible(revealers[i], caseId, c)) temp[count++] = revealers[i];
        }
        pool = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            pool[i] = temp[i];
        }
    }

    function _eligible(address juror, uint256 caseId, Case storage c) private view returns (bool) {
        if (juror == c.payer || juror == c.payee || _recused[caseId][juror]) return false;
        JurorAccount storage a = _accounts[juror];
        if (a.staked - a.locked < registry.get(ParameterKeys.JUROR_STAKE)) return false;
        if (a.active >= registry.get(ParameterKeys.JUROR_MAX_ACTIVE_CASES)) return false;
        if (!credentials.has(juror) || credentials.levelOf(juror) < registry.get(ParameterKeys.JUROR_MIN_LEVEL)) {
            return false;
        }
        return a.seed || reputation.closedWithoutDispute(juror) >= registry.get(ParameterKeys.JUROR_MIN_CLOSED);
    }

    struct Settlement {
        uint8 majorityVote;
        uint256 stakePerCase;
        uint256 minorityCut;
        uint256 reward;
        uint256 dust;
        uint256 slashedTotal;
    }

    function _settleJurors(uint256 caseId, Case storage c, uint8 majorityVote) private {
        uint256 stakePerCase = registry.get(ParameterKeys.JUROR_STAKE);
        uint256 majority = majorityVote == VOTE_PAYEE ? c.payeeVotes : majorityVote == VOTE_PAYER ? c.payerVotes : 0;
        Settlement memory info = Settlement({
            majorityVote: majorityVote,
            stakePerCase: stakePerCase,
            minorityCut: (stakePerCase * registry.get(ParameterKeys.SLASH_MINORITY_BPS)) / BPS,
            reward: majority == 0 ? 0 : c.fee / majority,
            dust: majority == 0 ? 0 : c.fee % majority,
            slashedTotal: 0
        });

        address[] storage jurors = _selected[caseId];
        for (uint256 i = 0; i < jurors.length; i++) {
            _settleOne(caseId, c.token, jurors[i], info);
        }
        if (info.slashedTotal > 0) stakeToken.safeTransfer(treasury, info.slashedTotal);
    }

    function _settleOne(uint256 caseId, address token, address juror, Settlement memory info) private {
        uint8 vote = _jurorCases[caseId][juror].vote;
        JurorAccount storage a = _accounts[juror];
        a.locked -= uint128(info.stakePerCase);
        a.active -= 1;

        bool withMajority = info.majorityVote != 0 && vote == info.majorityVote;
        uint256 slash;
        if (vote == 0) slash = info.stakePerCase;
        else if (info.majorityVote != 0 && !withMajority) slash = info.minorityCut;
        if (slash > a.staked) slash = a.staked;
        if (slash > 0) {
            a.staked -= uint128(slash);
            info.slashedTotal += slash;
            emit JurorSlashed(caseId, juror, slash);
        }
        if (withMajority) {
            uint256 pay = info.reward + info.dust;
            info.dust = 0;
            rewards[token][juror] += pay;
            emit JurorPaid(caseId, juror, pay);
        }
        if (info.majorityVote != 0 || vote == 0) _recordJuror(juror, withMajority);
    }

    function _recordJuror(address juror, bool withMajority) private {
        try reputation.recordJuror(juror, withMajority) {} catch {}
    }

    function _case(uint256 caseId) private view returns (Case storage c) {
        c = _cases[caseId];
        if (c.phase == Phase.None) revert UnknownCase(caseId);
    }

    function _requirePhase(uint256 caseId, Case storage c, Phase expected) private view {
        if (c.phase != expected) revert WrongPhase(caseId, uint8(c.phase));
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
