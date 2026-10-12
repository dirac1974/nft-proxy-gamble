import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const GAME = ethers.encodeBytes32String("slots");
const sess = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));
const usdc6 = (whole: string) => ethers.parseUnits(whole, 6);
const UNITS = 10_000n;

describe("NFTProxyVoucher — 2026-10 hardening", function () {
  let v: any;
  let vAddr: string;
  let usdc: any;
  let admin: HardhatEthersSigner;
  let minter: HardhatEthersSigner;
  let guardian: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;
  let safe2: HardhatEthersSigner;
  let MINTER: string;
  let PAUSER: string;
  let ADMIN: string;
  let n = 0;
  const next = () => sess(`s-${n++}`);

  const CAP = 300_000n; // coins / rolling 24h = 3,000 USDC

  async function deploy(cap: bigint = CAP, floatUsdc = "50000") {
    const Mock = await ethers.getContractFactory("MockERC20");
    usdc = await Mock.deploy("USD Coin", "USDC", 6);
    const V = await ethers.getContractFactory("NFTProxyVoucher");
    v = await V.deploy(await usdc.getAddress(), admin.address, cap, minter.address, guardian.address);
    vAddr = await v.getAddress();
    await usdc.mint(vAddr, usdc6(floatUsdc));
  }

  async function mintTo(to: string, coins: bigint | number, signer = minter): Promise<bigint> {
    const tx = await v.connect(signer).mint(to, coins, GAME, next());
    const r = await tx.wait();
    const ev = r.logs.map((l: any) => { try { return v.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "VoucherMinted");
    return ev.args.tokenId;
  }

  beforeEach(async function () {
    [admin, minter, guardian, user, attacker, safe2] = await ethers.getSigners();
    await deploy();
    MINTER = await v.MINTER_ROLE();
    PAUSER = await v.PAUSER_ROLE();
    ADMIN = await v.DEFAULT_ADMIN_ROLE();
  });

  describe("C-1 admin self-grant of MINTER (red-team PoC1)", function () {
    it("instant grantRole(MINTER|PAUSER) reverts for the admin", async function () {
      await expect(v.connect(admin).grantRole(MINTER, attacker.address))
        .to.be.revertedWithCustomError(v, "RoleGrantRequiresTimelock").withArgs(MINTER);
      await expect(v.connect(admin).grantRole(PAUSER, attacker.address))
        .to.be.revertedWithCustomError(v, "RoleGrantRequiresTimelock").withArgs(PAUSER);
      await expect(v.connect(admin).grantRole(ADMIN, attacker.address))
        .to.be.revertedWithCustomError(v, "AccessControlEnforcedDefaultAdminRules");
    });

    it("admin can never become minter (propose to self reverts, constructor rejects admin==minter)", async function () {
      await expect(v.connect(admin).proposeRoleGrant(MINTER, admin.address))
        .to.be.revertedWithCustomError(v, "AdminCannotBeMinter");
      const V = await ethers.getContractFactory("NFTProxyVoucher");
      await expect(V.deploy(await usdc.getAddress(), admin.address, CAP, admin.address, guardian.address))
        .to.be.revertedWithCustomError(v, "AdminCannotBeMinter");
    });

    it("PoC1 replay: admin-controlled minter cannot drain inside the old 24h window, nor touch user liabilities", async function () {
      const honest = await mintTo(user.address, 100_000); // 1,000 USDC owed to user
      await v.connect(admin).proposeRoleGrant(MINTER, attacker.address);
      await expect(v.connect(admin).executeRoleGrant(MINTER, attacker.address))
        .to.be.revertedWithCustomError(v, "RoleGrantNotReady");
      await expect(v.connect(attacker).mint(attacker.address, 100_000, GAME, next()))
        .to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      // Guardian vetoes during the window.
      await expect(v.connect(guardian).cancelRoleGrant(MINTER, attacker.address))
        .to.emit(v, "RoleGrantCancelled").withArgs(MINTER, attacker.address, guardian.address);
      await time.increase(DAY + 1);
      await expect(v.connect(admin).executeRoleGrant(MINTER, attacker.address))
        .to.be.revertedWithCustomError(v, "NoPendingRoleGrant");
      await v.connect(user).redeem(honest);
      expect(await usdc.balanceOf(user.address)).to.equal(usdc6("1000"));
    });
  });

  describe("C-2 compromised minter (red-team PoC1 loop)", function () {
    it("mint+redeem loop stops at the rolling cap; honest voucher stays fully redeemable", async function () {
      const honest = await mintTo(user.address, 100_000);
      // Attacker holds the minter key: CAP=300k coins, 100k already used by the honest mint.
      let drained = 0n;
      for (let i = 0; i < 2; i++) {
        const id = await mintTo(attacker.address, 100_000);
        await v.connect(attacker).redeem(id);
        drained += 100_000n * UNITS;
      }
      await expect(v.connect(minter).mint(attacker.address, 100, GAME, next()))
        .to.be.revertedWith("Daily mint cap exceeded");
      expect(await usdc.balanceOf(attacker.address)).to.equal(drained); // 2,000 USDC of 50,000
      expect(await v.outstandingCoins()).to.equal(100_000n);
      await v.connect(user).redeem(honest);
      expect(await usdc.balanceOf(user.address)).to.equal(usdc6("1000"));
    });

    it("with an oversized cap the minter is still bounded by free liquidity, never by user liabilities", async function () {
      await deploy(10_000_000n, "3000"); // 300,000 coins of float
      const honest = await mintTo(user.address, 100_000);
      for (let i = 0; i < 2; i++) {
        const id = await mintTo(attacker.address, 100_000);
        await v.connect(attacker).redeem(id);
      }
      await expect(v.connect(minter).mint(attacker.address, 100, GAME, next()))
        .to.be.revertedWith("Insufficient backing");
      expect(await v.freeLiquidity()).to.equal(0n);
      await v.connect(user).redeem(honest);
      expect(await usdc.balanceOf(user.address)).to.equal(usdc6("1000"));
    });
  });

  describe("rolling mint cap", function () {
    it("leaky bucket refills linearly: 0 after burst, ~half at 12h, full at 24h", async function () {
      await mintTo(user.address, 100_000);
      await mintTo(user.address, 100_000);
      await mintTo(user.address, 100_000);
      expect(await v.mintBudgetAvailable()).to.be.lt(100n); // drains ~3.5 coins/s between blocks
      await expect(v.connect(minter).mint(user.address, 100, GAME, next()))
        .to.be.revertedWith("Daily mint cap exceeded");
      await time.increase(12 * HOUR);
      const half = await v.mintBudgetAvailable();
      expect(half).to.be.closeTo(CAP / 2n, 100n);
      await mintTo(user.address, 100_000);
      await expect(v.connect(minter).mint(user.address, 100_000, GAME, next()))
        .to.be.revertedWith("Daily mint cap exceeded");
      await time.increase(DAY);
      expect(await v.mintBudgetAvailable()).to.equal(CAP);
    });

    it("decrease is instant (0 = kill switch); increase waits 24h; guardian can cancel; decrease cancels pending", async function () {
      await expect(v.connect(attacker).setDailyMintCap(1)).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await expect(v.connect(admin).setDailyMintCap(0)).to.emit(v, "DailyMintCapChanged").withArgs(CAP, 0);
      await expect(v.connect(minter).mint(user.address, 100, GAME, next())).to.be.revertedWith("Daily mint cap exceeded");

      await expect(v.connect(admin).setDailyMintCap(CAP * 2n)).to.emit(v, "DailyMintCapIncreaseProposed");
      expect(await v.dailyMintCapCoins()).to.equal(0n);
      await expect(v.connect(admin).executeDailyMintCapIncrease()).to.be.revertedWithCustomError(v, "CapIncreaseNotReady");
      await time.increase(DAY);
      await v.connect(admin).executeDailyMintCapIncrease();
      expect(await v.dailyMintCapCoins()).to.equal(CAP * 2n);

      await v.connect(admin).setDailyMintCap(CAP * 3n);
      await expect(v.connect(attacker).cancelDailyMintCapIncrease()).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await expect(v.connect(guardian).cancelDailyMintCapIncrease()).to.emit(v, "DailyMintCapIncreaseCancelled").withArgs(CAP * 3n);
      await expect(v.connect(admin).executeDailyMintCapIncrease()).to.be.revertedWithCustomError(v, "NoPendingCapIncrease");

      await v.connect(admin).setDailyMintCap(CAP * 3n);
      await expect(v.connect(admin).setDailyMintCap(CAP)).to.emit(v, "DailyMintCapIncreaseCancelled");
      expect((await v.pendingDailyMintCap()).eta).to.equal(0n);
      expect(await v.dailyMintCapCoins()).to.equal(CAP);
    });

    it("constructor rejects zero cap", async function () {
      const V = await ethers.getContractFactory("NFTProxyVoucher");
      await expect(V.deploy(await usdc.getAddress(), admin.address, 0, minter.address, guardian.address))
        .to.be.revertedWith("Zero mint cap");
    });
  });

  describe("solvency invariant (M-1)", function () {
    it("tracks outstandingCoins and refuses unbacked mints", async function () {
      await deploy(CAP, "1500"); // backs 150,000 coins
      const a = await mintTo(user.address, 100_000);
      expect(await v.outstandingCoins()).to.equal(100_000n);
      expect(await v.totalLiabilitiesUsdc()).to.equal(usdc6("1000"));
      expect(await v.freeLiquidity()).to.equal(usdc6("500"));
      await expect(v.connect(minter).mint(user.address, 50_001, GAME, next())).to.be.revertedWith("Insufficient backing");
      await mintTo(user.address, 50_000);
      expect(await v.freeLiquidity()).to.equal(0n);
      await v.connect(user).redeem(a);
      expect(await v.outstandingCoins()).to.equal(50_000n);
      expect(await usdc.balanceOf(vAddr)).to.equal(await v.totalLiabilitiesUsdc());
    });
  });

  describe("idempotent mint (H-2 / L-4)", function () {
    it("a reused sessionId reverts; lookup returns the original token", async function () {
      const sid = sess("8f14e45f-ceea-467a-9575-7a1b2c3d4e5f"); // full UUID, no truncation
      await v.connect(minter).mint(user.address, 500, GAME, sid);
      await expect(v.connect(minter).mint(user.address, 500, GAME, sid)).to.be.revertedWith("Session id already used");
      expect(await v.usedSessionId(sid)).to.equal(true);
      expect(await v.tokenIdForSession(sid)).to.equal(0n);
      expect(await v.usedSessionId(sess("other"))).to.equal(false);
      await expect(v.tokenIdForSession(sess("other"))).to.be.revertedWith("Unknown session id");
      // Session survives redeem: cannot be replayed after burn either.
      await v.connect(user).redeem(0);
      await expect(v.connect(minter).mint(user.address, 500, GAME, sid)).to.be.revertedWith("Session id already used");
    });

    it("a reverted mint does not consume the sessionId", async function () {
      const sid = sess("retry-me");
      await v.connect(admin).setDailyMintCap(0);
      await expect(v.connect(minter).mint(user.address, 500, GAME, sid)).to.be.revertedWith("Daily mint cap exceeded");
      expect(await v.usedSessionId(sid)).to.equal(false);
    });
  });

  describe("incident response (M-2)", function () {
    it("freeze requires pause + guardian; frozen token cannot transfer or redeem; admin unfreezes", async function () {
      const id = await mintTo(attacker.address, 1_000);
      await expect(v.connect(guardian).freezeToken(id)).to.be.revertedWithCustomError(v, "ExpectedPause");
      await v.connect(guardian).pause();
      await expect(v.connect(attacker).freezeToken(id)).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await expect(v.connect(guardian).freezeToken(999)).to.be.revertedWithCustomError(v, "InvalidToken");
      await expect(v.connect(guardian).freezeToken(id)).to.emit(v, "TokenFrozen").withArgs(id, guardian.address);
      expect(await v.isFrozen(id)).to.equal(true);
      await expect(v.connect(attacker).safeTransferFrom(attacker.address, user.address, id, 1, "0x"))
        .to.be.revertedWithCustomError(v, "TokenIsFrozen").withArgs(id);
      await v.connect(guardian).unpause();
      await expect(v.connect(attacker).redeem(id)).to.be.revertedWithCustomError(v, "TokenIsFrozen");
      await expect(v.connect(guardian).unfreezeToken(id)).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await expect(v.connect(admin).unfreezeToken(id)).to.emit(v, "TokenUnfrozen").withArgs(id);
      await expect(v.connect(admin).unfreezeToken(id)).to.be.revertedWithCustomError(v, "TokenNotFrozen");
      await v.connect(attacker).redeem(id);
    });

    it("void: only after VOID_DELAY, burns, releases liability, rejects wrong holder / unfrozen", async function () {
      const honest = await mintTo(user.address, 1_000);
      const bad = await mintTo(attacker.address, 50_000);
      await v.connect(guardian).pause();
      await expect(v.connect(guardian).voidToken(attacker.address, bad)).to.be.revertedWithCustomError(v, "TokenNotFrozen");
      await v.connect(guardian).freezeTokens([bad]);
      await expect(v.connect(guardian).voidToken(attacker.address, bad)).to.be.revertedWithCustomError(v, "VoidTooEarly");
      await time.increase(DAY);
      await expect(v.connect(guardian).voidToken(user.address, bad)).to.be.revertedWithCustomError(v, "NotHolder");
      await expect(v.connect(attacker).voidToken(attacker.address, bad)).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      const freeBefore = await v.freeLiquidity();
      await expect(v.connect(guardian).voidToken(attacker.address, bad))
        .to.emit(v, "VoucherVoided").withArgs(bad, attacker.address, 50_000n);
      expect(await v.balanceOf(attacker.address, bad)).to.equal(0n);
      expect(await v.coinBalance(bad)).to.equal(0n);
      expect(await v.outstandingCoins()).to.equal(1_000n);
      expect(await v.freeLiquidity()).to.equal(freeBefore + 50_000n * UNITS);
      await v.connect(guardian).unpause();
      await v.connect(user).redeem(honest);
    });

    it("quarantine freezes an id range in one tx; later mints unaffected; admin lifts", async function () {
      const before = await mintTo(user.address, 100);
      const b1 = await mintTo(attacker.address, 100);
      const b2 = await mintTo(attacker.address, 100);
      await expect(v.connect(guardian).quarantine(b1)).to.be.revertedWithCustomError(v, "ExpectedPause");
      await v.connect(guardian).pause();
      await expect(v.connect(guardian).quarantine(99)).to.be.revertedWithCustomError(v, "InvalidQuarantineRange");
      await expect(v.connect(guardian).quarantine(b1)).to.emit(v, "QuarantineSet").withArgs(b1, b2 + 1n);
      expect(await v.isFrozen(before)).to.equal(false);
      expect(await v.isFrozen(b1)).to.equal(true);
      await expect(v.connect(attacker).safeBatchTransferFrom(attacker.address, user.address, [b1, b2], [1, 1], "0x"))
        .to.be.revertedWithCustomError(v, "TokenIsFrozen");
      await v.connect(user).safeTransferFrom(user.address, attacker.address, before, 1, "0x"); // healthy tokens still move
      await v.connect(guardian).unpause();
      const after = await mintTo(user.address, 100);
      expect(await v.isFrozen(after)).to.equal(false);
      await expect(v.connect(attacker).redeem(b2)).to.be.revertedWithCustomError(v, "TokenIsFrozen");
      await expect(v.connect(guardian).liftQuarantine()).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await v.connect(admin).liftQuarantine();
      expect(await v.isFrozen(b1)).to.equal(false);
    });
  });

  describe("role-grant timelock", function () {
    it("propose -> 24h -> execute; duplicate/invalid proposals rejected; non-admin cannot propose", async function () {
      await expect(v.connect(attacker).proposeRoleGrant(MINTER, attacker.address))
        .to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await expect(v.connect(admin).proposeRoleGrant(ADMIN, safe2.address)).to.be.revertedWithCustomError(v, "RoleNotTimelocked");
      await expect(v.connect(admin).proposeRoleGrant(MINTER, minter.address)).to.be.revertedWithCustomError(v, "AlreadyHasRole");
      await expect(v.connect(admin).proposeRoleGrant(MINTER, ethers.ZeroAddress)).to.be.revertedWith("Zero account");
      await expect(v.connect(admin).proposeRoleGrant(PAUSER, safe2.address)).to.emit(v, "RoleGrantProposed");
      await expect(v.connect(admin).proposeRoleGrant(PAUSER, safe2.address)).to.be.revertedWithCustomError(v, "RoleGrantAlreadyPending");
      const [eta, proposer] = await v.pendingRoleGrant(PAUSER, safe2.address);
      expect(proposer).to.equal(admin.address);
      await time.increaseTo(eta - 2n);
      await expect(v.connect(admin).executeRoleGrant(PAUSER, safe2.address)).to.be.revertedWithCustomError(v, "RoleGrantNotReady");
      await time.increaseTo(eta);
      await expect(v.connect(attacker).cancelRoleGrant(PAUSER, safe2.address)).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
      await expect(v.connect(admin).executeRoleGrant(PAUSER, safe2.address)).to.emit(v, "RoleGrantExecuted");
      expect(await v.hasRole(PAUSER, safe2.address)).to.equal(true);
    });

    it("revoke stays instant", async function () {
      await v.connect(admin).revokeRole(MINTER, minter.address);
      await expect(v.connect(minter).mint(user.address, 100, GAME, next())).to.be.revertedWithCustomError(v, "AccessControlUnauthorizedAccount");
    });
  });

  describe("admin handover (AccessControlDefaultAdminRules)", function () {
    it("transfer needs 48h; old admin's queued grants die with the handover", async function () {
      expect(await v.defaultAdminDelay()).to.equal(BigInt(2 * DAY));
      await v.connect(admin).proposeRoleGrant(MINTER, attacker.address);
      await v.connect(admin).beginDefaultAdminTransfer(safe2.address);
      await expect(v.connect(safe2).acceptDefaultAdminTransfer())
        .to.be.revertedWithCustomError(v, "AccessControlEnforcedDefaultAdminDelay");
      await time.increase(2 * DAY + 1);
      await v.connect(safe2).acceptDefaultAdminTransfer();
      expect(await v.defaultAdmin()).to.equal(safe2.address);
      expect(await v.hasRole(ADMIN, admin.address)).to.equal(false);
      await expect(v.connect(safe2).executeRoleGrant(MINTER, attacker.address)).to.be.revertedWithCustomError(v, "NotProposer");
      await v.connect(safe2).cancelRoleGrant(MINTER, attacker.address);
    });

    it("delay floor of 48h cannot be lowered; a minter cannot accept admin", async function () {
      await expect(v.connect(admin).changeDefaultAdminDelay(HOUR))
        .to.be.revertedWithCustomError(v, "AdminDelayTooShort");
      await v.connect(admin).changeDefaultAdminDelay(3 * DAY); // increase allowed
      await v.connect(admin).beginDefaultAdminTransfer(minter.address);
      await time.increase(10 * DAY);
      await expect(v.connect(minter).acceptDefaultAdminTransfer()).to.be.revertedWithCustomError(v, "AdminCannotBeMinter");
    });
  });

  describe("emergency withdrawal cap", function () {
    it("re-checks free liquidity at execute; full balance available once all vouchers are redeemed; guardian can veto", async function () {
      const free = await v.freeLiquidity();
      await v.connect(admin).initiateEmergencyWithdrawal(free, admin.address);
      const id = await mintTo(user.address, 1_000); // liability created during the delay
      await time.increase(DAY);
      await expect(v.connect(admin).executeEmergencyWithdrawal()).to.be.revertedWith("Exceeds free liquidity");
      await v.connect(guardian).cancelEmergencyWithdrawal();
      await v.connect(user).redeem(id);
      const bal = await usdc.balanceOf(vAddr);
      expect(await v.freeLiquidity()).to.equal(bal);
      await v.connect(admin).initiateEmergencyWithdrawal(bal, admin.address);
      await time.increase(DAY);
      await v.connect(admin).executeEmergencyWithdrawal();
      expect(await usdc.balanceOf(vAddr)).to.equal(0n);
    });
  });

  it("gas report: mint and redeem within 150k / 80k budgets", async function () {
    const r1 = await (await v.connect(minter).mint(user.address, 500, GAME, next())).wait();
    const r2 = await (await v.connect(user).redeem(0)).wait();
    console.log(`      mint gas ${r1.gasUsed}, redeem gas ${r2.gasUsed}`);
    expect(r1.gasUsed).to.be.lt(150_000n);
    expect(r2.gasUsed).to.be.lt(80_000n);
  });
});
