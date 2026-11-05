// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VotingWeight} from "../src/VotingWeight.sol";
import {Credentials} from "../src/Credentials.sol";
import {Reputation} from "../src/Reputation.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {IReputation} from "../src/interfaces/IReputation.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {MockPermitToken} from "./mocks/MockPermitToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract VotingWeightTest is Test {
    uint256 internal constant UNIT = 1e6;

    ParameterRegistry internal registry;
    Credentials internal credentials;
    Reputation internal reputation;
    VotingWeight internal weight;
    MockPermitToken internal token;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal earned;

    function setUp() public {
        registry = new ParameterRegistry(admin);
        bytes32 setterRole = registry.SETTER_ROLE();
        vm.startPrank(admin);
        registry.grantRole(setterRole, admin);
        registry.defineParameter(ParameterKeys.VOTE_DEPOSIT, 0, uint64(1_000_000 * UNIT), uint64(5 * UNIT));
        registry.defineParameter(ParameterKeys.VOTE_WEIGHT_CAP, 1, 1000, 20);
        registry.defineParameter(ParameterKeys.REPUTATION_PAIR_CAP, 1, 10, 2);
        vm.stopPrank();

        credentials = new Credentials(admin);
        reputation = new Reputation(admin, IParameterRegistry(address(registry)));
        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.prank(admin);
        reputation.grantRole(recorderRole, address(this));
        token = new MockPermitToken();
        weight = new VotingWeight(
            IReputation(address(reputation)), credentials, IParameterRegistry(address(registry)), IERC20(address(token))
        );
    }

    function _credential(address who) internal {
        vm.prank(admin);
        credentials.issue(who, 0);
    }

    function _earnAsProvider(address who, uint256 closed) internal {
        for (uint256 i = 0; i < closed; i++) {
            reputation.recordSettled(address(uint160(0x1000 + earned++)), who, 5, false, false, true);
        }
    }

    function _earnAsRequester(address who, uint256 closed) internal {
        for (uint256 i = 0; i < closed; i++) {
            reputation.recordSettled(who, address(uint160(0x1000 + earned++)), 5, false, false, true);
        }
    }

    function _earnAsJuror(address who, uint256 closed) internal {
        for (uint256 i = 0; i < closed; i++) {
            reputation.recordJuror(who, true);
        }
    }

    function _deposit(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(weight), amount);
        weight.deposit(amount);
        vm.stopPrank();
    }

    function _eligible(address who, uint256 points) internal {
        _credential(who);
        _earnAsProvider(who, points);
        _deposit(who, 5 * UNIT);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(VotingWeight.ZeroAddress.selector);
        new VotingWeight(
            IReputation(address(0)), credentials, IParameterRegistry(address(registry)), IERC20(address(token))
        );
        vm.expectRevert(VotingWeight.ZeroAddress.selector);
        new VotingWeight(
            IReputation(address(reputation)), credentials, IParameterRegistry(address(0)), IERC20(address(token))
        );
    }

    function test_theClockRunsOnTimestamps() public view {
        assertEq(weight.clock(), block.timestamp);
        assertEq(weight.CLOCK_MODE(), "mode=timestamp");
    }

    function test_withoutACredentialThereIsNoWeight() public {
        _earnAsProvider(alice, 5);
        _deposit(alice, 5 * UNIT);

        assertEq(weight.weightOf(alice), 0);
        assertEq(weight.getVotes(alice), 0);
    }

    function test_withoutTheDepositThereIsNoWeight() public {
        _credential(alice);
        _earnAsProvider(alice, 5);
        weight.sync(alice);

        assertEq(weight.weightOf(alice), 0);
    }

    function test_withoutActivityThereIsNoWeight() public {
        _credential(alice);
        _deposit(alice, 5 * UNIT);

        assertEq(weight.weightOf(alice), 0);
    }

    function test_theWeightIsTheNumberOfCleanCloses() public {
        _eligible(alice, 7);

        assertEq(weight.weightOf(alice), 7);
        assertEq(weight.unitsOf(alice), 7);
        assertEq(weight.getVotes(alice), 7);
    }

    function test_everyRoleAddsToTheWeight() public {
        _credential(alice);
        _earnAsProvider(alice, 3);
        _earnAsRequester(alice, 4);
        _earnAsJuror(alice, 2);
        _deposit(alice, 5 * UNIT);

        assertEq(weight.weightOf(alice), 9);
    }

    function test_disputedClosesDoNotCount() public {
        _credential(alice);
        reputation.recordSettled(address(0x9001), alice, 5, false, true, true);
        reputation.recordSettled(address(0x9002), alice, 5, false, false, true);
        _deposit(alice, 5 * UNIT);

        assertEq(weight.weightOf(alice), 1);
    }

    function test_theWeightIsCappedPerAccount() public {
        _eligible(alice, 30);

        assertEq(weight.weightOf(alice), 20);
        assertEq(weight.getVotes(alice), 20);
    }

    function test_theCapFollowsTheParameter() public {
        _eligible(alice, 30);
        vm.prank(admin);
        registry.set(ParameterKeys.VOTE_WEIGHT_CAP, 12);
        weight.sync(alice);

        assertEq(weight.getVotes(alice), 12);
    }

    function test_depositsMoveTheTokensAndEmitEvents() public {
        token.mint(alice, 8 * UNIT);
        vm.startPrank(alice);
        token.approve(address(weight), 8 * UNIT);

        vm.expectEmit(true, false, false, true);
        emit VotingWeight.Deposited(alice, 8 * UNIT);
        weight.deposit(8 * UNIT);
        vm.stopPrank();

        assertEq(weight.deposits(alice), 8 * UNIT);
        assertEq(token.balanceOf(address(weight)), 8 * UNIT);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_depositWithPermitNeedsNoPriorApproval() public {
        (address who, uint256 key) = makeAddrAndKey("permitVoter");
        token.mint(who, 5 * UNIT);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                who,
                address(weight),
                5 * UNIT,
                token.nonces(who),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));

        vm.prank(who);
        weight.depositWithPermit(5 * UNIT, deadline, v, r, s);

        assertEq(weight.deposits(who), 5 * UNIT);
    }

    function test_zeroAmountsAreRejected() public {
        vm.startPrank(alice);
        vm.expectRevert(VotingWeight.ZeroAmount.selector);
        weight.deposit(0);
        vm.expectRevert(VotingWeight.ZeroAmount.selector);
        weight.withdraw(0);
        vm.stopPrank();
    }

    function test_aSmallDepositIsNotEnough() public {
        _credential(alice);
        _earnAsProvider(alice, 5);
        _deposit(alice, 5 * UNIT - 1);

        assertEq(weight.weightOf(alice), 0);
        _deposit(alice, 1);
        assertEq(weight.weightOf(alice), 5);
    }

    function test_withdrawingBelowTheRequirementDropsTheWeightToZero() public {
        _eligible(alice, 5);
        vm.prank(alice);
        weight.withdraw(1);

        assertEq(weight.getVotes(alice), 0);
        assertEq(weight.unitsOf(alice), 0);
        assertEq(token.balanceOf(alice), 1);
    }

    function test_aSurplusCanBeWithdrawnWithoutLosingTheWeight() public {
        _credential(alice);
        _earnAsProvider(alice, 5);
        _deposit(alice, 9 * UNIT);
        vm.prank(alice);
        weight.withdraw(4 * UNIT);

        assertEq(weight.getVotes(alice), 5);
        assertEq(token.balanceOf(alice), 4 * UNIT);
    }

    function test_withdrawingMoreThanTheDepositReverts() public {
        _eligible(alice, 5);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VotingWeight.InsufficientDeposit.selector, 5 * UNIT, 5 * UNIT + 1));
        weight.withdraw(5 * UNIT + 1);
    }

    function test_anyoneCanSyncAnAccountAfterItsReputationGrows() public {
        _eligible(alice, 3);
        _earnAsProvider(alice, 4);
        assertEq(weight.getVotes(alice), 3);

        vm.prank(bob);
        weight.sync(alice);

        assertEq(weight.getVotes(alice), 7);
    }

    function test_aRevokedCredentialRemovesTheWeightOnSync() public {
        _eligible(alice, 5);
        vm.prank(admin);
        credentials.revoke(alice);
        weight.sync(alice);

        assertEq(weight.getVotes(alice), 0);
    }

    function test_votingPowerIsDelegatedToTheAccountItself() public {
        _eligible(alice, 5);

        assertEq(weight.delegates(alice), alice);
    }

    function test_weightCannotBeDelegatedToSomeoneElse() public {
        _eligible(alice, 5);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(VotingWeight.DelegationNotAllowed.selector, bob));
        weight.delegate(bob);
    }

    function test_selfDelegationIsAllowed() public {
        _eligible(alice, 5);
        vm.prank(alice);
        weight.delegate(alice);

        assertEq(weight.getVotes(alice), 5);
    }

    function test_totalSupplyTracksEveryAccount() public {
        _eligible(alice, 5);
        _eligible(bob, 8);
        vm.warp(block.timestamp + 1);

        assertEq(weight.getPastTotalSupply(block.timestamp - 1), 13);
    }

    function test_pastVotesKeepTheSnapshot() public {
        _eligible(alice, 5);
        uint256 snapshot = block.timestamp;
        vm.warp(block.timestamp + 10);
        _earnAsProvider(alice, 6);
        weight.sync(alice);
        vm.warp(block.timestamp + 10);

        assertEq(weight.getPastVotes(alice, snapshot), 5);
        assertEq(weight.getVotes(alice), 11);
    }

    function test_syncEmitsTheWeight() public {
        _credential(alice);
        _earnAsProvider(alice, 2);
        vm.expectEmit(true, false, false, true);
        emit VotingWeight.Synced(alice, 0);
        weight.sync(alice);
    }

    function testFuzz_theWeightNeverExceedsTheCapOrThePoints(uint8 closed, uint8 capSeed) public {
        uint64 cap = uint64(bound(capSeed, 1, 100));
        vm.prank(admin);
        registry.set(ParameterKeys.VOTE_WEIGHT_CAP, cap);
        _credential(alice);
        _earnAsProvider(alice, closed);
        _deposit(alice, 5 * UNIT);

        uint256 expected = closed > cap ? cap : closed;
        assertEq(weight.weightOf(alice), expected);
        assertEq(weight.getVotes(alice), expected);
    }
}
