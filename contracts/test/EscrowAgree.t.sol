// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {ParameterKeys} from "../src/libraries/ParameterKeys.sol";
import {Order, OrderStatus, SizeClass, PaymentMode, CreateParams, Reservation, Agreement} from "../src/libraries/OrderTypes.sol";

contract EscrowAgreeTest is EscrowBase {
    function test_agreeFixesPayeeAndRefundsSurplus() public {
        uint256 orderId = _createUsdc(100 * USDC);
        uint256 payerBefore = usdc.balanceOf(payer);

        _agree(orderId, 80 * USDC);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(order.payee, payee);
        assertEq(order.price, 80 * USDC);
        assertEq(order.deposited, 80 * USDC);
        assertEq(order.termsHash, TERMS);
        assertEq(usdc.balanceOf(payer) - payerBefore, 20 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 80 * USDC);
    }

    function test_agreeClassifiesByAgreedPrice() public {
        uint256 small = _createUsdc(15 * USDC);
        uint256 medium = _createUsdc(250 * USDC);
        uint256 large = _createUsdc(900 * USDC);
        uint256 downgraded = _createUsdc(400 * USDC);

        _agree(small, 15 * USDC);
        _agree(medium, 250 * USDC);
        _agree(large, 900 * USDC);
        _agree(downgraded, 300 * USDC);

        assertEq(uint8(_order(small).sizeClass), uint8(SizeClass.Small));
        assertEq(uint8(_order(medium).sizeClass), uint8(SizeClass.Medium));
        assertEq(uint8(_order(large).sizeClass), uint8(SizeClass.Large));
        assertEq(uint8(_order(downgraded).sizeClass), uint8(SizeClass.Medium));
    }

    function test_sizeClassSurvivesThresholdChange() public {
        uint256 orderId = _createUsdc(250 * USDC);
        _agree(orderId, 250 * USDC);

        _configureThresholds(address(usdc), 10 * USDC, 100 * USDC);

        assertEq(uint8(_order(orderId).sizeClass), uint8(SizeClass.Medium));
    }

    function test_agreeRevertsWhenPriceExceedsDeposit() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory a = _agreement(orderId, 101 * USDC);
        bytes32 h = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory payeeSig = _sign(payeeKey, h);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.PriceExceedsDeposit.selector, 101 * USDC, 100 * USDC));
        escrow.agree(a, payerSig, payeeSig);
    }

    function test_agreeRevertsOnSpecMismatch() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        a.specHash = keccak256("other spec");
        bytes32 h = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory payeeSig = _sign(payeeKey, h);
        vm.expectRevert(IEscrow.AgreementMismatch.selector);
        escrow.agree(a, payerSig, payeeSig);
    }

    function test_agreeRevertsWhenExpired() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        bytes32 h = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory payeeSig = _sign(payeeKey, h);
        vm.warp(a.expiry + 1);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.SignatureExpired.selector, a.expiry));
        escrow.agree(a, payerSig, payeeSig);
    }

    function test_agreeRevertsWhenPayerSignatureIsForged() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        bytes32 h = _agreementHash(a);
        bytes memory forged = _sign(otherKey, h);
        bytes memory payeeSig = _sign(payeeKey, h);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidSignature.selector, payer));
        escrow.agree(a, forged, payeeSig);
    }

    function test_agreeRevertsWhenPayeeSignatureIsMissing() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        bytes32 h = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory forged = _sign(otherKey, h);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidSignature.selector, payee));
        escrow.agree(a, payerSig, forged);
    }

    function test_agreeRevertsWhenSignedTermsDifferFromSubmitted() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory signed = _agreement(orderId, 100 * USDC);
        bytes32 h = _agreementHash(signed);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory payeeSig = _sign(payeeKey, h);
        Agreement memory submitted = _agreement(orderId, 90 * USDC);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidSignature.selector, payer));
        escrow.agree(submitted, payerSig, payeeSig);
    }

    function test_agreeRevertsWhenPayeeIsPayer() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        a.payee = payer;
        bytes32 h = _agreementHash(a);
        bytes memory sig = _sign(payerKey, h);
        vm.expectRevert(IEscrow.PayeeIsPayer.selector);
        escrow.agree(a, sig, sig);
    }

    function test_agreeCannotRepeat() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _agree(orderId, 100 * USDC);
        Agreement memory a = _agreement(orderId, 100 * USDC);
        bytes32 h = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory payeeSig = _sign(payeeKey, h);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidStatus.selector, orderId, OrderStatus.Agreed));
        escrow.agree(a, payerSig, payeeSig);
    }

    function test_agreeRevertsOnUnknownOrder() public {
        Agreement memory a = _agreement(99, 1);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.UnknownOrder.selector, 99));
        escrow.agree(a, "", "");
    }

    function test_agreeCashOrderRecordsPriceWithoutMovingFunds() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());
        uint256 escrowBefore = usdt.balanceOf(address(escrow));

        _agree(orderId, 250 * USDC);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Agreed));
        assertEq(order.price, 250 * USDC);
        assertEq(usdt.balanceOf(address(escrow)), escrowBefore);
    }

    function test_reserveThenAgreeOnlyWithReservedPayee() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Reserved));
        assertEq(_order(orderId).reservedPayee, payee);

        Agreement memory a = _agreement(orderId, 100 * USDC);
        a.payee = other;
        bytes32 h = _agreementHash(a);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory otherSig = _sign(otherKey, h);
        vm.expectRevert(IEscrow.AgreementMismatch.selector);
        escrow.agree(a, payerSig, otherSig);

        _agree(orderId, 100 * USDC);
        assertEq(uint8(_order(orderId).status), uint8(OrderStatus.Agreed));
        assertEq(_order(orderId).reservedPayee, address(0));
    }

    function test_reserveRequiresBothSignatures() public {
        uint256 orderId = _createUsdc(100 * USDC);
        Reservation memory r =
            Reservation({orderId: orderId, payer: payer, payee: payee, expiry: uint40(block.timestamp + 1 hours)});
        bytes32 h = _reservationHash(r);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory forged = _sign(otherKey, h);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidSignature.selector, payee));
        escrow.reserve(r, payerSig, forged);
    }

    function test_reserveOnlyOnePerOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        Reservation memory r =
            Reservation({orderId: orderId, payer: payer, payee: other, expiry: uint40(block.timestamp + 1 hours)});
        bytes32 h = _reservationHash(r);
        bytes memory payerSig = _sign(payerKey, h);
        bytes memory otherSig = _sign(otherKey, h);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.InvalidStatus.selector, orderId, OrderStatus.Reserved));
        escrow.reserve(r, payerSig, otherSig);
    }

    function test_payeeCanWithdrawReservationForFree() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.prank(payee);
        escrow.withdrawReservation(orderId);

        Order memory order = _order(orderId);
        assertEq(uint8(order.status), uint8(OrderStatus.Open));
        assertEq(order.reservedPayee, address(0));
    }

    function test_onlyReservedPayeeCanWithdraw() public {
        uint256 orderId = _createUsdc(100 * USDC);
        _reserve(orderId);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.NotPayee.selector, other));
        escrow.withdrawReservation(orderId);
    }
}
