// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArbitrationBase} from "./ArbitrationBase.sol";
import {Arbitration} from "../src/Arbitration.sol";
import {IArbitrationEvents} from "../src/interfaces/IArbitrationEvents.sol";

contract ArbitrationStakeTest is ArbitrationBase {
    address internal newcomer = makeAddr("newcomer");

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(IArbitrationEvents.ZeroAddress.selector);
        new Arbitration(
            address(0), escrow, registry, credentials, reputation, usdc, address(treasury), address(forwarder)
        );
        vm.expectRevert(IArbitrationEvents.ZeroAddress.selector);
        new Arbitration(admin, escrow, registry, credentials, reputation, usdc, address(0), address(forwarder));
    }

    function test_stakeMovesTokensAndEmitsEvent() public {
        usdc.mint(newcomer, 50 * USDC);
        vm.startPrank(newcomer);
        usdc.approve(address(court), 50 * USDC);

        vm.expectEmit(true, false, false, true);
        emit IArbitrationEvents.Staked(newcomer, uint128(30 * USDC));
        court.stake(uint128(30 * USDC));
        vm.stopPrank();

        assertEq(court.account(newcomer).staked, 30 * USDC);
        assertEq(court.availableStake(newcomer), 30 * USDC);
        assertEq(usdc.balanceOf(newcomer), 20 * USDC);
    }

    function test_stakeWithoutAllowanceReverts() public {
        usdc.mint(newcomer, 50 * USDC);
        vm.prank(newcomer);
        vm.expectRevert();
        court.stake(uint128(10 * USDC));
    }

    function test_stakeWithPermitNeedsNoPriorApproval() public {
        (address who, uint256 key) = makeAddrAndKey("permitJuror");
        usdc.mint(who, 40 * USDC);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                who,
                address(court),
                40 * USDC,
                usdc.nonces(who),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));

        vm.prank(who);
        court.stakeWithPermit(uint128(40 * USDC), deadline, v, r, s);

        assertEq(court.account(who).staked, 40 * USDC);
    }

    function test_stakeThroughTheForwarderCreditsTheSigner() public {
        (address who, uint256 key) = makeAddrAndKey("relayedJuror");
        usdc.mint(who, 15 * USDC);
        vm.prank(who);
        usdc.approve(address(court), type(uint256).max);

        _forward(key, who, address(court), abi.encodeCall(Arbitration.stake, (uint128(15 * USDC))));

        assertEq(court.account(who).staked, 15 * USDC);
    }

    function test_unstakeReturnsTheAvailableAmount() public {
        address juror = jurors[0];
        uint256 before = usdc.balanceOf(juror);

        vm.expectEmit(true, false, false, true);
        emit IArbitrationEvents.Unstaked(juror, uint128(5 * USDC));
        vm.prank(juror);
        court.unstake(uint128(5 * USDC));

        assertEq(usdc.balanceOf(juror) - before, 5 * USDC);
        assertEq(court.account(juror).staked, JUROR_DEPOSIT - 5 * USDC);
    }

    function test_unstakeMoreThanAvailableReverts() public {
        vm.prank(jurors[0]);
        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.InsufficientStake.selector, JUROR_DEPOSIT, JUROR_DEPOSIT + 1)
        );
        court.unstake(uint128(JUROR_DEPOSIT + 1));
    }

    function test_lockedStakeCannotBeWithdrawn() public {
        (, uint256 caseId) = _openMedium();
        address[] memory selected = _drawJury(caseId, 4);
        address juror = selected[0];

        assertEq(court.availableStake(juror), JUROR_DEPOSIT - STAKE);
        vm.prank(juror);
        vm.expectRevert(
            abi.encodeWithSelector(IArbitrationEvents.InsufficientStake.selector, JUROR_DEPOSIT - STAKE, JUROR_DEPOSIT)
        );
        court.unstake(uint128(JUROR_DEPOSIT));
    }

    function test_setSeedJurorRequiresTheSeederRole() public {
        vm.prank(newcomer);
        vm.expectRevert();
        court.setSeedJuror(newcomer, true);
    }

    function test_setSeedJurorEmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit IArbitrationEvents.SeedJurorSet(newcomer, true);
        vm.prank(admin);
        court.setSeedJuror(newcomer, true);
        assertTrue(court.account(newcomer).seed);
    }

    function test_withdrawRewardRevertsWithNothing() public {
        vm.prank(newcomer);
        vm.expectRevert(IArbitrationEvents.NothingToWithdraw.selector);
        court.withdrawReward(address(usdc));
    }
}
