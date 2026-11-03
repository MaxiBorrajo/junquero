// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EscrowBase} from "./EscrowBase.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {Escrow} from "../src/Escrow.sol";
import {MockFeeToken} from "./mocks/MockFeeToken.sol";
import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    DepositMethod,
    CreateParams,
    DepositAuth,
    TokenConfig
} from "../src/libraries/OrderTypes.sol";

contract EscrowCreateTest is EscrowBase {
    function test_createWithPermitPullsFundsAndStoresOrder() public {
        uint256 orderId = _createUsdc(100 * USDC);

        Order memory order = _order(orderId);
        assertEq(orderId, 1);
        assertEq(order.payer, payer);
        assertEq(uint8(order.status), uint8(OrderStatus.Open));
        assertEq(order.deposited, 100 * USDC);
        assertEq(order.specHash, SPEC);
        assertEq(order.token, address(usdc));
        assertEq(usdc.balanceOf(address(escrow)), 100 * USDC);
        assertEq(usdc.balanceOf(payer), 9_900 * USDC);
    }

    function test_createEmitsEvent() public {
        DepositAuth memory auth = _permitAuth(50 * USDC);
        vm.expectEmit(true, true, true, true);
        emit IEscrow.OrderCreated(1, payer, address(usdc), uint128(50 * USDC), SPEC, 0, 0, 0);
        vm.prank(payer);
        escrow.createOrder(_params(address(usdc), 50 * USDC), auth);
    }

    function test_createSurvivesFrontRunPermit() public {
        DepositAuth memory auth = _permitAuth(80 * USDC);
        (bytes32 r, bytes32 s, uint8 v) = _splitSig(auth.signature);
        usdc.permit(payer, address(escrow), 80 * USDC, auth.deadline, v, r, s);

        vm.prank(payer);
        uint256 orderId = escrow.createOrder(_params(address(usdc), 80 * USDC), auth);
        assertEq(_order(orderId).deposited, 80 * USDC);
    }

    function test_createWithPermit2() public {
        DepositAuth memory auth = _permit2Auth(address(usdt), 120 * USDC, 7);
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(_params(address(usdt), 120 * USDC), auth);
        assertEq(usdt.balanceOf(address(escrow)), 120 * USDC);
        assertEq(_order(orderId).deposited, 120 * USDC);
    }

    function test_createPermit2NonceCannotBeReused() public {
        DepositAuth memory auth = _permit2Auth(address(usdt), 10 * USDC, 1);
        vm.startPrank(payer);
        escrow.createOrder(_params(address(usdt), 10 * USDC), auth);
        vm.expectRevert();
        escrow.createOrder(_params(address(usdt), 10 * USDC), auth);
        vm.stopPrank();
    }

    function test_createWithAllowance() public {
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(_params(address(usdt), 30 * USDC), _noAuth());
        assertEq(_order(orderId).deposited, 30 * USDC);
    }

    function test_createRevertsWhenTokenNotAllowed() public {
        MockFeeToken stranger = new MockFeeToken();
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.TokenNotAllowed.selector, address(stranger)));
        escrow.createOrder(_params(address(stranger), 10), _noAuth());
    }

    function test_createRevertsOnZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(IEscrow.InvalidAmount.selector);
        escrow.createOrder(_params(address(usdt), 0), _noAuth());
    }

    function test_createRevertsWhenStartInPast() public {
        CreateParams memory p = _params(address(usdt), 10 * USDC);
        p.startsAt = uint40(block.timestamp);
        vm.prank(payer);
        vm.expectRevert(IEscrow.InvalidSchedule.selector);
        escrow.createOrder(p, _noAuth());
    }

    function test_createRevertsWhenDeadlineBeforeStart() public {
        CreateParams memory p = _params(address(usdt), 10 * USDC);
        p.startsAt = uint40(block.timestamp + 2 days);
        p.deadline = uint40(block.timestamp + 1 days);
        vm.prank(payer);
        vm.expectRevert(IEscrow.InvalidSchedule.selector);
        escrow.createOrder(p, _noAuth());
    }

    function test_createRevertsOnFeeOnTransferToken() public {
        MockFeeToken fee = new MockFeeToken();
        _configure(address(fee), DepositMethod.Allowance);
        fee.mint(payer, 100 * USDC);
        vm.startPrank(payer);
        fee.approve(address(escrow), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(IEscrow.FeeOnTransferToken.selector, address(fee)));
        escrow.createOrder(_params(address(fee), 100 * USDC), _noAuth());
        vm.stopPrank();
    }

    function test_createCashChargesOnlyTheFee() public {
        CreateParams memory p = _params(address(usdt), 200 * USDC);
        p.mode = PaymentMode.Cash;
        vm.prank(payer);
        uint256 orderId = escrow.createOrder(p, _noAuth());

        uint256 expectedFee = 2 * USDC + (200 * USDC * 500) / 10_000;
        assertEq(usdt.balanceOf(address(treasury)), expectedFee);
        assertEq(usdt.balanceOf(address(escrow)), 0);
        Order memory order = _order(orderId);
        assertEq(order.deposited, 0);
        assertEq(order.price, 200 * USDC);
    }

    function test_createThroughForwarderAttributesTheSigner() public {
        DepositAuth memory auth = _permitAuth(60 * USDC);
        bytes memory data = abi.encodeCall(Escrow.createOrder, (_params(address(usdc), 60 * USDC), auth));
        uint48 deadline = uint48(block.timestamp + 1 hours);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
                ),
                payer,
                address(escrow),
                uint256(0),
                uint256(1_000_000),
                forwarder.nonces(payer),
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
                address(forwarder)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        ERC2771Forwarder.ForwardRequestData memory request = ERC2771Forwarder.ForwardRequestData({
            from: payer,
            to: address(escrow),
            value: 0,
            gas: 1_000_000,
            deadline: deadline,
            data: data,
            signature: abi.encodePacked(r, s, v)
        });

        vm.prank(relayer);
        forwarder.execute(request);

        assertEq(_order(1).payer, payer);
        assertEq(usdc.balanceOf(address(escrow)), 60 * USDC);
    }

    function test_configureTokenRequiresRole() public {
        TokenConfig memory config = escrow.tokenConfig(address(usdc));
        vm.prank(payer);
        vm.expectRevert();
        escrow.configureToken(address(usdc), config);
    }

    function test_configureTokenRejectsInvertedThresholds() public {
        TokenConfig memory config = escrow.tokenConfig(address(usdc));
        config.smallMax = config.mediumMax + 1;
        vm.prank(admin);
        vm.expectRevert(IEscrow.InvalidThresholds.selector);
        escrow.configureToken(address(usdc), config);
    }

    function _splitSig(bytes memory sig) private pure returns (bytes32 r, bytes32 s, uint8 v) {
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
