// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";

contract Credentials is ERC721, AccessControl, IERC5192 {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    uint8 public constant MAX_LEVEL = 2;

    mapping(address account => uint8) private _levels;

    event CredentialIssued(address indexed account, uint8 level);
    event CredentialRevoked(address indexed account);

    error ZeroAddress();
    error InvalidLevel(uint8 level);
    error NoCredential(address account);
    error Soulbound();

    constructor(address admin) ERC721("Junquero Credential", "JQC") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
    }

    function issue(address account, uint8 level) external onlyRole(ISSUER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (level > MAX_LEVEL) revert InvalidLevel(level);
        uint256 tokenId = tokenIdOf(account);
        if (_ownerOf(tokenId) == address(0)) {
            _mint(account, tokenId);
            emit Locked(tokenId);
        }
        _levels[account] = level;
        emit CredentialIssued(account, level);
    }

    function revoke(address account) external onlyRole(ISSUER_ROLE) {
        uint256 tokenId = tokenIdOf(account);
        if (_ownerOf(tokenId) == address(0)) revert NoCredential(account);
        delete _levels[account];
        _burn(tokenId);
        emit CredentialRevoked(account);
    }

    function has(address account) external view returns (bool) {
        return _ownerOf(tokenIdOf(account)) != address(0);
    }

    function levelOf(address account) external view returns (uint8) {
        if (_ownerOf(tokenIdOf(account)) == address(0)) revert NoCredential(account);
        return _levels[account];
    }

    function tokenIdOf(address account) public pure returns (uint256) {
        return uint256(uint160(account));
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
