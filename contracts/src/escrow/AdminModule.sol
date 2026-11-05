// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {IReputation, Role} from "../interfaces/IReputation.sol";
import {EscrowHashes} from "../libraries/EscrowHashes.sol";
import {ParameterKeys} from "../libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    Modality,
    DepositMethod,
    SizeClass,
    CancelReason,
    CreateParams,
    DepositAuth,
    Reservation,
    Agreement,
    Release,
    TokenConfig
} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

contract AdminModule is EscrowStorage {
    using SafeERC20 for IERC20;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](8);
        selectors_[0] = AdminModule.claim.selector;
        selectors_[1] = AdminModule.setReputation.selector;
        selectors_[2] = AdminModule.configureToken.selector;
        selectors_[3] = AdminModule.getOrder.selector;
        selectors_[4] = AdminModule.tokenConfig.selector;
        selectors_[5] = AdminModule.reservationCompensation.selector;
        selectors_[6] = AdminModule.freeCancelsUsed.selector;
        selectors_[7] = AdminModule.domainSeparator.selector;
    }

    function claim(address token, address account) external nonReentrant {
        uint256 amount = claimable[token][account];
        if (amount == 0) revert NothingToClaim();
        claimable[token][account] = 0;
        IERC20(token).safeTransfer(account, amount);
        emit Claimed(token, account, amount);
    }

    function setReputation(IReputation reputation_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputation = reputation_;
        emit ReputationUpdated(address(reputation_));
    }

    function configureToken(address token, TokenConfig calldata config) external onlyRole(TOKEN_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        if (config.smallMax > config.mediumMax) revert InvalidThresholds();
        _tokenConfigs[token] = config;
        emit TokenConfigured(token, config);
    }

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function tokenConfig(address token) external view returns (TokenConfig memory) {
        return _tokenConfigs[token];
    }

    function reservationCompensation(uint256 orderId) external view returns (uint128) {
        return _reservationCompensation(_orders[orderId]);
    }

    function freeCancelsUsed(address payer, address payee) external view returns (uint8 account, uint8 pair) {
        uint256 month = block.timestamp / MONTH;
        account = _freeCancelsByAccount[payer][month];
        pair = _freeCancelsByPair[_pairKey(payer, payee)][month];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
