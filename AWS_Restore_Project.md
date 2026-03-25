# AWS S3 Backup Audit & Restore Pipeline
> DBA Lead scope | On-prem → AWS hybrid | Q1 2026 onwards

---

## Quick Recall Command
```
Hi Helm. Please read this project file and resume from where we left off.
[paste full contents of this file below]
```

---

## Project Context
- **Role:** DBA Lead
- **Environment:** AWS-heavy org, on-prem SQL Server (35 instances), hybrid/VM
- **Primary delivery:** Audit S3 bucket backup files for completeness + build restore/refresh pipeline
- **Secondary delivery:** Quarterly QA refresh covering the "big 4" prod instances, multiple DBs each

---

## Architecture Decisions (agreed)

### Restore Server
- **Decision:** Cloud EC2 (not on-prem net-new hardware)
- **Rationale:** S3 → EC2 (same region) = free data transfer. Eliminates egress costs for large backup files. Only runs during quarterly refresh window (few days/quarter). Team learns AWS by building on real infrastructure.
- **Time window:** A few days per quarter — restore time is not a blocker
- **Flow:** S3 → EC2 restore server → post-scripts → VPN/Direct Connect → on-prem QA SQL Server
- **Outstanding:** Validate VPN/Direct Connect bandwidth for pushing restored DBs back on-prem

### Backup File Sources
- `.bak` — Ola Hallengren (current, active)
- `.safe` — Idera SQLsafe (legacy, deprecated, historical files only — catalog and freeze)

### SQL Server Versions
- Multiple varying versions across estate
- Old versions can be spun up to accommodate older backup files — **deferred scope**

---

## Normalization Challenges (S3 Audit Layer)

### Ola Hallengren filename format
```
{StorageServerName}_{DatabaseName}_{BackupType}_{YYYYMMDD}_{HHmmSS}.bak
```
- **AG cluster issue:** ServerName varies by replica node (static replicas, but storage server name has changed historically)
- **Parse strategy:** Right-to-left — timestamp is the anchor (`\d{8}_\d{6}`), then BackupType (FULL/DIFF/LOG), remainder = ServerName_DatabaseName
- **Solution:** Historical server name registry table — maps all known storage server names (past and present) to canonical DB/AG group name

### Server Name Registry (design)
```sql
-- server_name_registry
storage_server_name | canonical_db_name | ag_group  | active_from | active_to
```

### .safe files (legacy)
- Different naming convention from Ola Hallengren
- Historical only — won't grow
- Extract what's parseable (DB name, date, type), mark as legacy tool, move on

---

## Restore Pipeline (design)

```
PHASE 1 — S3 Audit
  Normalize file metadata → identify complete backup sets
  Output: clean backup catalog in admin DB (on-prem SQL Server admin instance)

PHASE 2 — Restore Orchestration
  Query catalog → identify correct backup set for target
  Pull from S3 to EC2 restore server
  Restore → RESTRICTED_USER (DB locked, no access)
  Run post-scripts in sequence → gate on each (known scripts)
  All pass → MULTI_USER → notify
  Any fail → stay locked → alert + log

PHASE 3 — Quarterly Refresh Wrapper
  Covers the "big 4" prod instances, multiple DBs each
  Sequential per DB (time window allows it)
  Full audit trail per run (which backup, which scripts, pass/fail, duration)
```

### Post-scripts
- Already known and written
- Orchestration challenge = sequencing and gating, not script discovery
- DB stays RESTRICTED_USER until all scripts pass

---

## Scope Boundaries (deferred)
- [ ] SQL Server version compatibility (spin up old instances) — deferred
- [ ] Octopus Deploy integration — noted, not the focus yet
- [ ] Network protocol depth (private endpoints, VNet) — deferred
- [ ] Amazon DataZone — not on radar
- [ ] Parallelism across restore jobs — deferred (sequential is fine for now)

---

## Outstanding Discussions / Next Actions
- [ ] Validate VPN/Direct Connect bandwidth AWS ↔ on-prem
- [ ] Make the case for EC2 restore server (cost savings argument ready)
- [ ] Define server name registry (map all known storage server name variants)
- [ ] Confirm enterprise-level data retention policy exists with legal/compliance team
- [ ] Identify data steward / business owner for each database in the "big 4" instances

---

## BACKLOG — Backup Retention Policy Proposal (Cloud Ops)

> **Status:** Identified — requirements captured, not yet built
> **Audience:** Cloud Ops team
> **Constraint:** Must align with existing enterprise data retention policy (legal owns it)
> **Governance alignment:** Security / Compliance / Audit Readiness (DG_v1 pillars)

### Context
- Organisation: Large staffing agency
- Data sensitivity: High — candidate SSN, employment history, background checks, payroll, I-9, banking/payroll PII
- Enterprise policy: Believed to exist — cloud policy references it, does not reinvent it
- This is a cloud **implementation** of the enterprise policy, not a new policy

### Regulatory Floors (non-negotiable minimums)
| Regulation | Data Type | Minimum Retention |
|---|---|---|
| IRS / FLSA | Payroll / financial records | 7 years |
| FCRA | Background check data | 5 years |
| EEOC | Employment application records | 3 years |
| Federal | I-9 records | 3 years post-termination |
| GDPR / CCPA | Candidate PII (if CA or EU exposure) | Backup exemption clause + purge cycle |

### Database Classification Tiers
- **Tier 1** — PII-sensitive, FCRA, payroll (e.g. CRM_Prod) → full regulatory floor applies
- **Tier 2** — Operational production, non-sensitive → standard retention
- **Tier 3** — QA / Dev / internal tooling → short window, aggressive purge

### S3 Tier Progression (pricing per TB/month)
| Tier | Storage Class | Cost/TB/mo | Retrieval | Use |
|---|---|---|---|---|
| HOT | S3 Standard | $23.55 | Immediate | Recent backups, active restore window |
| WARM | S3 Standard-IA | $12.80 | Immediate + fee | 30–90 days |
| COOL | S3 Glacier Instant | $4.10 | Milliseconds | 90 days – 1 year |
| COLD | S3 Glacier Flexible | $3.60 | 1–12 hours | 1–5 years |
| ARCHIVE | S3 Glacier Deep Archive | $1.00 | 12–48 hours | Compliance hold 5–7 years |

### Retention Schedule (by backup type + classification)
| Backup Type | Tier 1 (PII/Compliance) | Tier 2 (Operational) | Tier 3 (QA/Dev) |
|---|---|---|---|
| LOG | 30 days | 7 days | 72 hours |
| DIFF | 90 days | 4 weeks | 2 weeks |
| FULL | 7 years (regulatory) | 1 year | 90 days |
| QUARTERLY | 7 years | 2 years | 90 days |

### End-of-Retention Process
- S3 Lifecycle Rules automate tier transitions
- S3 Object Tags carry classification + retention metadata per object
- **Human approval gate** required before deletion of anything 5+ years old
- Reason: litigation exposure — staffing agency context, no auto-delete on aged compliance data

### Legacy .safe Files
- Historical only, deprecated tool (Idera SQLsafe)
- Must be assessed against regulatory floors before any purge decision
- Some may contain FCRA / payroll data → cannot auto-delete
- S3 audit output will surface volume and age — feeds deletion decision

### CMDB Dependency (future)
- Database ownership (data steward / business owner) not yet formally recorded
- Once CMDB repo is built (post-restore pipeline), retention policy becomes data-driven
- CMDB record for each DB → drives S3 lifecycle rule automatically
- Until then: manual classification mapping by DBA team

### Three Questions for Cloud Ops Meeting
1. Can we get a copy of the enterprise data retention policy to reference?
2. Who in the business owns retention decisions for Tier 1 databases?
3. What is the current state of S3 storage tiers — are any lifecycle policies already in place?

---

## Session Log

| Date | What happened |
|------|--------------|
| Mar 22 | Full architecture discussion — S3 normalization, restore pipeline, EC2 restore server decision, quarterly refresh scope defined |
| Mar 22 | Backup retention policy framework unpacked — regulatory floors, classification tiers, S3 pricing, CMDB dependency, .safe file risk. Added to backlog. |
