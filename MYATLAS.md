# PROJECT: MyAtlas
> A personal life calendar app with a circular dial UI. Tracks Work, Family, Health, Travel, Money and Creative life across past/present/future time "pods". Swedish minimalism aesthetic. Desktop-only web app with a separate mobile companion.

---

## 🗂 Quick Recall Command
```
Hi Helm. Please read this project file and resume from where we left off.
[paste full contents of this file below]
```

---

## 👤 About Yemi
- Visual learner — always use diagrams, visuals, examples over walls of text
- Based on Mac Mini (Apple Silicon, macOS 15.7.2, 16GB RAM) + iPhone 13
- Node v24.13.1, Python 3.11.15
- GitHub: github.com/revak46
- Prefers to discuss before building

---

## 🤖 Helm Parameters
*Set Mar 17, 2026 — active for all sessions*

| # | Parameter | Value | Behaviour |
|---|-----------|-------|-----------|
| 1 | `VISUAL_FIRST` | `true` | Lead every response with a table, diagram, or code block before any prose |
| 2 | `DISCUSS_BEFORE_BUILD` | `true` | Propose and discuss approach before generating files or code — unless Yemi says "just go" or "build it" |
| 3 | `AUTO_UPDATE_MD` | `true` | At end of every build session, update the relevant project .md file with new status, bugs, decisions, session log entry |
| 4 | `ACTIVE_PROJECTS` | `[MyAtlas, MyAtlas-Mobile, DataGov]` | Helm holds awareness of all three workstreams simultaneously and cross-references between them without needing re-briefing |
| 5 | `HELM_VOICE` | `CONTEXT_AWARE` | DBA_PRAGMATIST mode for governance/technical work (DataGov). Product_Builder mode for MyAtlas UI/UX. Terse and precise in both. |

---

## 📁 Project Info
- **Name:** MyAtlas
- **Purpose:** Personal life calendar — visualise and plan life across 6 lanes on a 24h circular dial
- **Local path:** `/Users/ykembi/MyAtlas/`
- **GitHub repo:** `https://github.com/revak46/myatlas`
- **Live URL:** `https://myatlas-nine.vercel.app` (deployed)
- **Started:** Feb 21, 2026
- **Last updated:** Mar 17, 2026
- **Status:** [x] Desktop deployed | [ ] Mobile native pending EAS Build

---

## 🛠 Tech Stack

### Desktop
- **Frontend:** React + TypeScript (Vite)
- **Storage:** localStorage (browser)
- **Dev tools:** VS Code, Git, Vercel

### Mobile (MyAtlas-Mobile)
- **Framework:** Expo (SDK 54) + React Native
- **Location:** `/Users/ykembi/MyAtlas/MyAtlas-Mobile/`
- **Storage:** AsyncStorage (server-swappable in utils/storage.ts)
- **Parser:** Helm NLP engine (utils/parser.ts) — no external API
- **Web preview:** `npx expo start --web` → localhost:8081
- **Native deploy:** EAS Build (pending — see What's Next)

---

## 📦 File Structure
```
/MyAtlas/
  ├── src/
  │   └── App.tsx                  ← entire desktop app (~1430 lines)
  ├── public/
  │   └── landing.html             ← splash page (orbital dial, cream bg)
  ├── MyAtlas-Mobile/
  │   ├── App.tsx                  ← root: shows SplashScreen then MainScreen
  │   ├── SplashScreen.tsx         ← mirrors landing.html (react-native-svg dial)
  │   ├── index.ts                 ← registerRootComponent entry
  │   ├── app.json                 ← Expo config, newArchEnabled: false
  │   ├── package.json
  │   └── utils/
  │       ├── parser.ts            ← Helm NLP parser (lane/date/time detection)
  │       └── storage.ts           ← AsyncStorage layer (Phase 1 server swap point)
  ├── package.json
  ├── vite.config.ts
  └── tsconfig.json
```

---

## ✅ What's Been Built

| Date | What was built | Notes |
|------|---------------|-------|
| Mar 16 | SplashScreen.tsx | Mirrors landing.html — orbital dial, cream bg, animated Enter |
| Mar 16 | App.tsx (mobile) | Split briefing/input UI, TODAY + NOTES tabs |
| Mar 16 | utils/parser.ts | Helm NLP — lane detection, date/time parsing, confidence scoring |
| Mar 16 | utils/storage.ts | AsyncStorage layer, LaneSummary/LifeEvent types, server-swap ready |
| Mar 16 | MyAtlas-Mobile scaffold | Expo SDK 54, package.json, app.json, babel.config.js |
| Mar 10 | GitHub + Vercel deployment | Fixed TS6133 unused variable error (fmtH) |
| Feb 24 | localStorage persistence | Events, recurring, notes survive refresh |
| Feb 24 | Recurring events | Daily/weekdays/weekly/custom patterns |
| Feb 24 | Day notes floating panel | Per-day notes, auto-saves, slides in from right |
| Feb 24 | Horizontal swimlane day view | Dial (left) + swimlanes (right, 6am-midnight) |
| Feb 24 | Staggered dial labels | Each lane at its own clock position |
| Feb 24 | Semantic thread system | Blue=affinity, Red=conflict |
| Feb 24 | PDF export | 4-page HTML export |
| Feb 23 | QA + 3 bug fixes | Duplicate nav, date comparison, end time validation |
| Feb 21 | Initial build | Pods/Week/Day views, EventModal, TravelTrips |

---

## 🧠 Key Decisions

| Decision | Why |
|----------|-----|
| Desktop-only web app | Full feature set, keyboard-first |
| Separate mobile companion | Input + briefing only, not full desktop clone |
| No expo-router on mobile | Caused TurboModule conflicts with Expo Go |
| Helm parser (no Claude API) | Local-first, no API cost for NLP |
| AsyncStorage swap point | utils/storage.ts designed for Phase 1 server migration |
| Single App.tsx (desktop) | Simplicity for solo dev |
| localStorage now | Ship fast — Node server planned later |
| Dial click removed | Accidental adds too easy |
| Straight chord threads | User requested threads cut through all arcs |
| Swimlanes 6am-midnight | Most activity in this window |

---

## 🐛 Bugs Fixed

| Date | Bug | Fix |
|------|-----|-----|
| Mar 16 | Expo Go TurboModule error | Removed expo-router, reanimated, gesture-handler |
| Mar 16 | SDK mismatch (54 vs 55/56) | Pinned expo@54.0.33 + matching deps |
| Mar 10 | fmtH unused variable — Vercel TS6133 | Removed from DayShell |
| Feb 23 | Duplicate ← buttons in Day header | Removed redundant button |
| Feb 23 | onPickTrip date comparison | Changed to .getTime() |
| Feb 23 | End time before start time | Added validation |
| Feb 24 | Year dials overlapping in Pods | Fixed viewBox + overflow |

---

## 🔄 Patterns & Behaviour Notes

### Desktop
- **DAY_START_HOUR = 4** — dial starts at 4am
- **Lane colors:** Work=#4f6eb0, Family=#c07840, Health=#4d9e6a, Travel=#7c5cb5, Money=#a08c2a, Creative=#b84060
- **laneR = [218,185,152,119,86,53]** — ring radii, outer=Work, inner=Creative
- **Recurring IDs:** `recur-[templateId]-[dateKey]`
- **dateKey format:** `YYYY-MM-DD`
- **localStorage keys:** `myatlas_events`, `myatlas_recurring`, `myatlas_notes`
- **Thread colors:** blue=`rgba(60,100,180,0.50)`, red=`rgba(190,50,40,0.60)`

### Mobile Parser (utils/parser.ts)
- Lane detection via weighted keyword scoring per lane
- Date parsing: today/tomorrow/named days/month+day
- Time parsing: 12h/24h, named times, duration, ranges
- Confidence: high/medium/low based on explicit signals
- Key export: `parseEntry(raw: string): ParsedEntry`

### Mobile Storage (utils/storage.ts)
- AsyncStorage keys mirror desktop: `myatlas_events`, `myatlas_notepad`
- `LifeEvent` type includes `source: "mobile"|"desktop"|"helm"`
- Server swap: replace getItem/setItem with fetch() to localhost:4000

---

## ⚠️ Gotchas
- App.tsx ~1430 lines — read in sections
- TypeScript strict mode — unused variables fail Vercel build
- Date serialization — always use serializeEvents()/deserializeEvents()
- Dial SVG scaled via `<g transform="scale(0.5)">` — coordinates in 640px space
- Expo Go SDK 54 on iPhone 13 has TurboModule issues — use EAS Build for native

---

## 📍 Current Status
**Last session:** Mar 17, 2026
**Desktop:** Live on Vercel at myatlas-nine.vercel.app
**Mobile:** Web preview working (`npx expo start --web`). Native blocked on EAS Build.
**Blockers:** EAS account password reset needed to run EAS Build

---

## 🔜 What's Next
1. EAS Build — get native .ipa on iPhone 13 (need expo.dev password reset first)
2. Phase 1 server — `~/helm-server/` Node.js + Express + JSON storage
3. Migrate desktop localStorage → API calls to local server
4. Email pipeline — Gmail → Helm parser → MyAtlas events (Ollama local LLM)
5. Move hardcoded travel trips (Houston, Lagos) to data server
6. Week view hover threads
7. Dynamic pod years
8. Supabase for cloud persistence

---

## 🛠 Helm Infrastructure Roadmap
> Ideas logged Mar 22, 2026 — not urgent, return when ready

### 1. Home Network Integration
Connect Xfinity gateway + home repeater into Helm System dashboard.
- New component: `helm_network.py` — polls router at `10.0.0.1` for device list, bandwidth stats, signal levels
- Per-device usage tracking + unknown device alerts
- Network panel in Helm System GUI (merges with existing Device Library)
- **First step when ready:** Log into `10.0.0.1`, identify gateway model, check if repeater is in bridge mode or creating its own subnet. Check Xfinity xFi account for API access.

### 2. Mac Mini Mirror Drive
Live/scheduled rsync mirror of the Mac Mini to an external drive — bootable clone, not just a snapshot.
- Builds on existing `helm_backup.sh` (already in `/Project_Atlas/helm_backup.sh`)
- Key difference from backup: `rsync --delete` keeps mirror in sync in real time or on a tight schedule
- Helm component manages it, status card in dashboard
- Goal: plug in drive and keep going if Mac Mini dies

### 3. Helm Dashboard Auth Fix
Frontend passes no token with API calls → dashboard triggers its own 401s → security report flags "critical" falsely.
- Fix: embed `HELM_TOKEN` in served page, inject into all `fetch()` calls as `Authorization: Bearer <token>`
- Result: clears the critical flag permanently, eliminates 401 log noise
- Small session, high impact on security report accuracy

### 4. Helm on AWS (Personal Lab)
Hybrid cloud deployment — Mac Mini stays as edge node, AWS handles remote access + persistence.
- **EC2** (t3.small/t4g): runs Helm System Flask server — dashboard accessible from anywhere
- **S3**: replaces local file storage for Pulse signals, capture logs, resource registry
- **Lambda + EventBridge**: replaces launchd scheduled tasks
- Mac Mini keeps local capture/Gmail/device scanning (network-dependent tasks stay local)
- Design decision: hybrid (Mac = edge, AWS = brain) vs full lift-and-shift — hybrid recommended

---

## 💬 Session Log

| Date | What happened |
|------|--------------|
| Mar 22 | Logged Helm infrastructure roadmap: network integration, mirror drive, dashboard auth fix, AWS. Security report reviewed — 144 "critical" 401s are self-inflicted (dashboard JS not passing token). File permission warnings noted. Phase 1 server (MyAtlas ↔ Helm Capture bridge) added as next MyAtlas priority. |
| Mar 17 | Set 5 Helm operational parameters: VISUAL_FIRST, DISCUSS_BEFORE_BUILD, AUTO_UPDATE_MD, ACTIVE_PROJECTS, HELM_VOICE |
| Mar 16 | Built MyAtlas-Mobile: SplashScreen, Helm parser, storage layer, main screen. Web preview working. EAS Build setup blocked by password reset. |
| Mar 10 | GitHub connected, Vercel deployed, fixed TS6133 build error |
| Feb 24 | Swimlanes, localStorage, recurring events, day notes, PDF export |
| Feb 23 | QA + semantic thread system |
| Feb 21 | Initial build |
