// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISignatureTransfer} from "permit2/src/interfaces/ISignatureTransfer.sol";
import {IParameterRegistry} from "../interfaces/IParameterRegistry.sol";
import {ParameterKeys} from "../libraries/ParameterKeys.sol";
import {
    Order,
    OrderStatus,
    PaymentMode,
    CancelReason,
    CreateParams,
    DepositAuth,
    GroupParams,
    GroupInfo,
    TokenConfig
} from "../libraries/OrderTypes.sol";
import {EscrowStorage} from "./EscrowStorage.sol";

contract GroupModule is EscrowStorage {
    uint8 private constant MAX_CONTRIBUTORS = 30;

    constructor(IParameterRegistry registry_, address treasury_, ISignatureTransfer permit2_, address forwarder)
        EscrowStorage(registry_, treasury_, permit2_, forwarder)
    {}

    function selectors() external pure returns (bytes4[] memory selectors_) {
        selectors_ = new bytes4[](10);
        selectors_[0] = GroupModule.createGroupOrder.selector;
        selectors_[1] = GroupModule.contribute.selector;
        selectors_[2] = GroupModule.withdrawContribution.selector;
        selectors_[3] = GroupModule.refundFunding.selector;
        selectors_[4] = GroupModule.proposeProvider.selector;
        selectors_[5] = GroupModule.vetoProvider.selector;
        selectors_[6] = GroupModule.supportCoordinator.selector;
        selectors_[7] = GroupModule.getGroup.selector;
        selectors_[8] = GroupModule.contributorsOf.selector;
        selectors_[9] = GroupModule.contributionOf.selector;
    }

    function createGroupOrder(CreateParams calldata params, GroupParams calldata group)
        external
        nonReentrant
        returns (uint256 orderId)
    {
        address creator = _msgSender();
        TokenConfig storage config = _tokenConfigs[params.token];
        if (!config.allowed) revert TokenNotAllowed(params.token);
        if (params.amount == 0) revert InvalidAmount();
        if (params.mode != PaymentMode.Escrowed) revert UnsupportedForMode();
        _checkSchedule(params.startsAt, params.deadline);
        if (group.fundingDeadline <= block.timestamp) revert InvalidDeadline();

        address coordinator = group.coordinator == address(0) ? creator : group.coordinator;
        orderId = ++lastOrderId;
        Order storage order = _orders[orderId];
        order.payer = coordinator;
        order.status = OrderStatus.Funding;
        order.mode = params.mode;
        order.modality = params.modality;
        order.createdAt = uint40(block.timestamp);
        order.startsAt = params.startsAt;
        order.deadline = params.deadline;
        order.token = params.token;
        order.specHash = params.specHash;
        order.category = params.category;
        order.isGroup = true;

        GroupInfo storage info = _groups[orderId];
        info.target = params.amount;
        info.fundingDeadline = group.fundingDeadline;
        emit GroupCreated(orderId, creator, coordinator, params.amount, group.fundingDeadline);
    }

    function contribute(uint256 orderId, uint128 amount, DepositAuth calldata auth) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Funding);
        GroupInfo storage info = _groups[orderId];
        if (block.timestamp > info.fundingDeadline) revert FundingClosed();
        if (amount == 0) revert InvalidAmount();
        address contributor = _msgSender();

        uint128 remaining = info.target - info.totalContributed;
        if (amount > remaining) revert ExceedsTarget(remaining);
        uint128 current = _contributions[orderId][contributor];
        uint128 total = current + amount;
        uint128 min = uint128((uint256(info.target) * registry.get(ParameterKeys.CONTRIBUTION_MIN_BPS)) / BPS);
        uint128 max = uint128((uint256(info.target) * registry.get(ParameterKeys.CONTRIBUTION_MAX_BPS)) / BPS);
        if (total > max || (total < min && amount != remaining)) revert ContributionOutOfRange(min, max);

        if (current == 0) {
            if (_contributors[orderId].length >= MAX_CONTRIBUTORS) revert TooManyContributors();
            _contributors[orderId].push(contributor);
        }
        _contributions[orderId][contributor] = total;
        info.totalContributed += amount;
        order.deposited += amount;
        bool completed = info.totalContributed == info.target;
        if (completed) order.status = OrderStatus.Open;

        _collect(order.token, contributor, amount, auth);
        emit Contributed(orderId, contributor, amount, total);
        if (completed) emit FundingCompleted(orderId);
    }

    function withdrawContribution(uint256 orderId) external nonReentrant {
        Order storage order = _orders[orderId];
        if (order.status == OrderStatus.None) revert UnknownOrder(orderId);
        if (!order.isGroup) revert NotGroup();
        if (order.status != OrderStatus.Funding && order.status != OrderStatus.Open) {
            revert InvalidStatus(orderId, order.status);
        }
        address contributor = _msgSender();
        uint128 amount = _contributions[orderId][contributor];
        if (amount == 0) revert NotContributor(contributor);

        address[] storage list = _contributors[orderId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == contributor) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
        delete _contributions[orderId][contributor];
        _groups[orderId].totalContributed -= amount;
        order.deposited -= amount;
        if (order.status == OrderStatus.Open) order.status = OrderStatus.Funding;

        _payout(order.token, contributor, amount);
        emit ContributionWithdrawn(orderId, contributor, amount);
    }

    function refundFunding(uint256 orderId) external nonReentrant {
        Order storage order = _requireStatus(orderId, OrderStatus.Funding);
        GroupInfo storage info = _groups[orderId];
        if (block.timestamp <= info.fundingDeadline) revert FundingNotExpired(info.fundingDeadline);
        uint128 total = info.totalContributed;
        if (total == 0) {
            order.status = OrderStatus.Cancelled;
            emit OrderCancelled(orderId, _msgSender(), uint8(CancelReason.Expired), 0, 0, 0);
            return;
        }
        _finishCancel(orderId, order, _msgSender(), CancelReason.Expired, address(0), 0, 0);
        emit FundingRefunded(orderId, total);
    }

    function proposeProvider(uint256 orderId, address payee) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Open);
        if (!order.isGroup) revert NotGroup();
        address caller = _msgSender();
        if (caller != order.payer) revert NotPayer(caller);
        if (payee == address(0) || payee == order.payer) revert PayeeIsPayer();
        if (_contributions[orderId][payee] > 0) revert ProviderIsContributor(payee);

        GroupInfo storage info = _groups[orderId];
        info.proposedPayee = payee;
        info.proposedAt = uint40(block.timestamp);
        info.proposalEpoch += 1;
        info.vetoMoney = 0;
        info.vetoCount = 0;
        emit ProviderProposed(orderId, payee, uint40(block.timestamp + registry.get(ParameterKeys.GROUP_VETO_WINDOW)));
    }

    function vetoProvider(uint256 orderId) external {
        Order storage order = _requireStatus(orderId, OrderStatus.Open);
        if (!order.isGroup) revert NotGroup();
        GroupInfo storage info = _groups[orderId];
        if (info.proposedPayee == address(0)) revert NoProposal();
        uint40 readyAt = info.proposedAt + uint40(registry.get(ParameterKeys.GROUP_VETO_WINDOW));
        if (block.timestamp >= readyAt) revert VetoWindowClosed(readyAt);

        address voter = _msgSender();
        uint128 weight = _contributions[orderId][voter];
        if (weight == 0) revert NotContributor(voter);
        if (_vetoed[orderId][info.proposalEpoch][voter]) revert AlreadyVoted(voter);
        _vetoed[orderId][info.proposalEpoch][voter] = true;
        info.vetoMoney += weight;
        info.vetoCount += 1;
        emit ProviderVetoed(orderId, voter, info.vetoMoney, info.vetoCount);

        if (_thresholdReached(info.totalContributed, info.vetoMoney, info.vetoCount)) {
            info.proposedPayee = address(0);
            emit ProposalCleared(orderId);
        }
    }

    function supportCoordinator(uint256 orderId, address candidate) external {
        Order storage order = _orders[orderId];
        if (order.status == OrderStatus.None) revert UnknownOrder(orderId);
        if (!order.isGroup) revert NotGroup();
        if (order.status != OrderStatus.Open && order.status != OrderStatus.Agreed) {
            revert InvalidStatus(orderId, order.status);
        }
        if (candidate == address(0) || candidate == order.payer || candidate == order.payee) {
            revert InvalidCoordinator(candidate);
        }
        address voter = _msgSender();
        uint128 weight = _contributions[orderId][voter];
        if (weight == 0) revert NotContributor(voter);

        GroupInfo storage info = _groups[orderId];
        uint32 epoch = info.coordinatorEpoch;
        address previous = _coordinatorVote[orderId][epoch][voter];
        if (previous == candidate) revert AlreadyVoted(voter);
        if (previous != address(0)) _coordinatorWeight[orderId][epoch][previous] -= weight;
        _coordinatorVote[orderId][epoch][voter] = candidate;
        uint128 support = _coordinatorWeight[orderId][epoch][candidate] + weight;
        _coordinatorWeight[orderId][epoch][candidate] = support;
        emit CoordinatorSupported(orderId, voter, candidate);

        if (uint256(support) * 2 > info.totalContributed) {
            address old = order.payer;
            order.payer = candidate;
            info.coordinatorEpoch = epoch + 1;
            emit CoordinatorChanged(orderId, old, candidate);
        }
    }

    function getGroup(uint256 orderId) external view returns (GroupInfo memory) {
        return _groups[orderId];
    }

    function contributorsOf(uint256 orderId) external view returns (address[] memory) {
        return _contributors[orderId];
    }

    function contributionOf(uint256 orderId, address account) external view returns (uint128) {
        return _contributions[orderId][account];
    }
}
