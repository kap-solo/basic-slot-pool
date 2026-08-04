# Stake.US restricted phrases (internal reference)

Reference for **social casino / Stake.US** copy in Reflecting Pool. Do not use the **Restricted** column in player-facing social strings. Use the **Use instead** column (or Reflecting Pool conventions below).

Source: Stake submission terminology table (parsed Aug 2026).

---

## Phrase mapping

| Restricted | Use instead |
|---|---|
| win feature | play feature |
| pay out | win / won |
| paid out | win |
| stake | play amount |
| pays out | won |
| betting | play / playing |
| total bet | total play |
| bet | play |
| bets | plays |
| bet/s | play/s |
| cash | coins |
| payer | winner |
| pay | win |
| pays | wins |
| paid | won |
| payout | *(avoid; treat like pay out — use win/won or neutral “amount”)* |
| money | coins |
| buy | play |
| bought | instantly triggered |
| purchase | play |
| at the cost of | for |
| rebet | respin |
| cost of | can be played for |
| credit | coins |
| credited | *(avoid; use “returned”, “applies”, “received”)* |
| buy bonus | get bonus |
| bonus buy | bonus / feature |
| gamble | play |
| wager | play |
| deposit | get coins |
| withdraw | redeem |
| be awarded to player's accounts | appear in player's accounts |
| place your bets | come and play / join in the game |
| currency | token |

---

## Reflecting Pool social conventions

This game goes further than the minimum table in a few places:

| Real-money habit | Social copy in this project |
|---|---|
| Win (HUD) | **Earn** |
| Total Win (free spins) | **Total Earn** |
| Bet / bet amount | **Play** / **play amount** |
| Buy Bonus | **Get Bonus** (button: **GET**) |
| Paytable tab | **Win table** (engine `enSocial.paytableTitle`) |
| win ledger (desktop panel) | **earn ledger** |
| Cluster / cascade “wins” | **earn**, **qualifying cluster**, **amounts** |

Engine social strings live in `@kap-solo/suki-engine` → `client/suki/strings/en.js` (`enSocial`). Game-specific overrides:

- `js/menu.js` — `pickSocialCopy(..., socialBranch)` for How to Play / Win table
- `js/game.js` — `copyTerm()` for HUD, buy confirm, replay labels
- `js/onboardingScreen.js` — `ONBOARDING_FRAMES_SOCIAL`

---

## Where social copy is rendered

| Surface | File(s) |
|---|---|
| How to Play + Win table modals | `js/menu.js` |
| Onboarding carousel (mobile / popout-s) | `js/onboardingScreen.js` |
| Bet chrome (Play, Earn, Get Bonus) | `js/game.js`, `js/betUiDesktop.js`, `js/betUiMobile.js` |
| Get Bonus confirm | `js/buyBonusConfirm.js`, `js/game.js` (`copyTerm`) |
| Free-spin summaries | `js/featureChrome.js` |
| Exported How to Play text | `docs/how-to-play-social.txt` |
| General Disclaimer (social) | `js/menu.js` → `SOCIAL_GENERAL_DISCLAIMER` |

Real-money copy is unchanged; social branches activate when `game.copy.socialCasino` is true (Stake.US jurisdiction or dev social toggle).

---

## Compliance check

Run before shipping social copy changes:

```bash
node scripts/audit-social-restricted.mjs
```

The script scans social strings in menu, onboarding, `copyTerm`, buy modal, feature chrome, engine `enSocial` (with known overrides excluded), and `docs/how-to-play-social.txt`.

Exit code `0` = no restricted hits. Fix any reported phrase and re-run until clean.

---

## Copy-paste checklist (new strings)

When writing or reviewing social text:

1. Scan for every **Restricted** term above (including substrings: *payout*, *credited*, *awarded to your balance*).
2. Prefer **earn / play amount / Get Bonus / amounts / qualifying cluster** where this game already does.
3. Avoid dollar framing in rules text when possible (**1× round** not **$1 bet**).
4. Update `docs/how-to-play-social.txt` if How to Play strings in `menu.js` change.
5. Run `node scripts/audit-social-restricted.mjs`.
