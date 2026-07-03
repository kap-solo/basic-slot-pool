# Game audio

Audio is **off by default** (no preload 404s). Add files here, then wire them in `js/audio.js`:

| File | Use |
|------|-----|
| `music.mp3` | Looping background music |
| `play.mp3` | Bet / play button |
| `win.mp3` | Winning round |
| `lose.mp3` | Losing round |

Update paths in `js/audio.js` if you use different names or formats (OGG is fine).

Music and SFX toggles plus music volume live in the burger menu. Prefs persist in `localStorage`.
