// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {Receipt as JunqueroReceipt, RatedInfo, ReceiptInfo} from "../src/Receipt.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {IEscrowEvents} from "../src/interfaces/IEscrowEvents.sol";
import {CreateParams, DepositAuth, Release} from "../src/libraries/OrderTypes.sol";

// El comprobante que el Escrow emite solo, al cobrar con calificación.
contract ReceiptRatedTest is EscrowBase {
    JunqueroReceipt internal receipt;
    bytes32 internal constant COMMENT = keccak256("Excelente trabajo, muy prolijo.");

    function setUp() public override {
        super.setUp();
        receipt = new JunqueroReceipt(IEscrow(address(escrow)), address(forwarder));
        vm.prank(admin);
        escrow.setReceipt(receipt);
    }

    function _delivered(uint256 amount) internal returns (uint256 orderId) {
        CreateParams memory params = _params(address(usdc), amount);
        params.category = 4;
        DepositAuth memory auth = _permitAuth(amount);
        vm.prank(payer);
        orderId = escrow.createOrder(params, auth);
        _agree(orderId, amount);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function _signed(uint256 orderId, uint256 amount, uint8 rating, bytes32 comment)
        internal
        view
        returns (Release memory r, bytes memory sig)
    {
        (r,) = _release(orderId, amount, rating);
        r.commentHash = comment;
        sig = _sign(payerKey, _releaseHash(r));
    }

    function test_cobrarConCalificacionEmiteElComprobanteSolo() public {
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 4, COMMENT);

        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(receipt.ownerOf(orderId), payee);
        assertTrue(receipt.locked(orderId));
        RatedInfo memory rated = receipt.rated(orderId);
        assertEq(rated.payer, payer);
        assertEq(rated.rating, 4);
        assertEq(rated.commentHash, COMMENT);
        assertEq(rated.amount, 100 * USDC);
        assertEq(rated.specHash, escrow.getOrder(orderId).specHash);
        ReceiptInfo memory info = receipt.info(orderId);
        assertEq(info.category, 4);
        assertEq(info.month, receipt.monthOf(block.timestamp));
    }

    function test_elEventoLlevaLaNotaYLaHuellaDelComentario() public {
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 5, COMMENT);

        vm.expectEmit(true, true, true, true, address(receipt));
        emit JunqueroReceipt.ReceiptMinted(
            orderId, payee, payer, 5, COMMENT, escrow.getOrder(orderId).specHash, uint128(100 * USDC)
        );
        vm.prank(payee);
        escrow.release(r, sig);
    }

    function test_sinComentarioLaHuellaQuedaEnCero() public {
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 3, bytes32(0));

        vm.prank(payee);
        escrow.release(r, sig);

        assertEq(receipt.rated(orderId).commentHash, bytes32(0));
        assertEq(receipt.rated(orderId).rating, 3);
    }

    function test_elComentarioVaFirmadoPorQuienPublica() public {
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 5, COMMENT);
        // Quien cobra no puede cambiar el comentario: la firma ya no coincide.
        r.commentHash = keccak256("Otro comentario");

        vm.prank(payee);
        vm.expectRevert();
        escrow.release(r, sig);
        assertEq(receipt.balanceOf(payee), 0);
    }

    function test_laLiberacionAutomaticaNoEmiteComprobante() public {
        uint256 orderId = _delivered(100 * USDC);
        vm.warp(block.timestamp + 25 hours);
        escrow.autoRelease(orderId);

        assertEq(receipt.balanceOf(payee), 0);
        // Quien trabajó todavía lo puede reclamar a mano, sin nota.
        vm.prank(payee);
        receipt.claim(orderId);
        assertEq(receipt.ownerOf(orderId), payee);
        assertEq(receipt.rated(orderId).rating, 0);
    }

    function test_unComprobanteEmitidoNoSeReclamaDeNuevo() public {
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 5, COMMENT);
        vm.prank(payee);
        escrow.release(r, sig);

        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.AlreadyClaimed.selector, orderId));
        receipt.claim(orderId);
    }

    function test_soloElEscrowPuedeEmitir() public {
        uint256 orderId = _delivered(100 * USDC);
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotEscrow.selector, payee));
        receipt.mintRated(orderId, 5, COMMENT);
    }

    function test_esIntransferible() public {
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 5, COMMENT);
        vm.prank(payee);
        escrow.release(r, sig);

        vm.prank(payee);
        vm.expectRevert(JunqueroReceipt.Soulbound.selector);
        receipt.transferFrom(payee, payer, orderId);
    }

    function test_siElComprobanteFallaElPagoIgualSeHace() public {
        // Con un comprobante que revierte, el cobro no se frena: solo queda el aviso.
        address broken = address(new Reverting());
        vm.prank(admin);
        escrow.setReceipt(JunqueroReceipt(broken));
        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 5, COMMENT);
        uint256 before = usdc.balanceOf(payee);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit IEscrowEvents.HookFailed(orderId, JunqueroReceipt.mintRated.selector);
        vm.prank(payee);
        escrow.release(r, sig);

        assertGt(usdc.balanceOf(payee), before);
    }

    function test_laDireccionBaseLaFijaQuienAdministra() public {
        vm.prank(payee);
        vm.expectRevert(abi.encodeWithSelector(JunqueroReceipt.NotAdmin.selector, payee));
        receipt.setBaseURI("https://api.junquero.example/receipts/");

        vm.prank(admin);
        receipt.setBaseURI("https://api.junquero.example/receipts/");

        uint256 orderId = _delivered(100 * USDC);
        (Release memory r, bytes memory sig) = _signed(orderId, 100 * USDC, 5, COMMENT);
        vm.prank(payee);
        escrow.release(r, sig);
        assertEq(
            receipt.tokenURI(orderId), string.concat("https://api.junquero.example/receipts/", vm.toString(orderId))
        );
    }
}

contract Reverting {
    function mintRated(uint256, uint8, bytes32) external pure {
        revert("no");
    }
}
