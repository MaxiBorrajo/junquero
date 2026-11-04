// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IParameterRegistry} from "./interfaces/IParameterRegistry.sol";
import {IReputation, Role, Stats} from "./interfaces/IReputation.sol";
import {ParameterKeys} from "./libraries/ParameterKeys.sol";

contract Reputation is IReputation, AccessControl {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    uint8 internal constant SKIP_BELOW_MINIMUM = 1;
    uint8 internal constant SKIP_PAIR_CAP = 2;

    IParameterRegistry public immutable registry;

    mapping(address account => mapping(Role role => Stats)) private _stats;
    mapping(bytes32 pair => uint32) private _pairCounts;

    constructor(address admin, IParameterRegistry registry_) {
        if (admin == address(0) || address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function recordSettled(address payer, address payee, uint8 rating, bool automatic, bool disputed, bool qualifies)
        external
        onlyRole(RECORDER_ROLE)
    {
        if (!automatic && (rating == 0 || rating > 5)) revert InvalidRating(rating);
        if (!qualifies) {
            emit SettlementSkipped(payer, payee, SKIP_BELOW_MINIMUM);
            return;
        }
        bytes32 key = _pairKey(payer, payee);
        if (_pairCounts[key] >= registry.get(ParameterKeys.REPUTATION_PAIR_CAP)) {
            emit SettlementSkipped(payer, payee, SKIP_PAIR_CAP);
            return;
        }
        _pairCounts[key] += 1;

        Stats storage provider = _stats[payee][Role.Provider];
        Stats storage requester = _stats[payer][Role.Requester];
        provider.closed += 1;
        requester.closed += 1;
        if (!disputed) {
            provider.closedClean += 1;
            requester.closedClean += 1;
        }
        if (!automatic) {
            provider.ratingSum += rating;
            provider.ratingCount += 1;
        }
        emit SettlementRecorded(payer, payee, rating, automatic, disputed);
    }

    function recordCash(address payer, address payee, uint8 rating) external onlyRole(RECORDER_ROLE) {
        if (rating == 0 || rating > 5) revert InvalidRating(rating);
        _stats[payee][Role.Provider].cashClosed += 1;
        _stats[payer][Role.Requester].cashClosed += 1;
        emit CashRecorded(payer, payee, rating);
    }

    function recordFailure(address account, Role role) external onlyRole(RECORDER_ROLE) {
        _stats[account][role].failures += 1;
        emit FailureRecorded(account, role);
    }

    function recordDispute(address account, Role role, bool lost) external onlyRole(RECORDER_ROLE) {
        Stats storage stats_ = _stats[account][role];
        stats_.disputes += 1;
        if (lost) stats_.disputesLost += 1;
        emit DisputeRecorded(account, role, lost);
    }

    function stats(address account, Role role) external view returns (Stats memory) {
        return _stats[account][role];
    }

    function closedWithoutDispute(address account) external view returns (uint32) {
        return _stats[account][Role.Provider].closedClean;
    }

    function pairCount(address a, address b) external view returns (uint32) {
        return _pairCounts[_pairKey(a, b)];
    }

    function _pairKey(address a, address b) private pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }
}
