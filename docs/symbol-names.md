# Symbol display names (Reflecting Pool)

Internal reference for user-facing copy. **Book JSON, math, and Spine track suffixes keep legacy ids** (`CH`, `cherry`, etc.) — only UI labels change.

| ID | Spine / art key | Legacy (fruit) | User-facing name |
|----|-----------------|----------------|------------------|
| `CH` | `cherry` | Cherry | **Paint Chip** |
| `LM` | `lemon` | Lemon | **No Entry Sign** |
| `OR` | `orange` | Orange | **Algae Bottle** |
| `GR` | `grape` | Grape | **Safety Vest** |
| `ST` | `star` | Star | **Handcuffs** |
| `S7` | `7` | Seven | **Paintbrush** |
| `DM` | `diamond` | Diamond | **Box Cutter** |
| `CR` | `crown` | Crown | **Contract** |
| `WD` | — | Wild | **Wild** |
| `SC` | `scatter` | Scatter | **Scatter** |
| `BL` | `blob` | Green square | **Green Algae Square** (client-only; not in `SYMBOLS`) |

## Where names are defined

- **Paying symbols:** `SYMBOLS[].label` in `js/config.js`
- **Green Algae Square:** copy in `js/menu.js` (How to Play + Paytable)

## Paytable icons

- Paytable rows use the same **Spine idle** assets as the board (`appendSymbolIcon` in `js/pixi/ledgerSpineIcon.js`)
- Fallback order: Spine canvas → static `ledgerIcon` (if set) → emoji glyph (dev placeholder only)

## Do not rename in

- `math/symbols.mjs`, book JSON symbol ids
- `assets/spine/symbols_spinr-flat.*` track names (`idle_cherry`, etc.)
- RGS / lookup tables
