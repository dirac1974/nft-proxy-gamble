# Morning Report — Classic single-line video poker UI + green tests

_Autonomous overnight run, 2026-06-18._

## TL;DR
Implemented the classic single-line Jacks-or-Better cabinet UX (always-on paytable,
LED meters, deal/draw timing, HELD banners, win rollup, original SFX, premium WinOverlay)
plus a dev coin faucet, and got **every runnable gate green in 2 of the 3 allowed
iterations**. Backend **integration tests were blocked** (no local Docker/Postgres on this
machine) — Supabase was **not** touched. Visual/audio fidelity needs your eyes/ears on a
device.

## Links
- Branch: `feat/classic-vp-ui`
- PR: https://github.com/dirac1974/nft-proxy-gamble/pull/14
- Issue: https://github.com/dirac1974/nft-proxy-gamble/issues/13
- ADR: `docs/adr/0001-classic-video-poker-ux.md`

## What was implemented (before → after)
| Area | Before | After |
|---|---|---|
| Paytable | modal / single-column "BET N" list | **Always-on 9×5 grid**; current bet column highlighted; winning row flashes (200ms on/off ×3); Royal = 4000 in 5-coin column |
| Meters | none | **MeterBar** — amber LED CREDITS / BET / WIN (`components/MeterBar.tsx`) |
| Cards | "?" placeholders; `dealIndex` never passed | face-down **backs** → staggered deal-in (90ms); **HELD banner overlay**; only non-held cards re-animate on draw |
| Win feedback | static "+X coins 🎉" | **meter rollup** (≤1440ms, `coinDrop` tick/step) + **WinOverlay** for premium hands (4-of-a-kind+, ≥25×) with `bigWin`; normal win → `win` + row flash; loss → `lose` |
| Sound | `soundService` dead (null assets, never imported) | `scripts/gen-sfx.mjs` synthesizes **6 original WAVs**; wired into `soundService` + `initSounds`/`unloadSounds` in `_layout`; `playSound` called per the timing table |
| Controls | 1–5 chips | 1–5 chips + **BET MAX**; phase-driven primary (NEW GAME→DEAL→DRAW→PLAY AGAIN) |
| Backend | — | **dev faucet** `POST /dev/grant-coins` (non-prod only, reuses `IAP_PURCHASE` ledger) |
| Cleanup | unused `screens/VideoPokerScreen.tsx` | removed |

A latent display bug was also fixed: the screen compared the backend's `rank`
(`"ROYAL_FLUSH"`) against display strings (`"Royal Flush"`), so it never matched — now
mapped explicitly via `HAND_META`.

## Test results
| Gate | Result |
|---|---|
| Mobile `tsc --noEmit` | ✅ clean |
| Mobile `jest` | ✅ **92/92 pass** (13 suites; new `play.test.tsx`, `MeterBar.test.tsx`) |
| Backend `tsc --noEmit` | ✅ clean |
| Backend `test:unit` | ✅ **100/100 pass** |
| Backend `videoPoker.ts` coverage | ✅ **100% / 100% / 100% / 100%** (66 cases) |
| Backend `test:integration` | ⛔ **BLOCKED — no local DB** (see below) |

Note: jest prints a "worker failed to exit gracefully" warning — a benign leaked-timer
notice from the rollup `setInterval` in the test env; the suite is green.

## Loop iterations
**2 of 3 used.**
- Iteration 1: mobile `tsc` flagged `toHaveTextContent` (jest-native matcher not typed) →
  switched to portable RNTL assertions. Mobile jest then surfaced one real failure: the
  win **meter rollup rolled to the wrong total** because `runRollup` closed over the stale
  pre-win `coinBalance`.
- Iteration 2: passed the new balance into `runRollup` explicitly. **All gates green.**

## Still red / blocked
- **Backend integration tests did not run** — there is no Docker and no local Postgres on
  this machine (nothing listening on 5432/5433), so the throwaway test DB from the kickoff
  could not be started. Per the hard safety rules I did **not** point tests at Supabase.
  The test DB URL resolves to `postgresql://...@localhost:5432/...` (verified, not Supabase).
  The faucet's `tests/integration/dev.test.ts` is written to the `game.test.ts` conventions
  and should pass once a local DB exists.
  - **To run them yourself:** start Docker Desktop, then:
    ```powershell
    docker run --rm -d --name vp-testdb -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=vp_test -p 5433:5432 postgres:16-alpine
    $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/vp_test"
    cd C:\demo\backend; npx prisma db push --force-reset; npm run test:integration
    ```
    (Confirm `$env:DATABASE_URL` is localhost before running — never Supabase.)

## How to SEE/HEAR the new UI (needs your device)
No simulator/screenshots were possible in this run, so the cabinet layout, animation
timing, and the six SFX **need your eyes and ears**. The app loads the game screen only
after wallet connect; the new `POST /dev/grant-coins` faucet lets you fund a test wallet
to play hands.

- New sound files: `mobile/src/assets/sounds/*.wav` (regenerate anytime with
  `node mobile/scripts/gen-sfx.mjs`). They are **placeholder originals** — fine to swap for
  a licensed pack later (noted in the ADR).
- **Heads-up:** `REAL_TESTING_KICKOFF.md` referenced by §7 of the kickoff does **not exist**
  in this repo, so I could not apply its C1 (deep-link scheme) / C2 (`device-dev` profile)
  pre-staging, and §7 also said not to bake a tunnel URL into an overnight build (they
  expire). So the device build + tunnel + run steps are left for you — they need your phone
  and a fresh tunnel anyway.

## Files of note
- UI: `mobile/src/app/(tabs)/play.tsx`, `mobile/src/components/{MeterBar,Card}.tsx`
- Sound: `mobile/scripts/gen-sfx.mjs`, `mobile/src/assets/sounds/*.wav`, `mobile/src/services/soundService.ts`, `mobile/src/app/_layout.tsx`
- Backend: `backend/src/routes/dev.ts`, `backend/src/app.ts`, `backend/tests/{unit/videoPoker,integration/dev}.test.ts`
- Tests: `mobile/src/tests/{play,MeterBar}.test.tsx`
- Docs: `docs/adr/0001-classic-video-poker-ux.md`
