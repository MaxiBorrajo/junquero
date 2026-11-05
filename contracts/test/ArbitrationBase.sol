// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {Credentials} from "../src/Credentials.sol";
import {Reputation} from "../src/Reputation.sol";
import {IArbitration} from "../src/interfaces/IArbitration.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {IReputation} from "../src/interfaces/IReputation.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {DepositAuth, DepositMethod, OrderStatus} from "../src/libraries/OrderTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract ArbitrationBase is EscrowBase {
    uint256 internal constant STAKE = 10 * USDC;
    uint256 internal constant JUROR_DEPOSIT = 20 * USDC;
    uint256 internal constant FEE_PER_JUROR = USDC;
    uint8 internal constant PAYER = 1;
    uint8 internal constant PAYEE = 2;

    Arbitration internal court;
    Credentials internal credentials;
    Reputation internal reputation;

    address[] internal jurors;
    uint256 internal jurorKey;
    bytes32 internal constant REASON = keccak256("reason");
    bytes32 internal constant RESPONSE = keccak256("response");

    function setUp() public virtual override {
        super.setUp();
        _defineArbitrationParameters();

        credentials = new Credentials(admin);
        reputation = new Reputation(admin, IParameterRegistry(address(registry)));
        court = new Arbitration(
            admin,
            IEscrow(address(escrow)),
            IParameterRegistry(address(registry)),
            credentials,
            IReputation(address(reputation)),
            IERC20(address(usdc)),
            address(treasury),
            address(forwarder)
        );

        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.startPrank(admin);
        reputation.grantRole(recorderRole, address(escrow));
        reputation.grantRole(recorderRole, address(court));
        escrow.setReputation(reputation);
        escrow.setArbitration(IArbitration(address(court)));
        vm.stopPrank();

        for (uint256 i = 0; i < 7; i++) {
            address juror;
            if (i == 0) (juror, jurorKey) = makeAddrAndKey("juror0");
            else juror = makeAddr(string.concat("juror", vm.toString(i)));
            jurors.push(juror);
            _registerJuror(juror, JUROR_DEPOSIT);
        }
    }

    function _defineArbitrationParameters() internal {
        vm.startPrank(admin);
        registry.defineParameter(ParameterKeys.REPUTATION_PAIR_CAP, 1, 10, 2);
        registry.defineParameter(ParameterKeys.JUROR_STAKE, 0, uint64(1_000_000 * USDC), uint64(STAKE));
        registry.defineParameter(ParameterKeys.JUROR_MIN_CLOSED, 0, 100, 0);
        registry.defineParameter(ParameterKeys.JUROR_MIN_LEVEL, 0, 2, 0);
        registry.defineParameter(ParameterKeys.SEED_REVEAL_WINDOW, 1 hours, 3 days, 6 hours);
        registry.defineParameter(ParameterKeys.VOTE_COMMIT_WINDOW, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.VOTE_REVEAL_WINDOW, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.RECUSALS_PER_PARTY, 0, 5, 1);
        registry.defineParameter(ParameterKeys.SLASH_MINORITY_BPS, 0, 10_000, 2500);
        registry.defineParameter(ParameterKeys.JUROR_INVITE_WINDOW, 1 hours, 7 days, 24 hours);
        registry.defineParameter(ParameterKeys.JUROR_REPLACEMENT_ROUNDS, 0, 5, 3);
        registry.defineParameter(ParameterKeys.JUROR_MAX_ACTIVE_CASES, 1, 10, 2);
        registry.defineParameter(ParameterKeys.DISPUTE_RESPONSE_WINDOW, 1 hours, 14 days, 72 hours);
        vm.stopPrank();
    }

    function _registerJuror(address juror, uint256 deposit) internal {
        vm.prank(admin);
        credentials.issue(juror, 0);
        vm.prank(admin);
        court.setSeedJuror(juror, true);
        usdc.mint(juror, deposit);
        vm.startPrank(juror);
        usdc.approve(address(court), type(uint256).max);
        court.stake(uint128(deposit));
        vm.stopPrank();
    }

    function _deliveredOrder(uint256 price) internal returns (uint256 orderId) {
        orderId = _createUsdc(price);
        _agree(orderId, price);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function _feeAuth(address who, uint256 amount) internal returns (DepositAuth memory) {
        usdc.mint(who, amount);
        uint256 key = who == payer ? payerKey : payeeKey;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                who,
                address(escrow),
                amount,
                usdc.nonces(who),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return
            DepositAuth({
                method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
            });
    }

    function _openCase(address claimant, uint256 price, uint256 jurorCount)
        internal
        returns (uint256 orderId, uint256 caseId)
    {
        orderId = _deliveredOrder(price);
        DepositAuth memory auth = _feeAuth(claimant, jurorCount * FEE_PER_JUROR);
        vm.prank(claimant);
        escrow.openDispute(orderId, REASON, auth);
        caseId = court.lastCaseId();
    }

    function _openMedium() internal returns (uint256 orderId, uint256 caseId) {
        return _openCase(payer, 100 * USDC, 3);
    }

    function _respond(uint256 caseId) internal {
        Arbitration.Case memory c = court.getCase(caseId);
        address respondent = c.claimant == c.payer ? c.payee : c.payer;
        vm.prank(respondent);
        court.respond(caseId, RESPONSE);
    }

    function _secretOf(address juror, uint8 round) internal pure returns (bytes32) {
        return keccak256(abi.encode("secret", juror, round));
    }

    function _commitSeeds(uint256 caseId, address[] memory who) internal {
        uint8 round = court.getCase(caseId).round;
        for (uint256 i = 0; i < who.length; i++) {
            bytes32 commitment = court.seedHash(caseId, who[i], _secretOf(who[i], round));
            vm.prank(who[i]);
            court.commitSeed(caseId, commitment);
        }
    }

    function _revealSeeds(uint256 caseId, address[] memory who) internal {
        uint8 round = court.getCase(caseId).round;
        for (uint256 i = 0; i < who.length; i++) {
            vm.prank(who[i]);
            court.revealSeed(caseId, _secretOf(who[i], round));
        }
    }

    function _slice(uint256 count) internal view returns (address[] memory out) {
        out = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            out[i] = jurors[i];
        }
    }

    function _runSeedRound(uint256 caseId, address[] memory who) internal {
        _commitSeeds(caseId, who);
        vm.warp(court.getCase(caseId).commitEnd + 1);
        _revealSeeds(caseId, who);
        vm.warp(court.getCase(caseId).revealEnd + 1);
        court.draw(caseId);
    }

    function _drawJury(uint256 caseId, uint256 candidates) internal returns (address[] memory) {
        _respond(caseId);
        _runSeedRound(caseId, _slice(candidates));
        return court.jurorsOf(caseId);
    }

    function _castVotes(uint256 caseId, uint8[] memory votes, bool[] memory reveal) internal {
        address[] memory selected = court.jurorsOf(caseId);
        for (uint256 i = 0; i < selected.length; i++) {
            if (votes[i] == 0) continue;
            bytes32 commitment = court.voteHash(caseId, selected[i], votes[i], _salt(caseId, i));
            vm.prank(selected[i]);
            court.commitVote(caseId, commitment);
        }
        vm.warp(court.getCase(caseId).commitEnd + 1);
        for (uint256 i = 0; i < selected.length; i++) {
            if (votes[i] == 0 || !reveal[i]) continue;
            vm.prank(selected[i]);
            court.revealVote(caseId, votes[i], _salt(caseId, i));
        }
    }

    function _salt(uint256 caseId, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", caseId, index));
    }

    function _allReveal(uint256 count) internal pure returns (bool[] memory flags) {
        flags = new bool[](count);
        for (uint256 i = 0; i < count; i++) {
            flags[i] = true;
        }
    }

    function _votes3(uint8 a, uint8 b, uint8 c) internal pure returns (uint8[] memory votes) {
        votes = new uint8[](3);
        votes[0] = a;
        votes[1] = b;
        votes[2] = c;
    }

    function _decide(uint256 caseId, uint8[] memory votes) internal {
        _castVotes(caseId, votes, _allReveal(votes.length));
        court.finalize(caseId);
    }

    function _totalMoney(address[] memory extra) internal view returns (uint256 total) {
        total = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(court)) + usdc.balanceOf(address(escrow));
        for (uint256 i = 0; i < extra.length; i++) {
            total += usdc.balanceOf(extra[i]);
        }
    }

    function _jurorMoney() internal view returns (uint256 total) {
        for (uint256 i = 0; i < jurors.length; i++) {
            total += usdc.balanceOf(jurors[i]);
        }
    }
}
