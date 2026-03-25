# PROJECT: DataGov — SQL Server Governance Dashboard
> POC evaluation dashboard for Atlan, scoped to the SQL Server layer. Demonstrates governance risk surface to Director of Data Governance and technical leadership. Built from the DBA Lead perspective. Mock data only.

---

## 🗂 Quick Recall Command
```
Hi Helm. Please read this project file and resume from where we left off.
[paste full contents of this file below]
```

---

## 👤 Context
- **Role:** DBA Lead
- **Stakeholder:** Director of Data Governance
- **Platform:** SQL Server (35 instances)
- **POC Tool:** Atlan (metadata catalog + lineage)
- **Broader POC scope:** ETL, EDW, and other platforms (separate workstreams)
- **Dashboard scope:** SQL Server governance surface only

---

## 📁 Project Info
- **Name:** DataGov
- **Purpose:** Mock governance dashboard for Atlan POC — demonstrate SQL governance risk surface to leadership
- **Dashboard v1 (SQL only):** `/Users/ykembi/MyAtlas/DataGov-Dashboard.html`
- **Dashboard v2 (Before/After Atlan):** `/Users/ykembi/MyAtlas/DataGov-WithAtlan.html`
- **Started:** Mar 16, 2026
- **Last updated:** Mar 16, 2026
- **Status:** [ ] v1 draft complete — pending review

---

## 🏗 Environment Specs (Mock)
- 35 SQL Server instances
- 352 databases (~10 per instance)
- ~48,700 tables (~138 per database)
- ~1,125,000 columns (~23 per table)
- Total data footprint: 38.4 TB (Q1 2026)
- Largest DB: CRM_Prod at 4.0 TB
- Schema pattern: 91% of objects under dbo (vendor-heavy)

---

## 📊 Dashboard Sections

| # | Section | Key Metric | Status |
|---|---------|-----------|--------|
| 1 | SQL Estate Size | 352 DBs, 1.1M columns | ✅ |
| 2 | Largest Data Assets | CRM_Prod 4.0 TB | ✅ |
| 3 | Sensitive Data Footprint | 3,420 potential PII columns | ✅ |
| 4 | Permission Exposure | 847 principals, 312 direct table perms | ✅ |
| 5 | Documentation Coverage | 7% tables, 2% columns documented | ✅ |
| 6 | Schema / dbo Concentration | 91% dbo, 304 high-concentration DBs | ✅ |
| 7 | Data Growth Trend | 38.4 TB, +8.7% QoQ | ✅ |
| 8 | Governance Readiness | Score: 18/100 (Critical) | ✅ |

---

## 🎨 Design Style
- Dark navy / slate / teal / amber palette
- Enterprise governance aesthetic — no gimmicks
- Chart.js for bar, donut, line charts
- RAG (Red/Amber/Green) risk indicators
- DBA interpretation box + POC assumptions callout

---

## 🧠 Three Governance Pillars
1. **Security** — Permission exposure, principal access surface
2. **Compliance** — Sensitive data footprint, classification gap
3. **Audit Readiness** — Documentation coverage, stewardship, lineage gap

---

## 📍 Current Status
**Last session:** Mar 16, 2026
**Status:** v1 HTML dashboard complete
**Next:** Review with Director of Data Governance, refine for actual POC presentation

---

## 🔜 What's Next
1. Review dashboard with governance stakeholders
2. Swap mock data for real inventory from central admin instance
3. Add executive-only simplified version (fewer charts, stronger narrative)
4. Consider exporting to PDF for POC review meeting
5. Potentially connect to live CMS metadata tables for real figures

---

## 💬 Session Log

| Date | What happened |
|------|--------------|
| Mar 16 | Initial build — full 8-section mock governance dashboard complete |
