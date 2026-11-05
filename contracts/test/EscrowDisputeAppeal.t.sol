// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IArbitration} from "../src/interfaces/IArbitration.sol";
import {MockArbitration} from "./mocks/MockArbitration.sol";
import {DepositAuth, DepositMethod, OrderStatus} from "../src/libraries/OrderTypes.sol";

contract EscrowDisputeAppealTest is EscrowBase {
    MockArbitration internal court;
    uint256 internal constant FEE = USDC;

    function setUp() public override {
        super.setUp();
        court = new MockArbitration(escrow);
        vm.prank(admin);
        escrow.setArbitration(IArbitration(address(court)));
    }

    function _open(address claimant) internal returns (uint256 orderId) {
        orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);

        usdc.mint(claimant, 3 * FEE);
        uint256 key = claimant == payer ? payerKey : payeeKey;
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                claimant,
                address(escrow),
                3 * FEE,
                usdc.nonces(claimant),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
        DepositAuth memory auth = DepositAuth({
            method: DepositMethod.Permit, nonce: 0, deadline: deadline, signature: abi.encodePacked(r, s, v)
        });
        vm.prank(claimant);
        escrow.openDispute(orderId, keccak256("reason"), auth);
    }

    function test_theClaimantFeeLeavesTheEscrowWhenTheDisputeOpens() public {
        uint256 orderId = _open(payer);

        assertEq(usdc.balanceOf(address(escrow)), 100 * USDC);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
        assertEq(escrow.getDispute(orderId).fee, 3 * FEE);
    }

    function test_theAppellantIsReimbursedFromTheLosersShare() public {
        uint256 orderId = _open(payer);

        court.resolveAppealed(orderId, 8000, uint128(7 * FEE), payee);

        assertEq(usdc.balanceOf(payee), 87 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(usdc.balanceOf(address(court)), 3 * FEE);
    }

    function test_theLosersRefundShrinksByTheAppellantReimbursement() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 8000, uint128(7 * FEE), payee);

        assertEq(usdc.balanceOf(payer) - payerBefore, 13 * USDC);
    }

    function test_theReimbursementIsCappedAtTheLosersShare() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 9500, uint128(7 * FEE), payee);

        assertEq(usdc.balanceOf(payee), 100 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 0);
    }

    function test_theClaimantAndTheAppellantAreReimbursedInOrder() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 3000, uint128(7 * FEE), payer);

        assertEq(usdc.balanceOf(payee), 20 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 80 * USDC);
    }

    function test_theClaimantIsReimbursedBeforeTheAppellantWhenTheShareIsShort() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 800, uint128(7 * FEE), payer);

        assertEq(usdc.balanceOf(payee), 0);
        assertEq(usdc.balanceOf(payer) - payerBefore, 100 * USDC);
    }

    function test_anAppellantWhoLosesIsNotReimbursed() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 7000, uint128(7 * FEE), payer);

        assertEq(usdc.balanceOf(payee), 70 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 30 * USDC);
    }

    function test_noReimbursementsHappenWhenTheCostIsWaived() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveWaived(orderId, 3000);

        assertEq(usdc.balanceOf(payee), 30 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 70 * USDC + 3 * FEE);
    }

    function test_anExactTieReimbursesNobody() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 5000, uint128(7 * FEE), payee);

        assertEq(usdc.balanceOf(payee), 50 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 50 * USDC);
    }

    function test_withoutAnAppellantThereIsNothingToReimburse() public {
        uint256 orderId = _open(payer);
        uint256 payerBefore = usdc.balanceOf(payer);

        court.resolveAppealed(orderId, 3000, uint128(7 * FEE), address(0));

        assertEq(usdc.balanceOf(payee), 27 * USDC);
        assertEq(usdc.balanceOf(payer) - payerBefore, 73 * USDC);
    }

    function testFuzz_reimbursementsNeverCreateOrDestroyMoney(uint16 shareSeed, uint96 feeSeed, bool providerAppeals)
        public
    {
        uint16 share = uint16(bound(shareSeed, 0, 10_000));
        uint128 appealFee = uint128(bound(feeSeed, 0, 20 * USDC));
        uint256 orderId = _open(payer);
        uint256 total = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(escrow))
            + usdc.balanceOf(address(court)) + usdc.balanceOf(address(treasury));

        court.resolveAppealed(orderId, share, appealFee, providerAppeals ? payee : payer);

        uint256 afterwards = usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(escrow))
            + usdc.balanceOf(address(court)) + usdc.balanceOf(address(treasury));
        assertEq(afterwards, total);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Settled));
    }
}
