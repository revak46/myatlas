# MyAtlas Mobile — Setup

## One-time install
```bash
cd ~/MyAtlas/MyAtlas-Mobile
npm install
```

## Run on iPhone
```bash
npx expo start
```
Scan QR with Expo Go. That's it.

## File map
```
MyAtlas-Mobile/
  app/
    _layout.tsx           ← root Expo Router shell
    (tabs)/
      _layout.tsx         ← tab shell (tab bar hidden for now)
      index.tsx           ← MAIN SCREEN (all the action here)
  utils/
    parser.ts             ← Helm NL parser (no dependencies)
    storage.ts            ← AsyncStorage layer (server-swappable)
  package.json
  app.json
  tsconfig.json
  babel.config.js
```

## What the screen does
- **Top bar** — date header
- **TODAY tab** — 6 lane dots with counts, NEXT event banner, event list
- **NOTES tab** — flat timestamped list, tap ✕ to remove
- **Input box** — type or paste anything
  - Preview box auto-parses as you type (lane / confidence / time)
  - **ADD TO DIAL** → Helm parser → saves as LifeEvent to AsyncStorage
  - **SAVE** → saves raw text/link as note, fetches URL metadata if link

## Phase 1 swap (when Node server is ready)
Open `utils/storage.ts` and replace `AsyncStorage.getItem/setItem` calls
with `fetch()` to `http://localhost:4000`. The types stay identical.
