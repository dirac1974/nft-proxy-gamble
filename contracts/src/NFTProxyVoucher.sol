// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title NFT Proxy Voucher - ERC-1155 with on-chain coin balance for secure redemption
/// @notice Minted on cashout, redeemable for USDC at 100 coins = 1 USDC.
/// @dev coinBalance stored on-chain (immutable until redeem). gameType + sessionId stored as bytes32
///      per ADR-001 Phase 1 Implementation Notes. SafeERC20 used for USDC transfer.
contract NFTProxyVoucher is ERC1155, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_COIN_BALANCE = 100_000;
    uint256 public constant MIN_COIN_BALANCE = 100;
    uint256 public constant COINS_PER_USDC = 100;
    /// @dev 100 coins = 1 USDC (6 dp) => 10_000 raw USDC units per coin. Exact math, no truncation.
    uint256 public constant USDC_UNITS_PER_COIN = 10_000;

    uint256 private _tokenIdCounter;
    IERC20 public immutable usdcToken;

    mapping(uint256 => uint256) public coinBalance;
    mapping(uint256 => bytes32) public gameType;
    mapping(uint256 => uint256) public mintedTimestamp;

    event VoucherMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 coinAmount,
        bytes32 indexed gameType,
        bytes32 sessionId
    );
    event VoucherRedeemed(
        uint256 indexed tokenId,
        address indexed redeemer,
        uint256 usdcAmount
    );
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    /// @dev Emitted by commitPurchase — creates an immutable on-chain audit record for every IAP.
    event PurchaseCommitted(
        address indexed user,
        uint256 coinsAdded,
        bytes32 receiptHash,
        uint256 timestamp
    );

    constructor(address _usdcToken)
        ERC1155("https://api.nftproxygamble.com/metadata/{id}.json")
    {
        require(_usdcToken != address(0), "USDC address required");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        usdcToken = IERC20(_usdcToken);
    }

    /// @notice Mint a new voucher (only backend minter). Sets immutable coinBalance.
    /// @param to            User's self-custodial wallet
    /// @param coinAmount    Coins to encode; must be > 0, <= MAX_COIN_BALANCE, multiple of COINS_PER_USDC
    /// @param _gameType     Canonical game id as bytes32 (e.g. ethers.encodeBytes32String("jacks-or-better-9-6"))
    /// @param sessionId     Backend session id as bytes32 (e.g. encodeBytes32String of session UUID)
    function mint(
        address to,
        uint256 coinAmount,
        bytes32 _gameType,
        bytes32 sessionId
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        require(coinAmount >= MIN_COIN_BALANCE, "Below min coin balance");
        require(coinAmount <= MAX_COIN_BALANCE, "Above max coin balance");
        require(_gameType != bytes32(0), "Invalid game type");
        require(sessionId != bytes32(0), "Invalid session id");

        uint256 tokenId = _tokenIdCounter++;

        coinBalance[tokenId] = coinAmount;
        gameType[tokenId] = _gameType;
        mintedTimestamp[tokenId] = block.timestamp;

        _mint(to, tokenId, 1, "");

        emit VoucherMinted(tokenId, to, coinAmount, _gameType, sessionId);
        return tokenId;
    }

    /// @notice Redeem voucher for USDC. Burns NFT, sends equivalent USDC (100 coins = 1 USDC).
    /// @dev Transfers are NOT gated by whenNotPaused — only mint and redeem are. Users can always
    ///      move their assets even during a regulatory pause.
    function redeem(uint256 tokenId) external nonReentrant whenNotPaused {
        require(balanceOf(msg.sender, tokenId) == 1, "Not owner or already redeemed");
        uint256 coins = coinBalance[tokenId];
        require(coins > 0, "Invalid voucher");

        uint256 usdcAmount = coins * USDC_UNITS_PER_COIN;
        require(
            usdcToken.balanceOf(address(this)) >= usdcAmount,
            "Insufficient USDC liquidity"
        );

        _burn(msg.sender, tokenId, 1);
        delete coinBalance[tokenId];

        usdcToken.safeTransfer(msg.sender, usdcAmount);

        emit VoucherRedeemed(tokenId, msg.sender, usdcAmount);
    }

    /// @notice Record an IAP purchase commitment on-chain for audit trail.
    /// @dev MINTER_ROLE only. Emits event only — no storage writes, so gas is minimal (~25k).
    ///      Called by backend after receipt is validated and coins are credited to DB.
    ///      receiptHash = keccak256/SHA-256 of the original receipt string (off-chain binding).
    function commitPurchase(
        address user,
        uint256 coinsAdded,
        bytes32 receiptHash
    ) external onlyRole(MINTER_ROLE) {
        require(user != address(0), "Zero user address");
        require(coinsAdded > 0, "Zero coins");
        require(receiptHash != bytes32(0), "Empty receipt hash");
        emit PurchaseCommitted(user, coinsAdded, receiptHash, block.timestamp);
    }

    /// @notice Update metadata URI (admin only).
    function setURI(string memory newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Admin-only emergency drain of USDC. Used for contract migration or regulator response.
    /// @dev Phase 5 will move admin to a Gnosis Safe and consider adding a timelock.
    function emergencyWithdrawUSDC(uint256 amount, address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(to != address(0), "Zero recipient");
        usdcToken.safeTransfer(to, amount);
        emit EmergencyWithdrawal(to, amount);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return super.uri(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
