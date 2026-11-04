// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Reputation} from "../src/Reputation.sol";
import {ParameterRegistry} from "../src/ParameterRegistry.sol";
import {IParameterRegistry} from "../src/interfaces/IParameterRegistry.sol";
import {IReputation, Role, Stats} from "../src/interfaces/IReputation.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";

contract ReputationTest is Test {
    ParameterRegistry internal registry;
    Reputation internal reputation;
    address internal admin = makeAddr("admin");
    address internal recorder = makeAddr("recorder");
    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee");
    address internal other = makeAddr("other");

    function setUp() public {
        registry = new ParameterRegistry(admin);
        bytes32 setterRole = registry.SETTER_ROLE();
        vm.startPrank(admin);
        registry.grantRole(setterRole, admin);
        registry.defineParameter(ParameterKeys.REPUTATION_PAIR_CAP, 1, 10, 2);
        vm.stopPrank();
        reputation = new Reputation(admin, IParameterRegistry(address(registry)));
        bytes32 recorderRole = reputation.RECORDER_ROLE();
        vm.prank(admin);
        reputation.grantRole(recorderRole, recorder);
    }

    function _settled(address from, address to, uint8 rating, bool automatic, bool disputed, bool qualifies) internal {
        vm.prank(recorder);
        reputation.recordSettled(from, to, rating, automatic, disputed, qualifies);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(IReputation.ZeroAddress.selector);
        new Reputation(address(0), IParameterRegistry(address(registry)));
        vm.expectRevert(IReputation.ZeroAddress.selector);
        new Reputation(admin, IParameterRegistry(address(0)));
    }

    function test_settlementCountsForBothRoles() public {
        vm.expectEmit(true, true, false, true);
        emit IReputation.SettlementRecorded(payer, payee, 4, false, false);
        _settled(payer, payee, 4, false, false, true);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        Stats memory requester = reputation.stats(payer, Role.Requester);
        assertEq(provider.closed, 1);
        assertEq(provider.closedClean, 1);
        assertEq(provider.ratingSum, 4);
        assertEq(provider.ratingCount, 1);
        assertEq(requester.closed, 1);
        assertEq(requester.closedClean, 1);
        assertEq(requester.ratingCount, 0);
        assertEq(reputation.closedWithoutDispute(payee), 1);
    }

    function test_rolesAreTrackedSeparately() public {
        _settled(payer, payee, 5, false, false, true);

        assertEq(reputation.stats(payee, Role.Requester).closed, 0);
        assertEq(reputation.stats(payer, Role.Provider).closed, 0);
        assertEq(reputation.stats(payee, Role.Juror).closed, 0);
        assertEq(reputation.stats(payee, Role.Witness).closed, 0);
    }

    function test_automaticReleaseIsNeutral() public {
        _settled(payer, payee, 0, true, false, true);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.closed, 1);
        assertEq(provider.ratingCount, 0);
        assertEq(provider.ratingSum, 0);
    }

    function test_disputedSettlementIsNotClean() public {
        _settled(payer, payee, 3, false, true, true);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.closed, 1);
        assertEq(provider.closedClean, 0);
        assertEq(reputation.closedWithoutDispute(payee), 0);
    }

    function test_belowMinimumIsSkipped() public {
        vm.expectEmit(true, true, false, true);
        emit IReputation.SettlementSkipped(payer, payee, 1);
        _settled(payer, payee, 5, false, false, false);

        assertEq(reputation.stats(payee, Role.Provider).closed, 0);
        assertEq(reputation.pairCount(payer, payee), 0);
    }

    function test_pairCapStopsCountingTheThirdSettlement() public {
        _settled(payer, payee, 5, false, false, true);
        _settled(payer, payee, 5, false, false, true);

        vm.expectEmit(true, true, false, true);
        emit IReputation.SettlementSkipped(payer, payee, 2);
        _settled(payer, payee, 5, false, false, true);

        assertEq(reputation.stats(payee, Role.Provider).closed, 2);
        assertEq(reputation.pairCount(payer, payee), 2);
    }

    function test_pairCountIsSymmetric() public {
        _settled(payer, payee, 5, false, false, true);
        _settled(payee, payer, 5, false, false, true);

        assertEq(reputation.pairCount(payer, payee), 2);
        assertEq(reputation.pairCount(payee, payer), 2);
    }

    function test_differentCounterpartsDoNotShareTheCap() public {
        _settled(payer, payee, 5, false, false, true);
        _settled(payer, payee, 5, false, false, true);
        _settled(other, payee, 5, false, false, true);

        assertEq(reputation.stats(payee, Role.Provider).closed, 3);
    }

    function test_raisingTheCapAllowsMore() public {
        _settled(payer, payee, 5, false, false, true);
        _settled(payer, payee, 5, false, false, true);
        vm.prank(admin);
        registry.set(ParameterKeys.REPUTATION_PAIR_CAP, 3);
        _settled(payer, payee, 5, false, false, true);

        assertEq(reputation.stats(payee, Role.Provider).closed, 3);
    }

    function test_invalidRatingRevertsWhenRated() public {
        vm.prank(recorder);
        vm.expectRevert(abi.encodeWithSelector(IReputation.InvalidRating.selector, 0));
        reputation.recordSettled(payer, payee, 0, false, false, true);

        vm.prank(recorder);
        vm.expectRevert(abi.encodeWithSelector(IReputation.InvalidRating.selector, 6));
        reputation.recordSettled(payer, payee, 6, false, false, true);
    }

    function test_cashSettlementIsTrackedApart() public {
        vm.expectEmit(true, true, false, true);
        emit IReputation.CashRecorded(payer, payee, 5);
        vm.prank(recorder);
        reputation.recordCash(payer, payee, 5);

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.cashClosed, 1);
        assertEq(provider.closed, 0);
        assertEq(reputation.stats(payer, Role.Requester).cashClosed, 1);
        assertEq(reputation.pairCount(payer, payee), 0);
    }

    function test_cashRejectsInvalidRating() public {
        vm.prank(recorder);
        vm.expectRevert(abi.encodeWithSelector(IReputation.InvalidRating.selector, 0));
        reputation.recordCash(payer, payee, 0);
    }

    function test_failureIsRecordedForTheRole() public {
        vm.expectEmit(true, false, false, true);
        emit IReputation.FailureRecorded(payee, Role.Provider);
        vm.prank(recorder);
        reputation.recordFailure(payee, Role.Provider);

        assertEq(reputation.stats(payee, Role.Provider).failures, 1);
        assertEq(reputation.stats(payee, Role.Requester).failures, 0);
    }

    function test_disputeLostAndWonAreDistinguished() public {
        vm.startPrank(recorder);
        reputation.recordDispute(payee, Role.Provider, true);
        reputation.recordDispute(payee, Role.Provider, false);
        vm.stopPrank();

        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertEq(provider.disputes, 2);
        assertEq(provider.disputesLost, 1);
    }

    function test_onlyRecorderCanWrite() public {
        vm.startPrank(other);
        vm.expectRevert();
        reputation.recordSettled(payer, payee, 5, false, false, true);
        vm.expectRevert();
        reputation.recordCash(payer, payee, 5);
        vm.expectRevert();
        reputation.recordFailure(payee, Role.Provider);
        vm.expectRevert();
        reputation.recordDispute(payee, Role.Provider, true);
        vm.stopPrank();
    }

    function test_adminCannotWriteWithoutTheRecorderRole() public {
        vm.prank(admin);
        vm.expectRevert();
        reputation.recordFailure(payee, Role.Provider);
    }

    function testFuzz_cleanNeverExceedsClosed(uint8 rounds, bool disputed) public {
        rounds = uint8(bound(rounds, 1, 12));
        for (uint256 i = 0; i < rounds; i++) {
            _settled(address(uint160(1000 + i)), payee, 5, false, disputed, true);
        }
        Stats memory provider = reputation.stats(payee, Role.Provider);
        assertLe(provider.closedClean, provider.closed);
        assertEq(provider.closed, rounds);
    }
}
