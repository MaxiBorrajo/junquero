// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {TokenConfig} from "../src/libraries/OrderTypes.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {MockPermit2} from "./mocks/MockPermit2.sol";
import {MockToken} from "./mocks/MockToken.sol";

contract GovernanceTest is Test {
    uint256 internal constant UNIT = 1e6;

    Deploy internal script;
    Deploy.Deployment internal d;
    MockToken internal token;
    address internal admin;

    address internal proposer;
    uint256 internal proposerKey;
    address internal voterA = makeAddr("voterA");
    address internal voterB = makeAddr("voterB");
    address internal voterC = makeAddr("voterC");
    address internal stranger = makeAddr("stranger");
    uint256 internal earned;

    function setUp() public {
        script = new Deploy();
        admin = address(script);
        token = new MockToken("USDC", 6);
        d = script.deploy(admin, ISignatureTransfer(address(new MockPermit2())), IERC20(address(token)), false);

        vm.startPrank(admin);
        d.reputation.grantRole(d.reputation.RECORDER_ROLE(), address(this));
        vm.stopPrank();

        (proposer, proposerKey) = makeAddrAndKey("proposer");
        _prepare(proposer, 10);
        _prepare(voterA, 8);
        _prepare(voterB, 6);
        _prepare(voterC, 4);
        vm.warp(block.timestamp + 1);
    }

    function _prepare(address who, uint256 points) internal {
        vm.prank(admin);
        d.credentials.issue(who, 0);
        for (uint256 i = 0; i < points; i++) {
            d.reputation.recordSettled(address(uint160(0x5000 + earned++)), who, 5, false, false, true);
        }
        token.mint(who, 5 * UNIT);
        vm.startPrank(who);
        token.approve(address(d.votingWeight), 5 * UNIT);
        d.votingWeight.deposit(5 * UNIT);
        vm.stopPrank();
    }

    function _handover() internal {
        script.handOverToGovernance(d, admin);
    }

    function _feeProposal(uint64 value)
        internal
        view
        returns (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description)
    {
        targets = new address[](1);
        values = new uint256[](1);
        calldatas = new bytes[](1);
        targets[0] = address(d.registry);
        calldatas[0] = abi.encodeCall(ParameterRegistry.set, (ParameterKeys.FEE_BPS, value));
        description = string.concat("Set the protocol fee to ", vm.toString(value));
    }

    function _propose(uint64 value) internal returns (uint256 proposalId) {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _feeProposal(value);
        vm.prank(proposer);
        proposalId = d.governor.propose(targets, values, calldatas, description);
    }

    function _hash(uint64 value) internal view returns (bytes32) {
        (,,, string memory description) = _feeProposal(value);
        return keccak256(bytes(description));
    }

    function _queue(uint64 value) internal {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas,) = _feeProposal(value);
        d.governor.queue(targets, values, calldatas, _hash(value));
    }

    function _execute(uint64 value) internal {
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas,) = _feeProposal(value);
        d.governor.execute(targets, values, calldatas, _hash(value));
    }

    function _toVoting() internal {
        vm.warp(block.timestamp + d.governor.votingDelay() + 1);
    }

    function _toEnd(uint256 proposalId) internal {
        vm.warp(d.governor.proposalDeadline(proposalId) + 1);
    }

    function _passVote(uint64 value) internal returns (uint256 proposalId) {
        _handover();
        proposalId = _propose(value);
        _toVoting();
        vm.prank(proposer);
        d.governor.castVote(proposalId, 1);
        vm.prank(voterA);
        d.governor.castVote(proposalId, 1);
        vm.prank(voterC);
        d.governor.castVote(proposalId, 0);
        _toEnd(proposalId);
    }

    function test_aParameterChangeGoesThroughTheWholeGovernanceCycle() public {
        uint256 proposalId = _passVote(100);
        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Succeeded));

        _queue(100);
        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Queued));
        assertEq(d.registry.get(ParameterKeys.FEE_BPS), 0);

        vm.expectRevert();
        _execute(100);

        vm.warp(block.timestamp + 2 days);
        _execute(100);

        assertEq(d.registry.get(ParameterKeys.FEE_BPS), 100);
        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Executed));
    }

    function test_theVotingWindowOpensAfterTheDelay() public {
        _handover();
        uint256 proposalId = _propose(100);

        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Pending));
        vm.prank(voterA);
        vm.expectRevert();
        d.governor.castVote(proposalId, 1);

        _toVoting();
        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Active));
    }

    function test_withoutQuorumTheProposalFails() public {
        _handover();
        uint256 proposalId = _propose(100);
        _toVoting();
        _toEnd(proposalId);

        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Defeated));
    }

    function test_aMajorityAgainstDefeatsTheProposal() public {
        _handover();
        uint256 proposalId = _propose(100);
        _toVoting();
        vm.prank(proposer);
        d.governor.castVote(proposalId, 0);
        vm.prank(voterA);
        d.governor.castVote(proposalId, 0);
        vm.prank(voterB);
        d.governor.castVote(proposalId, 1);
        _toEnd(proposalId);

        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Defeated));
    }

    function test_theVoteWeightIsTheActivityOfEachVoter() public {
        _handover();
        uint256 proposalId = _propose(100);
        _toVoting();
        vm.prank(proposer);
        d.governor.castVote(proposalId, 1);
        vm.prank(voterC);
        d.governor.castVote(proposalId, 0);

        (uint256 against, uint256 forVotes,) = d.governor.proposalVotes(proposalId);
        assertEq(forVotes, 10);
        assertEq(against, 4);
    }

    function test_aProposerWithoutWeightCannotPropose() public {
        _handover();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) =
            _feeProposal(100);
        vm.prank(stranger);
        vm.expectRevert();
        d.governor.propose(targets, values, calldatas, description);
    }

    function test_weightEarnedAfterTheSnapshotDoesNotCount() public {
        _handover();
        uint256 proposalId = _propose(100);
        _toVoting();
        address late = makeAddr("late");
        _prepare(late, 9);

        vm.prank(late);
        d.governor.castVote(proposalId, 1);
        (, uint256 forVotes,) = d.governor.proposalVotes(proposalId);
        assertEq(forVotes, 0);
    }

    function test_theQuorumIsATenthOfTheTotalWeight() public {
        _handover();
        uint256 proposalId = _propose(100);
        uint256 snapshot = d.governor.proposalSnapshot(proposalId);
        _toVoting();

        assertEq(d.governor.quorum(snapshot), (d.votingWeight.getPastTotalSupply(snapshot) * 10) / 100);
    }

    function test_theTimelockDelayCannotBeSkipped() public {
        uint256 proposalId = _passVote(100);
        _queue(100);
        vm.warp(block.timestamp + 2 days - 1);

        vm.expectRevert();
        _execute(100);
        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Queued));
    }

    function test_anOutOfRangeValueFailsAtExecution() public {
        _passVote(500);
        _queue(500);
        vm.warp(block.timestamp + 2 days);

        vm.expectRevert();
        _execute(500);
        assertEq(d.registry.get(ParameterKeys.FEE_BPS), 0);
    }

    function test_theProposerCanCancelBeforeVoting() public {
        _handover();
        (address[] memory targets, uint256[] memory values, bytes[] memory calldatas,) = _feeProposal(100);
        uint256 proposalId = _propose(100);

        vm.prank(proposer);
        d.governor.cancel(targets, values, calldatas, _hash(100));

        assertEq(uint8(d.governor.state(proposalId)), uint8(IGovernor.ProposalState.Canceled));
    }

    function test_votingThroughTheForwarderAttributesTheVoter() public {
        _handover();
        uint256 proposalId = _propose(100);
        _toVoting();
        bytes memory data = abi.encodeCall(IGovernor.castVote, (proposalId, 1));
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                proposer,
                address(d.governor),
                uint256(0),
                uint256(1_000_000),
                d.forwarder.nonces(proposer),
                deadline,
                keccak256(data)
            )
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Forwarder"),
                keccak256("1"),
                block.chainid,
                address(d.forwarder)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(proposerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        d.forwarder
            .execute(
                ERC2771Forwarder.ForwardRequestData({
                    from: proposer,
                    to: address(d.governor),
                    value: 0,
                    gas: 1_000_000,
                    deadline: deadline,
                    data: data,
                    signature: abi.encodePacked(r, s, v)
                })
            );

        (, uint256 forVotes,) = d.governor.proposalVotes(proposalId);
        assertEq(forVotes, 10);
        assertTrue(d.governor.hasVoted(proposalId, proposer));
    }

    function test_governanceCanChangeATokenConfiguration() public {
        _handover();
        TokenConfig memory config = d.escrow.tokenConfig(address(token));
        config.smallMax = uint128(30 * UNIT);
        config.mediumMax = uint128(400 * UNIT);
        config.allowed = true;
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(d.escrow);
        calldatas[0] = abi.encodeCall(d.escrow.configureToken, (address(token), config));
        string memory description = "Allow a new token";

        vm.prank(proposer);
        uint256 proposalId = d.governor.propose(targets, values, calldatas, description);
        _toVoting();
        vm.prank(proposer);
        d.governor.castVote(proposalId, 1);
        vm.prank(voterA);
        d.governor.castVote(proposalId, 1);
        _toEnd(proposalId);
        d.governor.queue(targets, values, calldatas, keccak256(bytes(description)));
        vm.warp(block.timestamp + 2 days);
        d.governor.execute(targets, values, calldatas, keccak256(bytes(description)));

        assertEq(d.escrow.tokenConfig(address(token)).smallMax, 30 * UNIT);
        assertTrue(d.escrow.tokenConfig(address(token)).allowed);
    }

    function test_governanceCanGrantARole() public {
        _handover();
        address newSeeder = makeAddr("newSeeder");
        bytes32 seederRole = d.arbitration.SEEDER_ROLE();
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(d.arbitration);
        calldatas[0] = abi.encodeCall(d.arbitration.grantRole, (seederRole, newSeeder));
        string memory description = "Add a seeder";

        vm.prank(proposer);
        uint256 proposalId = d.governor.propose(targets, values, calldatas, description);
        _toVoting();
        vm.prank(proposer);
        d.governor.castVote(proposalId, 1);
        vm.prank(voterA);
        d.governor.castVote(proposalId, 1);
        _toEnd(proposalId);
        d.governor.queue(targets, values, calldatas, keccak256(bytes(description)));
        vm.warp(block.timestamp + 2 days);
        d.governor.execute(targets, values, calldatas, keccak256(bytes(description)));

        assertTrue(d.arbitration.hasRole(seederRole, newSeeder));
    }

    function test_theAdminKeepsControlUntilTheHandover() public {
        bytes32 setterRole = d.registry.SETTER_ROLE();
        vm.prank(admin);
        d.registry.grantRole(setterRole, admin);
        vm.prank(admin);
        d.registry.set(ParameterKeys.FEE_BPS, 50);

        assertEq(d.registry.get(ParameterKeys.FEE_BPS), 50);
    }

    function test_afterTheHandoverTheAdminCannotChangeParameters() public {
        _handover();
        bytes32 setterRole = d.registry.SETTER_ROLE();

        vm.startPrank(admin);
        vm.expectRevert();
        d.registry.set(ParameterKeys.FEE_BPS, 50);
        vm.expectRevert();
        d.registry.grantRole(setterRole, admin);
        vm.expectRevert();
        d.registry.defineParameter(keccak256("NEW"), 0, 10, 1);
        vm.stopPrank();
    }

    function test_afterTheHandoverTheAdminCannotTouchTokensRolesOrTheTreasury() public {
        _handover();
        TokenConfig memory config = d.escrow.tokenConfig(address(token));
        bytes32 spenderRole = d.treasury.SPENDER_ROLE();
        bytes32 recorderRole = d.reputation.RECORDER_ROLE();

        vm.startPrank(admin);
        vm.expectRevert();
        d.escrow.configureToken(address(token), config);
        vm.expectRevert();
        d.treasury.grantRole(spenderRole, admin);
        vm.expectRevert();
        d.reputation.grantRole(recorderRole, admin);
        vm.expectRevert();
        d.escrow.setReputation(d.reputation);
        vm.expectRevert();
        d.escrow.setArbitration(d.arbitration);
        vm.stopPrank();
    }

    function test_afterTheHandoverTheAdminKeepsTheOperationalRoles() public {
        _handover();

        assertTrue(d.escrow.hasRole(d.escrow.MODERATOR_ROLE(), admin));
        assertTrue(d.credentials.hasRole(d.credentials.ISSUER_ROLE(), admin));
        assertTrue(d.arbitration.hasRole(d.arbitration.SEEDER_ROLE(), admin));
        assertTrue(d.arbitration.hasRole(d.arbitration.EMERGENCY_ROLE(), admin));
        vm.prank(admin);
        d.credentials.issue(stranger, 0);
        assertTrue(d.credentials.has(stranger));
    }

    function test_theTimelockHoldsTheControlRoles() public {
        _handover();
        address timelock = address(d.timelock);

        assertTrue(d.registry.hasRole(d.registry.SETTER_ROLE(), timelock));
        assertTrue(d.registry.hasRole(d.registry.DEFINER_ROLE(), timelock));
        assertTrue(d.registry.hasRole(d.registry.DEFAULT_ADMIN_ROLE(), timelock));
        assertTrue(d.escrow.hasRole(d.escrow.TOKEN_ADMIN_ROLE(), timelock));
        assertTrue(d.escrow.hasRole(d.escrow.DEFAULT_ADMIN_ROLE(), timelock));
        assertTrue(d.treasury.hasRole(d.treasury.DEFAULT_ADMIN_ROLE(), timelock));
        assertTrue(d.reputation.hasRole(d.reputation.DEFAULT_ADMIN_ROLE(), timelock));
        assertTrue(d.credentials.hasRole(d.credentials.DEFAULT_ADMIN_ROLE(), timelock));
        assertTrue(d.arbitration.hasRole(d.arbitration.DEFAULT_ADMIN_ROLE(), timelock));
    }

    function test_onlyTheTimelockAdministersItself() public view {
        assertFalse(d.timelock.hasRole(d.timelock.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(d.timelock.hasRole(d.timelock.DEFAULT_ADMIN_ROLE(), address(d.timelock)));
        assertTrue(d.timelock.hasRole(d.timelock.PROPOSER_ROLE(), address(d.governor)));
        assertTrue(d.timelock.hasRole(d.timelock.CANCELLER_ROLE(), address(d.governor)));
        assertTrue(d.timelock.hasRole(d.timelock.EXECUTOR_ROLE(), address(0)));
    }

    function test_onlyTheGovernorCanScheduleOnTheTimelock() public {
        bytes32 salt = keccak256("x");
        vm.prank(admin);
        vm.expectRevert();
        d.timelock.schedule(address(d.registry), 0, "", bytes32(0), salt, 2 days);

        vm.prank(stranger);
        vm.expectRevert();
        d.timelock.schedule(address(d.registry), 0, "", bytes32(0), salt, 2 days);
    }

    function test_governorSettingsOnlyChangeThroughGovernance() public {
        vm.prank(admin);
        vm.expectRevert();
        d.governor.setVotingPeriod(1 days);

        vm.prank(proposer);
        vm.expectRevert();
        d.governor.setProposalThreshold(0);
    }

    function test_theProductionTimingsAreConservative() public view {
        assertEq(d.governor.votingDelay(), 1 days);
        assertEq(d.governor.votingPeriod(), 5 days);
        assertEq(d.timelock.getMinDelay(), 2 days);
        assertEq(d.governor.proposalThreshold(), 1);
        assertEq(d.governor.quorumNumerator(), 10);
    }

    function test_demoModeUsesShortTimings() public {
        Deploy.Deployment memory demo = script.deploy(
            address(script), ISignatureTransfer(address(new MockPermit2())), IERC20(address(token)), true
        );

        assertEq(demo.governor.votingDelay(), 1 minutes);
        assertEq(demo.governor.votingPeriod(), 10 minutes);
        assertEq(demo.timelock.getMinDelay(), 5 minutes);
    }
}
