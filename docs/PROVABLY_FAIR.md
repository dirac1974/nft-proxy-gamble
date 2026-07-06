# Provably Fair — how to verify every hand and spin

This platform lets you independently verify that each game outcome was fixed
**before** you acted, and was not tampered with afterwards. You never have to
trust our word — you can recompute the result yourself.

## The two ingredients

Every game outcome is derived from two values:

- **Server seed** — a secret random value chosen by the server. Before you play,
  the server shows you only its hash (`serverSeedHash = keccak256(serverSeed)`),
  which commits to the seed without revealing it. After the round it reveals the
  actual `serverSeed`, and you can check it hashes to what was shown.
- **Client seed** — entropy tied to your play. You may supply your own
  high-entropy `clientSeed`; if you don't, the server generates one and shows it
  to you at the start of the round.

Because the server commits to (publishes the hash of) the server seed **before**
the round, it cannot change the outcome after seeing your bets or holds.

## The server-seed chain (why the operator can't cheat either)

A commit-reveal alone stops the server from *changing its mind*, but not from
*grinding a favourable seed at commit time*. We close that with a **per-user
server-seed chain**:

- When your account is created, the server pre-commits your next server seed.
- Each time you start a session, that pre-committed seed becomes **this**
  session's seed, and the server commits a fresh one for **next** time — the
  value `nextServerSeedHash` in the response.
- So the seed for every session was fixed and published **before the operator
  knew your next client seed**. It cannot be reground against your entropy.

You can verify continuity: this session's `serverSeedHash` must equal the
`nextServerSeedHash` you received from your previous session (or the
`serverSeedChainHash` returned at login, for your first session).

## Verifying a video poker hand

The 52-card deck is a Fisher–Yates shuffle seeded by the two values:

```
deck = shuffle( keccak256(`${serverSeed}:${clientSeed}:${handNumber}`) )
```

After the hand, recompute the deck from the revealed `serverSeed`, your
`clientSeed`, and `handNumber` (always `0` — one hand per session). The first 5
cards are your deal; cards 5–9 are the draw pool that fills your non-held
positions. The app does this automatically (`verifyHand`) and shows a check mark
or a failure banner.

## Verifying a roulette spin

The winning number is:

```
winningNumber = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)  mod 37
```

with `nonce = 0`. Recompute it from the revealed `serverSeed` and your
`clientSeed`; it must equal the number the server reported, and `serverSeed`
must hash to the committed `serverSeedHash`. The app does this on-device
(`verifyRouletteSpin`) and refuses to trust a spin that fails.

## Verifying a blackjack round

The whole shoe is a committed permutation. Rebuild it from the revealed seeds:

```
shoe = Fisher-Yates( [0..51] × numDecks,  keccak256 chain seeded by
                      `${serverSeed}:${clientSeed}:blackjack:0` )
```

Deal order is player, dealer, player, dealer, then draws continue from the top of
the shoe: player opening = `[shoe[0], shoe[2]]`, dealer opening =
`[shoe[1], shoe[3]]`, subsequent hits/dealer draws come from `shoe[4], shoe[5], …`.
Confirm `keccak256(serverSeed) == serverSeedHash` and that every card you were
dealt matches the reproduced shoe in order. The app checks the opening on-device
(`verifyBlackjackDeal`); `serverSeed` is only revealed once the round settles, so
you can never see the hole card or undealt cards early.

## One round per session

Once a `serverSeed` is revealed it is public. If we let you play another hand or
spin on the **same** session, you could compute the next outcome before acting —
a guaranteed win. So each session resolves exactly one hand/spin; the app starts
a fresh (freshly committed) session for the next one. This is why you always get
a new `serverSeedHash` per round.

## Do it yourself

All the primitives are standard (`keccak256`, `HMAC-SHA256`) and the exact
algorithms live in:

- Backend: `backend/src/services/videoPoker.ts`, `backend/src/services/roulette.ts`
- Client: `mobile/src/services/provablyFair.ts`

Given a revealed `serverSeed`, `clientSeed`, and (`handNumber` or `nonce`), any
of these — or your own script — will reproduce the exact outcome.

## Honest limitations

- **First session for legacy accounts**: accounts created before the chain was
  introduced self-commit their first seed (a small bootstrap gap); every session
  after that is pre-committed. New accounts are pre-committed from creation.
- **Custody is still centralized**: provable fairness covers the *randomness* of
  outcomes. It does not, by itself, constrain balance custody or payouts — those
  are covered by other controls (atomic ledger, on-chain redeemable vouchers).
