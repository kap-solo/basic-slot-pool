# Basic Slot Pool — Suki Engine

Independent fork of **Basic-Slot-Lab** (port **5176**). Same Suki Engine stack; changes here do not affect Lab (**5175**) or the frozen baseline (**5174** / `Basic-Slot`).

Includes current lab features: Crown/Cherry tall pairs (`?tall=true`), multiplier panel + ledger (desktop landscape).

## Quick start

```bash
npm install
npm start
```

Or run `start-pool.bat` (Windows).

**URL:** http://127.0.0.1:5176/?dev=true&tall=true&sessionID=local-demo&rgs_url=http://127.0.0.1:5176

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

## Identity (pool-specific)

| Item | Value |
|------|-------|
| `BUILD_REF` | `BS-POOL` |
| `GAME.id` | `basic-slot` (shared books/math for now) |
| RGS session | `basicSlotPool.rgsSessionID` |
| Session stats | `basicSlotPool.session` |
| Server label | `Basic Slot Pool` |

## v1 scope

- Single **base** mode (`data/index.json`)
- 5×5 cluster cascade — book events `gameReveal`, `clusterWin`, `tumble`, `setTotalWin`, `finalWin`
- Mock RGS + Pixi board
- Replay wired via Suki Engine
