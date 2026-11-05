// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Votes} from "@openzeppelin/contracts/governance/utils/Votes.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IParameterRegistry} from "./interfaces/IParameterRegistry.sol";
import {IReputation, Role, Stats} from "./interfaces/IReputation.sol";
import {ParameterKeys} from "./libraries/ParameterKeys.sol";
import {Credentials} from "./Credentials.sol";

contract VotingWeight is Votes, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IReputation public immutable reputation;
    Credentials public immutable credentials;
    IParameterRegistry public immutable registry;
    IERC20 public immutable depositToken;

    mapping(address account => uint256) private _units;
    mapping(address account => uint256) public deposits;

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Synced(address indexed account, uint256 weight);

    error ZeroAddress();
    error DelegationNotAllowed(address delegatee);
    error InsufficientDeposit(uint256 deposited, uint256 requested);
    error ZeroAmount();

    constructor(IReputation reputation_, Credentials credentials_, IParameterRegistry registry_, IERC20 depositToken_)
        EIP712("VotingWeight", "1")
    {
        if (
            address(reputation_) == address(0) || address(credentials_) == address(0)
                || address(registry_) == address(0) || address(depositToken_) == address(0)
        ) revert ZeroAddress();
        reputation = reputation_;
        credentials = credentials_;
        registry = registry_;
        depositToken = depositToken_;
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        depositToken.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
        sync(msg.sender);
    }

    function depositWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        try IERC20Permit(address(depositToken)).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        depositToken.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
        sync(msg.sender);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 deposited = deposits[msg.sender];
        if (amount > deposited) revert InsufficientDeposit(deposited, amount);
        deposits[msg.sender] = deposited - amount;
        depositToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
        sync(msg.sender);
    }

    function sync(address account) public {
        uint256 target = weightOf(account);
        uint256 current = _units[account];
        if (target > current) {
            _units[account] = target;
            _transferVotingUnits(address(0), account, target - current);
        } else if (target < current) {
            _units[account] = target;
            _transferVotingUnits(account, address(0), current - target);
        }
        if (target > 0 && delegates(account) == address(0)) _delegate(account, account);
        emit Synced(account, target);
    }

    function weightOf(address account) public view returns (uint256) {
        if (!credentials.has(account)) return 0;
        if (deposits[account] < registry.get(ParameterKeys.VOTE_DEPOSIT)) return 0;
        uint256 points = uint256(reputation.stats(account, Role.Provider).closedClean)
            + reputation.stats(account, Role.Requester).closedClean + reputation.stats(account, Role.Juror).closedClean;
        uint256 cap = registry.get(ParameterKeys.VOTE_WEIGHT_CAP);
        return points > cap ? cap : points;
    }

    function unitsOf(address account) external view returns (uint256) {
        return _units[account];
    }

    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    function _getVotingUnits(address account) internal view override returns (uint256) {
        return _units[account];
    }

    function _delegate(address account, address delegatee) internal override {
        if (delegatee != account) revert DelegationNotAllowed(delegatee);
        super._delegate(account, delegatee);
    }
}
