# Basic Slot Pool — Suki Engine

Independent fork of **Basic-Slot-Lab** (port **5176**). Same Suki Engine stack; changes here do not affect Lab (**5175**) or the frozen baseline (**5174** / `Basic-Slot`).

Single-height symbols only (Pool v1). Multiplier panel + ledger on desktop landscape.

## Quick start

```bash
npm install
npm start
```

Or run `start-pool.bat` (Windows).

**URL:** http://127.0.0.1:5176/?dev=true&sessionID=local-demo&rgs_url=http://127.0.0.1:5176

| Build | Port | Directory |
|-------|------|-----------|
| Baseline | 5174 | `Basic-Slot` |
| Lab | 5175 | `Basic-Slot-Lab` |
| **Pool** | **5176** | **`Basic-Slot-Pool`** |

## Verify

```bash
npm run validate-math
npm run test:smoke
```

## Publish math to Stake Engine

Stake ACP expects a folder containing **exactly** these files at the upload root:

| File | Purpose |
|------|---------|
| `index.json` | Mode name, cost, paths to books + lookup |
| `lookUpTable_base_0.csv` | Simulation weights (`id,weight,payout` rows only — **no header**) |
| `books_base.jsonl.zst` | Zstandard-compressed book events |

Build the upload bundle:

```bash
npm run math:publish
```

Then upload the **contents** of `data/publish/` (not `math/`, not the whole repo). The folder must include `index.json` at the top level of the zip/directory you select.

Local mock RGS still reads uncompressed `data/books_base.jsonl` for dev; `npm run validate-math` validates against the uncompressed books file referenced in `index.json`.

## Publish frontend to Stake Engine

Build a self-contained static bundle (game files + Suki client + Pixi/Spine vendors):

```bash
npm run frontend:publish
```

Then upload the **contents** of `dist/` to Stake Engine ACP (frontend section). The published `index.html` uses relative `vendor/` paths so it works on Stake static hosting without the Node dev server.

Preview the bundle locally before upload:

```bash
npx --yes serve dist -p 4173
```

Open http://127.0.0.1:4173/ — for a live spin you still need a sandbox launch URL from ACP with `sessionID` and `rgs_url` (the local preview has no mock RGS).

## Identity (pool-specific)

| Item | Value |
|------|-------|
| `BUILD_REF` | `BS-POOL` |
| `GAME.id` | `basic-slot` — must match your ACP game registration |
| RGS session | `basicSlotPool.rgsSessionID` |
| Session stats | `basicSlotPool.session` |
| Server label | `Basic Slot Pool` |

## v1 scope

- Single **base** mode (`data/index.json`)
- 5×5 cluster cascade — book events `gameReveal`, `clusterWin`, `tumble`, `setTotalWin`, `finalWin`
- Mock RGS + Pixi board
- Replay wired via Suki Engine
