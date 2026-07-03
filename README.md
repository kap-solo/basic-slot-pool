# Basic Slot — Suki Engine

Minimal 3-reel slot (base mode only). Outcomes come from the mock RGS; the client animates reels and presents `round.state` book events.

## Pixi + Spine presentation

Rendering uses **PixiJS 8** + **spine-pixi-v8 4.2** (no bundler — import map + `/vendor/npm/`).

| Path | Role |
|------|------|
| `js/pixi/board.js` | Pixi app, cabinet frame, 3 reel columns |
| `js/pixi/reel.js` | Masked reel strip, spin + bounce stop |
| `js/pixi/symbolView.js` | Placeholder tiles today; Spine when wired |
| `js/pixi/symbols.js` | Colors + future Spine paths per symbol id |
| `assets/spine/README.md` | Drop-in guide for your exports |

Placeholders show colored tiles with emoji/labels until you set `SYMBOL_VISUAL.<ID>.spine` paths.

## Quick start

```bash
npm install
npm start
```

Open **http://127.0.0.1:5174/?dev=true**

Or run `start.bat` (Windows) — opens the browser after install.

| URL | Purpose |
|-----|---------|
| `?dev=true` | Mock RGS, compliance footer, test buttons, Stake screen toolbar |
| `?dev=true&social=true` | Social casino copy preview |
| `?dev=true&jurisdiction=strict` | Session timer + disabled turbo/autoplay |
| `?replay=true&event=2&amount=1000000` | Replay book id 2 at $1.00 bet |

## Verify

```bash
npm run validate-math
npm run test:smoke
```

## Game id / rename map

| Item | Value |
|------|-------|
| `GAME.id` | `basic-slot` |
| Session storage | `basicSlot.rgsSessionID` |
| `server/game-rgs.mjs` | `GAME_ID = 'basic-slot'` |
| Math | `data/books_base.jsonl`, `data/lookUpTable_base_0.csv` |

## v1 scope

- Single **base** mode (`data/index.json`)
- Book flow: `gameReveal` → `setTotalWin` → `finalWin`
- 3×3 board in book JSON; staggered reel spin then land on RGS outcome
- Play button: **Spin** (via Suki `copyOverrides.drop`)
- Wins: `game.formatWin()` · balance/bet: `game.formatCurrency()`
- Replay + Replay again wired like Pure Plinko

Not in v1: buy bonus, free spins, feature modes.

## Engine

```json
"@kap-solo/suki-engine": "github:kap-solo/suki-engine#3b94b24"
```
