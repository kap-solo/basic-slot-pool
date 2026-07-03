# Spine symbol assets

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
  },
  animations: { idle: 'idle', land: 'land', win: 'win' },
},
```

Reload the game — placeholders are used until paths load successfully.

## Animation names (convention)

| State | Track 0 animation | Loop |
|-------|---------------------|------|
| idle / static | `idle` | yes |
| spin (optional) | `spin` or `idle` | yes |
| land | `land` | no |
| win | `win` | yes |

Export from Spine 4.2.x to match `@esotericsoftware/spine-pixi-v8@4.2.74`.

## Tips

- Keep symbol bounds consistent so scaling in `symbolView.js` looks even.
- Use mesh/region attachments; avoid overly tall symbols that clip the reel mask.
- Add reel frame / cabinet as separate Spine or PNG under `assets/ui/` (future).
