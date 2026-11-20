// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title NFT Proxy Voucher - ERC-1155 with on-chain coin balance for secure redemption
/// @notice Minted on cashout, redeemable for USDC at 100 coins = 1 USDC.
/// @dev Hardened 2026-10 (docs/CONTRACT_HARDENING_2026-10.md):
///      C-1  MINTER/PAUSER grants go through a 24h cancellable queue; admin handover uses
///           AccessControlDefaultAdminRules with a >=48h delay floor; admin can never hold MINTER.
///      C-2  rolling (leaky-bucket) daily mint cap + solvency invariant: a minter can only ever
///           mint against USDC that is not already owed to voucher holders.
///      H-2  sessionId is single-use on-chain (idempotent mint).
///      M-1  outstandingCoins liability tracking; emergency withdrawal limited to free liquidity.
///      M-2  guardian freeze / quarantine / void for incident response.
contract NFTProxyVoucher is ERC1155, AccessControlDefaultAdminRules, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    /// @dev PAUSER_ROLE doubles as the incident-response guardian (freeze / quarantine / void / veto).
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_COIN_BALANCE = 100_000;
    uint256 public constant MIN_COIN_BALANCE = 100;
    uint256 public constant COINS_PER_USDC = 100;
    /// @dev 100 coins = 1 USDC (6 dp) => 10_000 raw USDC units per coin. Exact math, no truncation.
    uint256 public constant USDC_UNITS_PER_COIN = 10_000;

    uint256 public constant EMERGENCY_WITHDRAWAL_DELAY = 24 hours;
    uint256 public constant ROLE_GRANT_DELAY = 24 hours;
    uint256 public constant MINT_CAP_INCREASE_DELAY = 24 hours;
    /// @dev Leaky-bucket window: the full daily cap refills linearly over this period.
    uint256 public constant MINT_WINDOW = 24 hours;
    /// @dev A token must have been explicitly frozen this long before it can be voided, giving the
    ///      admin Safe time to unfreeze tokens frozen by a mistaken or compromised guardian.
    uint256 public constant VOID_DELAY = 24 hours;
    uint48 public constant MIN_DEFAULT_ADMIN_DELAY = 48 hours;

    uint8 private constant FLAG_FROZEN = 1;

    IERC20 public immutable usdcToken;

    /// @dev Global hot state packed into one slot (read+written once per mint). 216 bits.
    struct Accounting {
        uint48 nextTokenId;
        uint64 outstandingCoins;
        uint64 bucketUsedCoins;
        uint40 bucketUpdatedAt;
    }
    Accounting private _acct;

    /// @dev Config + quarantine range [quarantineFromId, quarantineToId). Empty when from == to.
    struct Config {
        uint64 dailyMintCapCoins;
        uint48 quarantineFromId;
        uint48 quarantineToId;
        uint40 quarantineSince;
    }
    Config private _cfg;

    /// @dev Per-token state packed into one slot. coinBalance/mintedTimestamp getters preserved.
    struct VoucherData {
        uint32 coins;
        uint40 mintedAt;
        uint40 frozenAt;
        uint8 flags;
    }
    mapping(uint256 => VoucherData) private _vouchers;
    mapping(uint256 => bytes32) public gameType;
    /// @dev sessionId => tokenId + 1 (0 = unused). Never cleared: a session can mint at most once, ever.
    mapping(bytes32 => uint256) private _sessionTokenIdPlusOne;

    struct PendingWithdrawal {
        uint256 amount;
        address to;
        uint256 unlockTime;
        bool exists;
    }
    PendingWithdrawal public pendingWithdrawal;

    struct PendingRoleGrant {
        uint48 eta;
        address proposer;
    }
    mapping(bytes32 => PendingRoleGrant) private _pendingRoleGrants;

    struct PendingCapIncrease {
        uint64 newCap;
        uint48 eta;
    }
    PendingCapIncrease public pendingDailyMintCap;

    event VoucherMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 coinAmount,
        bytes32 indexed gameType,
        bytes32 sessionId
    );
    event VoucherRedeemed(uint256 indexed tokenId, address indexed redeemer, uint256 usdcAmount);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event EmergencyWithdrawalInitiated(address indexed to, uint256 amount, uint256 unlockTime);
    event EmergencyWithdrawalCancelled(address indexed to, uint256 amount);
    event EmergencyWithdrawalExecuted(address indexed to, uint256 amount);
    event PurchaseCommitted(address indexed user, uint256 coinsAdded, bytes32 receiptHash, uint256 timestamp);

    event RoleGrantProposed(bytes32 indexed role, address indexed account, address indexed proposer, uint256 eta);
    event RoleGrantCancelled(bytes32 indexed role, address indexed account, address indexed canceller);
    event RoleGrantExecuted(bytes32 indexed role, address indexed account);
    event DailyMintCapIncreaseProposed(uint256 newCap, uint256 eta);
    event DailyMintCapIncreaseCancelled(uint256 newCap);
    event DailyMintCapChanged(uint256 oldCap, uint256 newCap);
    event TokenFrozen(uint256 indexed tokenId, address indexed guardian);
    event TokenUnfrozen(uint256 indexed tokenId);
    event QuarantineSet(uint256 fromTokenId, uint256 toTokenIdExclusive);
    event QuarantineLifted(uint256 fromTokenId, uint256 toTokenIdExclusive);
    event VoucherVoided(uint256 indexed tokenId, address indexed holder, uint256 coins);

    error RoleGrantRequiresTimelock(bytes32 role);
    error RoleNotTimelocked(bytes32 role);
    error RoleGrantAlreadyPending();
    error NoPendingRoleGrant();
    error RoleGrantNotReady(uint256 eta);
    error NotProposer();
    error AlreadyHasRole();
    error AdminCannotBeMinter();
    error AdminDelayTooShort(uint48 minimum);
    error NoPendingCapIncrease();
    error CapIncreaseNotReady(uint256 eta);
    error CapTooLarge();
    error TokenIsFrozen(uint256 tokenId);
    error TokenNotFrozen(uint256 tokenId);
    error InvalidToken(uint256 tokenId);
    error VoidTooEarly(uint256 unlockTime);
    error InvalidQuarantineRange();
    error NotHolder();

    /// @param _usdcToken          USDC (6 dp)
    /// @param initialAdmin        DEFAULT_ADMIN (production: Gnosis Safe). Deployer never needs a role.
    /// @param _dailyMintCapCoins  rolling 24h mint budget in coins (> 0)
    /// @param initialMinter       optional (zero = none); granted at deploy, all later grants are timelocked
    /// @param initialPauser       optional (zero = none); guardian
    constructor(
        address _usdcToken,
        address initialAdmin,
        uint256 _dailyMintCapCoins,
        address initialMinter,
        address initialPauser
    )
        ERC1155("https://api.nftproxygamble.com/metadata/{id}.json")
        AccessControlDefaultAdminRules(MIN_DEFAULT_ADMIN_DELAY, initialAdmin)
    {
        require(_usdcToken != address(0), "USDC address required");
        require(_dailyMintCapCoins > 0, "Zero mint cap");
        if (_dailyMintCapCoins > type(uint64).max) revert CapTooLarge();
        usdcToken = IERC20(_usdcToken);
        _cfg.dailyMintCapCoins = uint64(_dailyMintCapCoins);
        // Non-zero from deploy so the first mint pays a warm 5k SSTORE, not 20k.
        _acct.bucketUpdatedAt = uint40(block.timestamp);
        if (initialMinter != address(0)) _grantRole(MINTER_ROLE, initialMinter);
        if (initialPauser != address(0)) _grantRole(PAUSER_ROLE, initialPauser);
    }

    // ------------------------------------------------------------------
    // Mint / redeem
    // ------------------------------------------------------------------

    /// @param sessionId  Backend session id as bytes32. Single-use: a retry with the same id reverts
    ///                   "Session id already used" (look up tokenIdForSession for the original).
    ///                   Use keccak256(utf8(sessionUuid)) — encodeBytes32String truncates/rejects >31 bytes.
    function mint(
        address to,
        uint256 coinAmount,
        bytes32 _gameType,
        bytes32 sessionId
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256 tokenId) {
        require(coinAmount >= MIN_COIN_BALANCE, "Below min coin balance");
        require(coinAmount <= MAX_COIN_BALANCE, "Above max coin balance");
        require(_gameType != bytes32(0), "Invalid game type");
        require(sessionId != bytes32(0), "Invalid session id");
        require(_sessionTokenIdPlusOne[sessionId] == 0, "Session id already used");

        Accounting memory a = _acct;
        uint256 used = _bucketLevel(a, _cfg.dailyMintCapCoins) + coinAmount;
        require(used <= _cfg.dailyMintCapCoins, "Daily mint cap exceeded");

        uint256 newOutstanding = uint256(a.outstandingCoins) + coinAmount;
        require(
            usdcToken.balanceOf(address(this)) >= newOutstanding * USDC_UNITS_PER_COIN,
            "Insufficient backing"
        );

        tokenId = a.nextTokenId;
        _acct = Accounting({
            nextTokenId: uint48(tokenId + 1),
            outstandingCoins: uint64(newOutstanding),
            bucketUsedCoins: uint64(used),
            bucketUpdatedAt: uint40(block.timestamp)
        });
        _vouchers[tokenId] = VoucherData({
            coins: uint32(coinAmount),
            mintedAt: uint40(block.timestamp),
            frozenAt: 0,
            flags: 0
        });
        gameType[tokenId] = _gameType;
        _sessionTokenIdPlusOne[sessionId] = tokenId + 1;

        _mint(to, tokenId, 1, "");

        emit VoucherMinted(tokenId, to, coinAmount, _gameType, sessionId);
    }

    /// @notice Redeem voucher for USDC. Burns NFT, sends coins * 1e4 raw USDC units.
    function redeem(uint256 tokenId) external nonReentrant whenNotPaused {
        require(balanceOf(msg.sender, tokenId) == 1, "Not owner or already redeemed");
        VoucherData memory d = _vouchers[tokenId];
        uint256 coins = d.coins;
        require(coins > 0, "Invalid voucher");
        if (_isFrozen(tokenId, d.flags)) revert TokenIsFrozen(tokenId);

        uint256 usdcAmount = coins * USDC_UNITS_PER_COIN;
        require(usdcToken.balanceOf(address(this)) >= usdcAmount, "Insufficient USDC liquidity");

        _burn(msg.sender, tokenId, 1);
        delete _vouchers[tokenId];
        delete gameType[tokenId];
        _acct.outstandingCoins -= uint64(coins);

        usdcToken.safeTransfer(msg.sender, usdcAmount);

        emit VoucherRedeemed(tokenId, msg.sender, usdcAmount);
    }

    /// @notice Record an IAP purchase commitment on-chain for audit trail (event only).
    function commitPurchase(address user, uint256 coinsAdded, bytes32 receiptHash) external onlyRole(MINTER_ROLE) {
        require(user != address(0), "Zero user address");
        require(coinsAdded > 0, "Zero coins");
        require(receiptHash != bytes32(0), "Empty receipt hash");
        emit PurchaseCommitted(user, coinsAdded, receiptHash, block.timestamp);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function coinBalance(uint256 tokenId) external view returns (uint256) {
        return _vouchers[tokenId].coins;
    }

    function mintedTimestamp(uint256 tokenId) external view returns (uint256) {
        return _vouchers[tokenId].mintedAt;
    }

    function nextTokenId() external view returns (uint256) {
        return _acct.nextTokenId;
    }

    function outstandingCoins() public view returns (uint256) {
        return _acct.outstandingCoins;
    }

    /// @notice USDC (raw units) owed to holders of all live vouchers.
    function totalLiabilitiesUsdc() public view returns (uint256) {
        return uint256(_acct.outstandingCoins) * USDC_UNITS_PER_COIN;
    }

    /// @notice USDC (raw units) not owed to anyone — the only amount mint or emergency-withdraw can consume.
    function freeLiquidity() public view returns (uint256) {
        uint256 bal = usdcToken.balanceOf(address(this));
        uint256 liab = totalLiabilitiesUsdc();
        return bal > liab ? bal - liab : 0;
    }

    function dailyMintCapCoins() external view returns (uint256) {
        return _cfg.dailyMintCapCoins;
    }

    /// @notice Coins mintable right now under the rolling cap (ignores backing).
    function mintBudgetAvailable() external view returns (uint256) {
        uint256 cap = _cfg.dailyMintCapCoins;
        uint256 level = _bucketLevel(_acct, cap);
        return level >= cap ? 0 : cap - level;
    }

    function usedSessionId(bytes32 sessionId) external view returns (bool) {
        return _sessionTokenIdPlusOne[sessionId] != 0;
    }

    /// @dev Reverts for unused session ids so tokenId 0 is unambiguous.
    function tokenIdForSession(bytes32 sessionId) external view returns (uint256) {
        uint256 v = _sessionTokenIdPlusOne[sessionId];
        require(v != 0, "Unknown session id");
        return v - 1;
    }

    function isFrozen(uint256 tokenId) public view returns (bool) {
        return _isFrozen(tokenId, _vouchers[tokenId].flags);
    }

    function quarantineRange() external view returns (uint256 fromTokenId, uint256 toTokenIdExclusive, uint256 since) {
        Config memory c = _cfg;
        return (c.quarantineFromId, c.quarantineToId, c.quarantineSince);
    }

    function pendingRoleGrant(bytes32 role, address account) external view returns (uint256 eta, address proposer) {
        PendingRoleGrant memory p = _pendingRoleGrants[_roleGrantKey(role, account)];
        return (p.eta, p.proposer);
    }

    // ------------------------------------------------------------------
    // Roles (C-1)
    // ------------------------------------------------------------------

    /// @dev MINTER/PAUSER can only be granted via propose -> 24h -> execute.
    ///      DEFAULT_ADMIN falls through to DefaultAdminRules (which reverts; use the 2-step transfer).
    function grantRole(bytes32 role, address account) public override {
        if (_isTimelockedRole(role)) revert RoleGrantRequiresTimelock(role);
        super.grantRole(role, account);
    }

    function proposeRoleGrant(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_isTimelockedRole(role)) revert RoleNotTimelocked(role);
        require(account != address(0), "Zero account");
        if (hasRole(role, account)) revert AlreadyHasRole();
        if (role == MINTER_ROLE && account == defaultAdmin()) revert AdminCannotBeMinter();
        bytes32 key = _roleGrantKey(role, account);
        if (_pendingRoleGrants[key].eta != 0) revert RoleGrantAlreadyPending();
        uint256 eta = block.timestamp + ROLE_GRANT_DELAY;
        _pendingRoleGrants[key] = PendingRoleGrant({eta: uint48(eta), proposer: msg.sender});
        emit RoleGrantProposed(role, account, msg.sender, eta);
    }

    /// @dev Must be executed by the same admin that proposed it: an admin handover implicitly
    ///      invalidates the previous admin's queued grants.
    function executeRoleGrant(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 key = _roleGrantKey(role, account);
        PendingRoleGrant memory p = _pendingRoleGrants[key];
        if (p.eta == 0) revert NoPendingRoleGrant();
        if (p.proposer != msg.sender) revert NotProposer();
        if (block.timestamp < p.eta) revert RoleGrantNotReady(p.eta);
        delete _pendingRoleGrants[key];
        _grantRole(role, account);
        emit RoleGrantExecuted(role, account);
    }

    /// @notice Admin or guardian (veto) can cancel a queued grant.
    function cancelRoleGrant(bytes32 role, address account) external {
        _checkAdminOrGuardian();
        bytes32 key = _roleGrantKey(role, account);
        if (_pendingRoleGrants[key].eta == 0) revert NoPendingRoleGrant();
        delete _pendingRoleGrants[key];
        emit RoleGrantCancelled(role, account, msg.sender);
    }

    /// @dev Invariant: the default admin never holds MINTER_ROLE (covers constructor, executeRoleGrant
    ///      and acceptDefaultAdminTransfer).
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == MINTER_ROLE && account == defaultAdmin()) revert AdminCannotBeMinter();
        if (role == DEFAULT_ADMIN_ROLE && hasRole(MINTER_ROLE, account)) revert AdminCannotBeMinter();
        return super._grantRole(role, account);
    }

    /// @dev Enforce a 48h floor on the admin-transfer delay.
    function _changeDefaultAdminDelay(uint48 newDelay) internal override {
        if (newDelay < MIN_DEFAULT_ADMIN_DELAY) revert AdminDelayTooShort(MIN_DEFAULT_ADMIN_DELAY);
        super._changeDefaultAdminDelay(newDelay);
    }

    // ------------------------------------------------------------------
    // Mint cap (C-2)
    // ------------------------------------------------------------------

    /// @notice Decreases (incl. to 0 = mint kill-switch) apply instantly and cancel any pending increase.
    ///         Increases are queued for MINT_CAP_INCREASE_DELAY.
    function setDailyMintCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap > type(uint64).max) revert CapTooLarge();
        if (newCap <= _cfg.dailyMintCapCoins) {
            if (pendingDailyMintCap.eta != 0) {
                emit DailyMintCapIncreaseCancelled(pendingDailyMintCap.newCap);
                delete pendingDailyMintCap;
            }
            _applyCap(newCap);
        } else {
            uint256 eta = block.timestamp + MINT_CAP_INCREASE_DELAY;
            pendingDailyMintCap = PendingCapIncrease({newCap: uint64(newCap), eta: uint48(eta)});
            emit DailyMintCapIncreaseProposed(newCap, eta);
        }
    }

    function executeDailyMintCapIncrease() external onlyRole(DEFAULT_ADMIN_ROLE) {
        PendingCapIncrease memory p = pendingDailyMintCap;
        if (p.eta == 0) revert NoPendingCapIncrease();
        if (block.timestamp < p.eta) revert CapIncreaseNotReady(p.eta);
        delete pendingDailyMintCap;
        _applyCap(p.newCap);
    }

    function cancelDailyMintCapIncrease() external {
        _checkAdminOrGuardian();
        PendingCapIncrease memory p = pendingDailyMintCap;
        if (p.eta == 0) revert NoPendingCapIncrease();
        delete pendingDailyMintCap;
        emit DailyMintCapIncreaseCancelled(p.newCap);
    }

    // ------------------------------------------------------------------
    // Pause + incident response (M-2). PAUSER_ROLE = guardian.
    // ------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function freezeToken(uint256 tokenId) external onlyRole(PAUSER_ROLE) whenPaused {
        _freeze(tokenId);
    }

    function freezeTokens(uint256[] calldata tokenIds) external onlyRole(PAUSER_ROLE) whenPaused {
        for (uint256 i; i < tokenIds.length; ++i) _freeze(tokenIds[i]);
    }

    /// @notice Admin (Safe) reverses a freeze — the check on a mistaken/compromised guardian.
    function unfreezeToken(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        VoucherData storage d = _vouchers[tokenId];
        if (d.flags & FLAG_FROZEN == 0) revert TokenNotFrozen(tokenId);
        d.flags &= ~FLAG_FROZEN;
        d.frozenAt = 0;
        emit TokenUnfrozen(tokenId);
    }

    /// @notice Freeze every token in [fromTokenId, nextTokenId) in one tx. Tokens minted after the
    ///         call are unaffected. Use to stop attacker vouchers moving before reconciliation, then
    ///         freezeTokens() the confirmed-bad ids and liftQuarantine().
    function quarantine(uint256 fromTokenId) external onlyRole(PAUSER_ROLE) whenPaused {
        uint256 to = _acct.nextTokenId;
        if (fromTokenId >= to) revert InvalidQuarantineRange();
        _cfg.quarantineFromId = uint48(fromTokenId);
        _cfg.quarantineToId = uint48(to);
        _cfg.quarantineSince = uint40(block.timestamp);
        emit QuarantineSet(fromTokenId, to);
    }

    function liftQuarantine() external onlyRole(DEFAULT_ADMIN_ROLE) {
        Config memory c = _cfg;
        _cfg.quarantineFromId = 0;
        _cfg.quarantineToId = 0;
        _cfg.quarantineSince = 0;
        emit QuarantineLifted(c.quarantineFromId, c.quarantineToId);
    }

    /// @notice Burn a token that has been explicitly frozen for >= VOID_DELAY and release its liability.
    /// @dev Pause is not required: the token is already inert (frozen), and requiring pause would halt
    ///      honest redemptions for the whole VOID_DELAY. `holder` is needed because ERC-1155 has no ownerOf.
    function voidToken(address holder, uint256 tokenId) external onlyRole(PAUSER_ROLE) {
        VoucherData memory d = _vouchers[tokenId];
        if (d.flags & FLAG_FROZEN == 0) revert TokenNotFrozen(tokenId);
        uint256 unlock = uint256(d.frozenAt) + VOID_DELAY;
        if (block.timestamp < unlock) revert VoidTooEarly(unlock);
        if (balanceOf(holder, tokenId) != 1) revert NotHolder();

        _burn(holder, tokenId, 1);
        delete _vouchers[tokenId];
        delete gameType[tokenId];
        _acct.outstandingCoins -= uint64(d.coins);
        emit VoucherVoided(tokenId, holder, d.coins);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setURI(string memory newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    /// @notice Step 1/2 — queue an emergency USDC withdrawal. Limited to freeLiquidity(): USDC owed to
    ///         voucher holders can never be withdrawn.
    function initiateEmergencyWithdrawal(uint256 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "Zero recipient");
        require(amount > 0, "Zero amount");
        require(!pendingWithdrawal.exists, "Withdrawal already pending");
        require(amount <= freeLiquidity(), "Exceeds free liquidity");

        uint256 unlockTime = block.timestamp + EMERGENCY_WITHDRAWAL_DELAY;
        pendingWithdrawal = PendingWithdrawal({amount: amount, to: to, unlockTime: unlockTime, exists: true});
        emit EmergencyWithdrawalInitiated(to, amount, unlockTime);
    }

    /// @notice Step 2/2 — re-checks free liquidity (vouchers minted during the delay are protected).
    function executeEmergencyWithdrawal() external onlyRole(DEFAULT_ADMIN_ROLE) {
        PendingWithdrawal memory p = pendingWithdrawal;
        require(p.exists, "No pending withdrawal");
        require(block.timestamp >= p.unlockTime, "Timelock not elapsed");
        require(p.amount <= freeLiquidity(), "Exceeds free liquidity");

        delete pendingWithdrawal;

        usdcToken.safeTransfer(p.to, p.amount);
        emit EmergencyWithdrawal(p.to, p.amount);
        emit EmergencyWithdrawalExecuted(p.to, p.amount);
    }

    /// @notice Admin or guardian (veto) can cancel during the delay window.
    function cancelEmergencyWithdrawal() external {
        _checkAdminOrGuardian();
        PendingWithdrawal memory p = pendingWithdrawal;
        require(p.exists, "No pending withdrawal");
        delete pendingWithdrawal;
        emit EmergencyWithdrawalCancelled(p.to, p.amount);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return super.uri(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControlDefaultAdminRules)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /// @dev Frozen/quarantined tokens cannot be transferred. Mints (from == 0) and burns (to == 0:
    ///      redeem checks frozen itself; void requires frozen) pass through. Transfers of healthy tokens
    ///      remain allowed while paused so users keep custody.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) {
            for (uint256 i; i < ids.length; ++i) {
                if (isFrozen(ids[i])) revert TokenIsFrozen(ids[i]);
            }
        }
        super._update(from, to, ids, values);
    }

    function _isFrozen(uint256 tokenId, uint8 flags) private view returns (bool) {
        if (flags & FLAG_FROZEN != 0) return true;
        Config memory c = _cfg;
        return tokenId >= c.quarantineFromId && tokenId < c.quarantineToId;
    }

    function _freeze(uint256 tokenId) private {
        VoucherData storage d = _vouchers[tokenId];
        if (d.coins == 0) revert InvalidToken(tokenId);
        if (d.flags & FLAG_FROZEN != 0) return;
        d.flags |= FLAG_FROZEN;
        d.frozenAt = uint40(block.timestamp);
        emit TokenFrozen(tokenId, msg.sender);
    }

    /// @dev Leaky bucket: level drains linearly at cap / MINT_WINDOW. Burst <= cap; any 24h span <= 2 * cap.
    function _bucketLevel(Accounting memory a, uint256 cap) private view returns (uint256) {
        uint256 drained = (block.timestamp - a.bucketUpdatedAt) * cap / MINT_WINDOW;
        return a.bucketUsedCoins > drained ? a.bucketUsedCoins - drained : 0;
    }

    /// @dev Settle the bucket at the old rate before changing it.
    function _applyCap(uint256 newCap) private {
        Accounting memory a = _acct;
        uint256 oldCap = _cfg.dailyMintCapCoins;
        _acct.bucketUsedCoins = uint64(_bucketLevel(a, oldCap));
        _acct.bucketUpdatedAt = uint40(block.timestamp);
        _cfg.dailyMintCapCoins = uint64(newCap);
        emit DailyMintCapChanged(oldCap, newCap);
    }

    function _isTimelockedRole(bytes32 role) private pure returns (bool) {
        return role == MINTER_ROLE || role == PAUSER_ROLE;
    }

    function _roleGrantKey(bytes32 role, address account) private pure returns (bytes32) {
        return keccak256(abi.encode(role, account));
    }

    function _checkAdminOrGuardian() private view {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender) && !hasRole(PAUSER_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, DEFAULT_ADMIN_ROLE);
        }
    }
}
