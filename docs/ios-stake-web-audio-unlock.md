# iOS / Stake iframe Web Audio unlock

Reference for **Reflecting Pool** (Basic-Slot-Pool). Use when background music or SFX only start after Spin (or another native button), but not after a custom overlay tap like onboarding “TAP ANYWHERE TO PLAY”.

## Symptom

- **Spin** starts music and SFX correctly on iOS and inside Stake’s iframe.
- **Onboarding dismiss** (or other overlay taps) does not — audio stays silent until the first Spin.
- Sometimes **native `<button>` elements** on the same screen (e.g. carousel chevrons) behave differently from a full-screen `<div>` tap target.

## Why this happens

Mobile Safari and Stake’s embedded iframe enforce strict **user-gesture** rules for Web Audio:

1. **`AudioContext` must be resumed and a source must `start()` inside the gesture handler** — often synchronously, in the same call stack as the tap/click.
2. **A fake “silent blip” is not enough** — we tried a 1-sample zero-length buffer; music still did not start. Stake/iOS appears to require playback from a **real decoded media buffer** (we used `pulse.wav` at **zero gain**).
3. **Separate `AudioContext` instances do not share unlock state** — music had its own context, SFX had another. Spin’s SFX playback unlocked one context while music stayed suspended on the other. **Use one shared context** for music beds and one-shot SFX.
4. **HTML `<div>` + `pointerdown` is unreliable** — overlay taps on a non-interactive element often fail the gesture policy. **Native `<button type="button">`** (same as Spin) works.
5. **`preventDefault()` on `pointerdown`** can interfere with activation and follow-up `click` on iOS — prefer **`click` on a button** for the unlock path (matching Spin).
6. **Async unlock is too late** — calling `void backgroundMusic.unlock()` and starting the bed only after `await loadTrack()` runs outside the gesture window. Buffers must be **pre-decoded before** the first tap; sync start must run in the handler.

`HTMLAudioElement` is also blocked in Stake iframes even after gesture unlock — **Web Audio buffer playback** is the supported path for this project.

## What we implemented

### 1. Single shared Web Audio context

In `js/audio.js`:

- `createSharedSfxBus()` owns the one `AudioContext`.
- `createBackgroundMusicLoop()` connects music gain nodes to **that same context** via `bus.ensureContext()` — it no longer creates a second context.
- Music track buffers are loaded through `bus.loadBuffer()` so decode cache is shared with SFX.

### 2. Same unlock path as Spin — silent pulse

Spin already worked via:

```js
spinClickAudio.play(unlockGameAudio);
```

which calls `playOneShot(pulseUrl, unlock)` on the shared bus.

Onboarding (and any non-spin gesture) uses the **identical path**, with a `silent` option:

```js
spinClickAudio.playSilentUnlock(unlockGameAudio);
// internally: playOneShot(pulseUrl, unlock, { silent: true })
```

Silent mode:

- Runs `unlock()` first (same as Spin).
- Resumes the shared context.
- Starts the **pre-decoded** `pulse.wav` through a gain node at **`0`** (inaudible, but a real buffer `start(0)`).

Do **not** use a synthetic 1-frame buffer for Stake/iOS unlock.

### 3. Pre-decode before first gesture

Session preload waits for audio before showing onboarding:

```js
warmGameAudioForFirstGesture(audioPrefs, backgroundMusic)
// → backgroundMusic.whenReady() + pulse buffer loadBuffer()
```

Without this, `startUnlockedSourcesSync()` no-ops because `tracks.base.buffer` is still null when the user taps.

### 4. Onboarding UI: real button, click not pointerdown

In `js/onboardingScreen.js`:

- Full-screen transparent **`<button class="suki-game-onboarding-continue">`** behind content (`z-index: 1`).
- Content layer: `pointer-events: none` so taps pass through to the button.
- Side nav chevrons: `pointer-events: auto` (they stay clickable).
- Continue handler: **`click`** → `playSilentUnlock` → dismiss.
- Side nav **`pointerdown`**: unlock audio without dismissing (so browsing slides can start music early).

### 5. Sync vs async unlock split

```js
function unlockGameAudio() {
  gameAudio.unlock();
  backgroundMusic.unlockSync();  // resume + start loop if buffer ready — sync
  void backgroundMusic.sync();   // async fallback if needed
  resumeGameSfxContext(audioPrefs);
  primeGameSfx();
}
```

`unlockSync()` must run inside the gesture; `sync()` is the safety net after buffers load.

## Checklist for future Stake / iOS slot projects

| Requirement | Do |
|---|---|
| First user tap should start music | Wire unlock to a **native `<button>`** `click` (or proven equivalent), not a div overlay |
| Unlock implementation | Reuse the **exact** code path that works on Spin; mute with gain `0` if you must avoid audible SFX |
| Context count | **One** `AudioContext` for music + SFX |
| Buffer before tap | Preload/decode music + unlock SFX in session preloader; await before showing onboarding |
| Start playback in gesture | Call `resume()` + `source.start(0)` synchronously when buffers are cached |
| Stake iframe | Avoid `HTMLAudioElement` for game SFX; use Web Audio |
| Overlay layout | `pointer-events: none` on decorative layers; explicit `pointer-events: auto` on real controls |

## Key files (Reflecting Pool)

| File | Role |
|---|---|
| `js/audio.js` | Shared bus, silent `playOneShot`, background music on shared context, `warmGameAudioForFirstGesture` |
| `js/game.js` | `unlockGameAudio`, `unlockGameAudioFromGesture` → `playSilentUnlock`, preload hook |
| `js/onboardingScreen.js` | Continue button, gesture unlock on continue + nav |
| `css/onboarding.css` | Button layering and pointer-events |
| `js/gamePreload.js` | Optional `warmAudio` during session preload |

## Debugging tips

If music only starts on Spin:

1. Confirm onboarding calls **`playSilentUnlock` / `playOneShot` with a real URL**, not a custom silent helper.
2. Confirm **one shared `AudioContext`** — log `AudioContext` instance identity for music vs SFX.
3. Confirm **`whenReady()` / pulse `loadBuffer()`** finished before onboarding is shown.
4. Confirm the dismiss target is a **`<button>`** and unlock runs on **`click`** in the same handler stack.
5. Compare call order with Spin: `unlock()` → `resumeContextSync()` → `source.start(0)`.

## What we tried that did **not** work

- `onGestureUnlock: unlockGameAudio` on a **div** `pointerdown` only.
- **1-sample silent buffer** instead of real decoded audio.
- **Two separate `AudioContext`s** for music and SFX.
- **`spinClickAudio.play(unlockGameAudio)` on onboarding** — worked for audio but user heard the pulse SFX (fixed with silent mode).
- Unlock **after** DOM teardown instead of at the **start** of dismiss.

---

*Last updated: Reflecting Pool onboarding audio fix (Aug 2026).*
