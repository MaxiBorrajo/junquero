// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract TestUSDC is ERC20Permit {
    uint256 public constant MAX_MINT = 100_000 * 1e6;

    error MintLimitExceeded(uint256 amount);

    constructor() ERC20("USDC", "USDC") ERC20Permit("USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (amount > MAX_MINT) revert MintLimitExceeded(amount);
        _mint(to, amount);
    }
}
