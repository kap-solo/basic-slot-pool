# Spine symbol assets

Suki Engine standard: **256×256** export canvas (`SPINE_TEXTURE_CANVAS_SIZE` in `@kap-solo/suki-engine` and `js/pixi/symbols.js`).

Place one export folder per symbol id (`CH`, `LM`, `OR`, `GR`, `ST`, `S7`, `DM`, `CR`, `WD`).

## Expected layout

```
assets/spine/cherry/
  cherry.json      # or .skel
  cherry.atlas
  cherry.png
```

## Wire-up

In `js/pixi/symbols.js`, set `SYMBOL_VISUAL.<ID>.spine`:

```js
CH: {
  color: 0xd64545,
  spine: {
    skeleton: 'assets/spine/cherry/cherry.json',
    atlas: 'assets/spine/cherry/cherry.atlas',
    scale: 1,
    designSize: { width: 200, height: 130 }, // from .atlas bounds after export
  },
  animations: { ...SYMBOL_ANIMATION_DEFAULTS },
},
```

Reload the game — placeholders are used until paths load successfully.

## Animation names (convention)

| State | Track 0 animation | Loop |
|-------|---------------------|------|
| idle / static | `idle` | yes |
| spin (optional) | `spin` or `idle` | yes |
| land | `land` | no → idle |
| cascade | `cascade` | no → idle |
| win | `win` | yes |

During tumble/cascade, moving symbols and incoming refill cells call `cascade` (falls back to `land` if `cascade` has no keyframes yet).

Export from Spine 4.2.x to match `@esotericsoftware/spine-pixi-v8@4.2.74`.

## Authoring (256×256)

1. **Export at 256×256** — crop to visible art; do not leave large transparent margins on a 512 canvas.
2. Copy atlas `bounds:` width/height into `designSize` (drawable art size in skeleton space).
3. Board symbols fit to **82%** of the cell (`SPINE_SYMBOL_FIT_RATIO` in `symbolView.js`).

CH/OR in this repo are still **legacy 512 exports** — re-export at 256 and halve each `designSize` when you replace the files.

## Tips

- Keep `designSize` accurate per symbol so board and ledger icons stay sharp and evenly sized.
- Use mesh/region attachments; avoid overly tall symbols that clip the reel mask.
- Add reel frame / cabinet as separate Spine or PNG under `assets/ui/` (future).
