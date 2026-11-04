// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";
import {Order, OrderStatus, PaymentMode} from "./libraries/OrderTypes.sol";

struct ReceiptInfo {
    uint8 category;
    uint32 month;
}

contract Receipt is ERC721, ERC2771Context, IERC5192 {
    IEscrow public immutable escrow;

    mapping(uint256 orderId => ReceiptInfo) private _info;

    event ReceiptClaimed(uint256 indexed orderId, address indexed payee, uint8 category, uint32 month);

    error ZeroAddress();
    error NotClaimable(uint256 orderId);
    error NotPayee(address caller);
    error AlreadyClaimed(uint256 orderId);
    error Soulbound();

    constructor(IEscrow escrow_, address forwarder) ERC721("Junquero Receipt", "JQR") ERC2771Context(forwarder) {
        if (address(escrow_) == address(0)) revert ZeroAddress();
        escrow = escrow_;
    }

    function claim(uint256 orderId) external {
        address caller = _msgSender();
        Order memory order = escrow.getOrder(orderId);
        if (order.status != OrderStatus.Settled || order.mode != PaymentMode.Escrowed || !order.paidOut) {
            revert NotClaimable(orderId);
        }
        if (caller != order.payee) revert NotPayee(caller);
        if (_ownerOf(orderId) != address(0)) revert AlreadyClaimed(orderId);

        uint32 month = monthOf(order.settledAt);
        _info[orderId] = ReceiptInfo(order.category, month);
        _mint(caller, orderId);
        emit Locked(orderId);
        emit ReceiptClaimed(orderId, caller, order.category, month);
    }

    function info(uint256 orderId) external view returns (ReceiptInfo memory) {
        _requireOwned(orderId);
        return _info[orderId];
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function monthOf(uint256 timestamp) public pure returns (uint32) {
        uint256 z = timestamp / 1 days + 719_468;
        uint256 era = z / 146_097;
        uint256 doe = z - era * 146_097;
        uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 month = mp < 10 ? mp + 3 : mp - 9;
        uint256 year = yoe + era * 400 + (month <= 2 ? 1 : 0);
        return uint32(year * 100 + month);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
