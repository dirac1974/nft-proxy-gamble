// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IVoucherForReentrancyTest {
    function redeem(uint256 tokenId) external;
}

/// @notice Malicious ERC20 used to verify NFTProxyVoucher.redeem is protected by nonReentrant.
///         On any transfer originating from `target`, attempts to reenter target.redeem(reentrantTokenId).
contract ReentrantERC20 is ERC20 {
    address public target;
    uint256 public reentrantTokenId;
    bool public attackEnabled;

    constructor() ERC20("Reentrant USDC", "rUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(address _target, uint256 _tokenId) external {
        target = _target;
        reentrantTokenId = _tokenId;
        attackEnabled = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attackEnabled && from == target && target != address(0)) {
            // Trigger reentrancy. Voucher's nonReentrant should revert.
            IVoucherForReentrancyTest(target).redeem(reentrantTokenId);
        }
    }
}
