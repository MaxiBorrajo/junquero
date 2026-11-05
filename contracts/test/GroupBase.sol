// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MilestoneBase} from "./MilestoneBase.sol";
import {IArbitration} from "../src/interfaces/IArbitration.sol";
import {MockArbitration} from "./mocks/MockArbitration.sol";
import {
    CreateParams,
    DepositAuth,
    DepositMethod,
    GroupParams,
    GroupInfo,
    Order,
    OrderStatus
} from "../src/libraries/OrderTypes.sol";

abstract contract GroupBase is MilestoneBase {
    uint256 internal constant CONTRIBUTORS = 8;

    address[] internal members;
    uint256[] internal memberKeys;
    MockArbitration internal court;

    function setUp() public virtual override {
        super.setUp();
        for (uint256 i = 0; i < CONTRIBUTORS; i++) {
            (address member, uint256 key) = makeAddrAndKey(string.concat("member", vm.toString(i)));
            members.push(member);
            memberKeys.push(key);
        }
        court = new MockArbitration(escrow);
        vm.prank(admin);
        escrow.setArbitration(IArbitration(address(court)));
    }

    function _permitFor(address who, uint256 key, uint256 amount) internal returns (DepositAuth memory) {
        usdc.mint(who, amount);
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

    function _createGroup(uint256 target) internal returns (uint256 orderId) {
        CreateParams memory params = _params(address(usdc), target);
        vm.prank(payer);
        orderId = escrow.createGroupOrder(
            params, GroupParams({coordinator: address(0), fundingDeadline: uint40(block.timestamp + 7 days)})
        );
    }

    function _contribute(uint256 orderId, uint256 member, uint256 amount) internal {
        DepositAuth memory auth = _permitFor(members[member], memberKeys[member], amount);
        vm.prank(members[member]);
        escrow.contribute(orderId, uint128(amount), auth);
    }

    function _fundStandard(uint256 orderId) internal {
        _contribute(orderId, 0, 40 * USDC);
        _contribute(orderId, 1, 30 * USDC);
        _contribute(orderId, 2, 20 * USDC);
        _contribute(orderId, 3, 10 * USDC);
    }

    function _openGroup() internal returns (uint256 orderId) {
        orderId = _createGroup(100 * USDC);
        _fundStandard(orderId);
    }

    function _proposeProvider(uint256 orderId) internal {
        vm.prank(payer);
        escrow.proposeProvider(orderId, payee);
    }

    function _agreedGroup(uint256 price) internal returns (uint256 orderId) {
        orderId = _openGroup();
        _proposeProvider(orderId);
        vm.warp(block.timestamp + 24 hours);
        _agree(orderId, price);
    }

    function _deliveredGroup() internal returns (uint256 orderId) {
        orderId = _agreedGroup(100 * USDC);
        vm.prank(payee);
        escrow.deliver(orderId, EVIDENCE);
    }

    function _group(uint256 orderId) internal view returns (GroupInfo memory) {
        return escrow.getGroup(orderId);
    }

    function _balanceOfMembers() internal view returns (uint256 total) {
        for (uint256 i = 0; i < members.length; i++) {
            total += usdc.balanceOf(members[i]);
        }
    }

    function _everyone() internal view returns (uint256) {
        return _balanceOfMembers() + usdc.balanceOf(payer) + usdc.balanceOf(payee) + usdc.balanceOf(address(treasury))
            + usdc.balanceOf(address(escrow)) + usdc.balanceOf(address(court));
    }
}
