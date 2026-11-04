// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockBlockableToken is ERC20 {
    error Blocked(address account);

    mapping(address account => bool) public blocked;
    bool public silent;

    constructor() ERC20("Blockable", "BLK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function setSilent(bool value) external {
        silent = value;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (blocked[to]) {
            if (silent) return false;
            revert Blocked(to);
        }
        return super.transfer(to, amount);
    }
}
