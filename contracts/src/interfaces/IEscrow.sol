// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEscrowEvents} from "./IEscrowEvents.sol";
import {IReputation} from "./IReputation.sol";
import {
    Order,
    OrderStatus,
    CreateParams,
    DepositAuth,
    Reservation,
    Agreement,
    Release,
    TokenConfig,
    SizeClass
} from "../libraries/OrderTypes.sol";

interface IEscrow is IEscrowEvents {
    function createOrder(CreateParams calldata params, DepositAuth calldata auth) external returns (uint256 orderId);
    function reserve(Reservation calldata reservation, bytes calldata payerSignature, bytes calldata payeeSignature)
        external;
    function withdrawReservation(uint256 orderId) external;
    function agree(Agreement calldata agreement, bytes calldata payerSignature, bytes calldata payeeSignature) external;
    function deliver(uint256 orderId, bytes32 evidenceHash) external;
    function release(Release calldata release, bytes calldata payerSignature) external;
    function autoRelease(uint256 orderId) external;
    function cancel(uint256 orderId) external;
    function reclaim(uint256 orderId) external;
    function checkIn(uint256 orderId) external;
    function confirmArrival(uint256 orderId) external;
    function claimNoShow(uint256 orderId) external;
    function extendReview(uint256 orderId) external;
    function requestChanges(uint256 orderId, bytes32 reasonHash) external;
    function moderate(uint256 orderId, bytes32 reasonHash) external;
    function claim(address token, address account) external;
    function setReputation(IReputation reputation) external;
    function claimable(address token, address account) external view returns (uint256);

    function configureToken(address token, TokenConfig calldata config) external;
    function getOrder(uint256 orderId) external view returns (Order memory);
    function tokenConfig(address token) external view returns (TokenConfig memory);
    function reservationCompensation(uint256 orderId) external view returns (uint128);
    function freeCancelsUsed(address payer, address payee) external view returns (uint8 account, uint8 pair);
    function domainSeparator() external view returns (bytes32);
}
