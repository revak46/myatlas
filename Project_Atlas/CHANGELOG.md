# Project Atlas — Changelog

---

## [Mar 18, 2026] — Init

### Added
- `HELM.md` — Helm operational brain: parameters, about Yemi, security tiers, session log
- `life/FRAMEWORK.md` — Phase 1 life architecture: 5 pillars, intelligence layer, 3-tier data model, calendar bridge design
- `life/mock/` — placeholder directory for Phase 2 mock data
- `pulse/PULSE.md` — Pulse project state (migrated from myatlas repo)
- `pulse/pulse_builder.py` — 30-day builder script with --preview mode (migrated)
- `.gitignore` — excludes node_modules, .env, sensitive data patterns
- `CHANGELOG.md` — this file

### Architecture Decisions
- Project_Atlas created as dedicated Helm operational repo (separate from myatlas web app)
- Security tier model: Open / Personal / Professional-siloed
- Calendar input = signal-only bridge via email forwarding (future Claude API)
- Check-in block format established for Helm ↔ Yemi communication calibration
- `HELM_VOICE` parameter 6 added: `CHECKIN_BLOCK = true`

## [Mar 18, 2026] — Session 2

### Added
- `DG_project/` — 8 SQL governance queries for Atlan POC dashboard
  - 01_estate_size.sql · 02_largest_assets.sql · 03_sensitive_data_scan.sql
  - 04_permission_exposure.sql · 05_documentation_coverage.sql
  - 06_schema_organisation.sql · 07_data_growth.sql · 08_governance_readiness.sql
  - README.md
- `mobile-vision/` — MyAtlas-Mobile vision extension (screenshot → Helm → MyAtlas)
  - `config.ts` — Claude API key (gitignored, local only)
  - `utils/vision.ts` — Claude Vision API caller, returns VisionSignal JSON
  - `components/ImageInput.tsx` — camera/library picker with loading state
  - `components/SignalConfirm.tsx` — extraction review modal, editable before save
  - `INTEGRATE.md` — step-by-step integration guide for App.tsx

### Architecture Decisions
- Screenshot parsing replaces email bridge as primary Helm input mechanism
- API key stored locally in config.ts — never committed, gitignored
- Always-confirm flow: Yemi reviews every extraction before it saves
- Pillar colours from MyAtlas design system used in SignalConfirm UI
- Two input modes: text (existing NLP) + image (new Vision API)

### Decisions & Security
- Pulse repo made private (revak46/pulse) — Vercel deploy unaffected
- DG_project pushed to revak46/DG_project (separate from myatlas web app)
- Project_Atlas username corrected: revak46 (not ykembi)

---

## Upcoming

- [ ] Integrate mobile-vision files into MyAtlas-Mobile + test on web preview
- [ ] Unblock EAS Build — expo.dev password reset
- [ ] Phase 2: Mock data across all 5 life pillars (life/mock/)
- [ ] Phase 3: Real Tier 1 data (travel wishlist, shoot ideas, growth notes)
- [ ] Helm server: Node.js + Express + JSON storage (~/helm-server/)
- [ ] Pulse: custom domain pulse.akembi.com
- [ ] Pulse: me.html glitter/shimmer update
- [ ] DataGov.md — add to Project_Atlas
- [ ] Push DG_project SQL files to revak46/DG_project
