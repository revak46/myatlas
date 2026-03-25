# PROJECT: Pulse
> A living database of personalised daily cards for Yemi and people in his life. Cards are tailored from conversation analysis + sourced real quotes. Delivered daily via automated script. One card per day per person — rotating between deepening connection, intellectual stimulation, and warmth/humour.

---

## 🗂 Quick Recall Command
```
Hi Helm. I'm Yemi. Please read this project file and resume from where we left off.
[paste full contents of this file below]
```

---

## 👤 About Yemi
- Visual learner — always use diagrams, visuals, examples over walls of text
- Based on Mac Mini + iPhone 13
- Describes days by colours — e.g. "dull pastel red — concern but moderate"
- Projects: MyAtlas, MixFlow, HypeBoard, Pulse

---

## 📁 Project Info
- **Name:** Pulse
- **Local path:** `/Users/ykembi/Pulse/`
- **GitHub repo:** `https://github.com/revak46/pulse`
- **Ideka's card URL:** `https://pulse-ruddy-three.vercel.app`
- **Yemi's dashboard URL:** `https://pulse-ruddy-three.vercel.app/me.html`
- **Custom domain (planned):** `pulse.akembi.com`
- **Started:** Mar 10, 2026
- **Last updated:** Mar 17, 2026
- **Status:** [x] Live — automation running | [x] Days 1-30 complete in script

---

## 📁 File Structure
```
/Users/ykembi/Pulse/
  ├── index.html          ← Ideka's card (auto-generated daily)
  ├── me.html             ← Yemi's dashboard (his card + hers + send button)
  ├── pulse_builder.py    ← automation script (days 1-30 complete)
  ├── pulse.log           ← success log
  └── pulse_error.log     ← error log
~/Library/LaunchAgents/
  └── com.ykembi.pulse.plist  ← 7am scheduler
```

---

## 🚀 How It Works
```
Every morning at 7am (automatic):
  pulse_builder.py runs
        ↓
  Looks up today's date in CARDS dict
  Builds index.html (Ideka's card — warm honey + unique background image)
        ↓
  Git push to GitHub
        ↓
  Vercel auto-deploys
        ↓
Yemi wakes up, opens me.html
Reads his card, scrolls down
Taps "↗ open to send" → texts her the link
```

---

## 🎨 Design System
**Ideka's card — warm honey:**
- Background overlay: `linear-gradient(180deg, rgba(28,14,4,0.54)... rgba(10,5,1,0.94))` over unique daily image
- Background images: Yemi's curated images from `images/` + `images/ideka/` — unique per day, no repeats (days 1-15 use curated stock, days 16-27 use personal photos from `ideka/`, days 28-30 use 3 repeats)
- Accent: `#c8922a` / Gold: `#e8b84b`
- Text: `#f5e6c8`
- Font: Cormorant Garamond (italic, light)
- Effects: shimmer sweep, text glitter gradient, ambient gold particle drift, word glitter fallers

**Yemi's card — dark bold:**
- Background: `linear-gradient(160deg, #0d0d1a, #0a0a0a)`
- Accent: `#5a82ff`
- Text: `#e8e8ff`
- Font: Cormorant Garamond (italic, light)

---

## 👥 People Profiles

### Ideka
**Key traits:**
- Intellectually curious, concept-driven
- Highly observant — tracks subtle details
- Guarded but warm — deflects with questions
- Playful intelligence — subtle clever humour
- Emotionally measured — balances warmth quickly
- Builds connection through dialogue + curiosity
- Independent thinker
- Describes days by colours (said "honey" on Mar 10)
- Interests: documentaries, philosophy, film, art as defiance
- Conversation lengths: 2–8 hours on calls
- Responds well to: patience, curiosity, thoughtful responses, humour without pressure

**Card rotation:** Deepen → Think → Smile (repeat)

### Yemi
**Themes:** Building/creating, Leadership/vision, Relationships, Growth, Balance
**Card design:** Dark bold (blue accent)
**Card rotation:** Mirrors Ideka

---

## ⚠️ Gotchas & Watch-outs
- Script uses `/usr/bin/python3` — Python 3.9 (works but deprecated warning)
- Git commit handled gracefully — checks returncode before push, won't error if no changes
- `me.html` URL must include `.html` — `/me` returns 404 on Vercel
- Vercel project name: `pulse-ruddy-three` (auto-generated, change later via custom domain)
- launchd scheduler: unload then reload if changes needed
- To check scheduler is running: `launchctl list | grep pulse`
- 27 unique images across 30 days (15 from `images/i*.jpg` + 12 from `images/ideka/`) — 3 repeats on days 28-30
- Day-of-week labels were off by 1 for days 6-10 in old script — all corrected in Mar 17 update
- New script wasn't auto-running because old script was still in ~/Pulse/ — always confirm script swap with `head -5 ~/Pulse/pulse_builder.py` before running

---

## 📅 30-Day Schedule
See: `PULSE_30DAYS.md` — full schedule March 10 – April 8, 2026
- Day 3 Ideka updated: "Some days just have better energy than others. Today feels like one of those days."
- All 30 days now live in `pulse_builder.py` as of Mar 17

---

## 📌 Standing Reminders (surface in daily brief when relevant)
- **Helm network integration** — connect Xfinity gateway + home repeater to Helm System. Start by logging into `10.0.0.1` to identify gateway model. Details in MYATLAS.md → Helm Infrastructure Roadmap.
- **Mac Mini mirror drive** — bootable rsync clone via Helm component. Foundation already in `helm_backup.sh`.
- **Helm on AWS** — hybrid cloud deployment. EC2 + S3 + Lambda replacing local launchd. Mac Mini stays as edge node.

## 🔜 What's Next (Priority Order)
1. ~~Fix pulse_builder.py to include days 11-30~~ ✅ Done Mar 17
2. ~~Replace picsum images with Yemi's curated images~~ ✅ Done Mar 17
3. Connect custom domain `pulse.akembi.com`
4. ~~Build Yemi's full profile~~ ✅ YEMI_CARDS added Mar 17 (all 30 days)
5. Update `me.html` to use same glitter/shimmer design system as index.html
6. Eventually: Claude API integration to auto-generate cards from conversation analysis

---

## 💬 Session Log

| Date | What happened |
|------|--------------|
| Mar 17 | Diagnostic run — label bug + missing days 11-30 fixed. All 30 days added. Local images mapped (27 unique + 3 repeats). --preview mode added: shows both cards side-by-side (Yemi dark bold + blue ribbon shimmer, Ideka warm honey + full glitter). YEMI_CARDS dict added for all 30 days. Deployment issue noted: always confirm script swap before running. |
| Mar 10 | Full build session. Card designed (warm honey for Ideka, dark bold for Yemi). Both pages live on Vercel. 7am automation running via launchd. me.html dashboard built. Days 1-10 in script. |
