// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol"; // USDC

/// @title NFT Proxy Voucher - ERC-1155 with on-chain coin balance for secure redemption
/// @notice Used as proxy for in-game coin balances. Minted on cashout, redeemable 1:1 for USDC (100 coins = 1 USDC).
/// @dev Security: coinBalance stored on-chain (immutable). Metadata is for display only.
contract NFTProxyVoucher is ERC1155, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private _tokenIdCounter;
    IERC20 public immutable usdcToken; // Polygon USDC: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (mainnet) or test

    // On-chain immutable value (critical for security - not in metadata)
    mapping(uint256 => uint256) public coinBalance;
    mapping(uint256 => string) public gameType;
    mapping(uint256 => uint256) public mintedTimestamp;

    event VoucherMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 coinAmount,
        string gameType,
        uint256 sessionId
    );
    event VoucherRedeemed(
        uint256 indexed tokenId,
        address indexed redeemer,
        uint256 usdcAmount
    );

    constructor(address _usdcToken) ERC1155("https://api.nftproxygamble.com/metadata/{id}.json") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        usdcToken = IERC20(_usdcToken);
    }

    /// @notice Mint a new voucher (only backend minter). Sets immutable coinBalance.
    function mint(
        address to,
        uint256 coinAmount,
        string memory _gameType,
        uint256 sessionId
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        require(coinAmount > 0, "Coin amount must be > 0");
        uint256 tokenId = _tokenIdCounter++;

        coinBalance[tokenId] = coinAmount;
        gameType[tokenId] = _gameType;
        mintedTimestamp[tokenId] = block.timestamp;

        _mint(to, tokenId, 1, "");

        emit VoucherMinted(tokenId, to, coinAmount, _gameType, sessionId);
        return tokenId;
    }

    /// @notice Redeem voucher for USDC. Burns NFT, sends equivalent USDC (100 coins = 1 USDC).
    function redeem(uint256 tokenId) external nonReentrant whenNotPaused {
        require(balanceOf(msg.sender, tokenId) == 1, "Not owner or already redeemed");
        uint256 coins = coinBalance[tokenId];
        require(coins > 0, "Invalid voucher");

        uint256 usdcAmount = coins / 100; // 100 coins = 1 USDC (adjust if needed)
        require(usdcToken.balanceOf(address(this)) >= usdcAmount, "Insufficient USDC liquidity");

        // Burn first (prevents reentrancy issues)
        _burn(msg.sender, tokenId, 1);
        delete coinBalance[tokenId]; // Clear for safety

        // Transfer USDC
        require(usdcToken.transfer(msg.sender, usdcAmount), "USDC transfer failed");

        emit VoucherRedeemed(tokenId, msg.sender, usdcAmount);
    }

    /// @notice Update metadata URI (admin only, for future art updates)
    function setURI(string memory newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Override to use on-chain data if needed, but metadata service handles display
    function uri(uint256 tokenId) public view override returns (string memory) {
        return super.uri(tokenId);
    }

    // The following functions are overrides required by Solidity.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}