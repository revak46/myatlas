# Yemi's Life After 40 — Curated Operating Framework
> Life after 40 is about intentional curation. Choosing what stays, what grows, and what gets removed. Aligning time, work, relationships, and experiences with personal values and legacy.

**Status:** Phase 1 — Architecture defined. Mock data pending.

---

## Five Pillars

| # | Pillar | Layer | Focus |
|---|--------|-------|-------|
| 1 | Family | Anchor | Presence, health awareness, memory capture. Regular check-ins. Document meaningful moments. |
| 2 | Travel | Exploration | Experience + story + reset. Track destinations, monitor pricing, plan around photography. |
| 3 | Photography | Expression | Language and storytelling. Shoot ideas, locations, lighting, creative direction. Long-term: high-end portrait photography with full creative control. |
| 4 | Growth | Intellectual | Technical, creative, communication development. Track learning areas and meaningful conversations. Clarity, presence, refinement. |
| 5 | Finances | Freedom | Control over income, spending, investments. Align with lifestyle goals and future creative independence. |

---

## Intelligence Layer

```
MONITOR    → interests (travel, events, conversations)
TRACK      → opportunities (flights, hotels, exhibitions, shoots)
DETECT     → patterns (creativity cycles, workload, presence gaps)
SUGGEST    → actions (trips, shoots, rest, investments, connections)
```

---

## Data Model — 3 Security Tiers

```
TIER 1 — OPEN (Helm reads freely)
  ├── Photography ideas + shoot locations
  ├── Travel wishlist + destinations
  ├── Growth notes + learning areas
  ├── Pulse card themes
  └── Life colour / day texture notes

TIER 2 — PERSONAL (local only, Helm references not holds)
  ├── Family moments + memory captures
  ├── Health awareness notes
  ├── Personal finances + investment notes
  └── Relationship observations

TIER 3 — PROFESSIONAL (permanently siloed)
  ├── Work calendar → signal only (email forward bridge)
  ├── Work projects + deadlines → signal only
  ├── Org data + contracts → never crosses
  └── Work GitHub → separate, never touches Project_Atlas
```

---

## Input Mechanism — Phased Rollout

| Phase | What | Status |
|-------|------|--------|
| 1 | Architecture defined | ✅ Mar 18 |
| 2 | Mock data — populate all 5 pillars with placeholder entries | Pending |
| 3 | Real Tier 1 data — travel, photography, growth notes | Pending |
| 4 | Real Tier 2 data — personal layer, local storage only | Future |
| 5 | Calendar signal bridge — forwarded email → Claude API reader | Future state |

---

## Calendar Bridge (Future State)

```
Work Calendar
      ↓ (Yemi manually forwards meeting invites)
Dedicated bridge email
      ↓
Claude API reader (future Node.js service)
      ↓
Signal extracted: "Tuesday is heavy / 3 meetings / deadline Thursday"
      ↓
Helm receives signal — no raw content, no attendees, no titles
```

---

## Objective

> Create a life system that is **proactive, intentional, and aligned with Meaningful Productivity.**
> Not task management. Not journaling. A living intelligence that watches, connects, and suggests.
