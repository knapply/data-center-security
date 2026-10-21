---
name: curate
description: Daily sweep. Find new data center security events, update existing entries and ticker headlines, and open a PR for human review. Use when asked to curate, sweep, or update the tracker.
---

# Daily curation sweep

Follow every rule in `CLAUDE.md`. This skill is the procedure.

1. **Sync.** `git checkout main && git pull`, then `git checkout -b curate/<today>`.
2. **Read state.** Load `data/incidents.yaml`, `data/headlines.yaml`, and `data/vocabulary.yaml`. Note entries with `status: ongoing` or `unconfirmed` and entries with `seed: true`.
3. **Search** for items since the newest date in `headlines.yaml` (or the last 7 days if it is empty):
   - CISA ICS advisories and KEV additions that touch UPS, PDU, BMS, cooling, access control, BMC, or server firmware vendors (Schneider Electric/APC, Vertiv, Eaton, Siemens, Johnson Controls, Honeywell, Rockwell, AMI, Supermicro, Dell iDRAC, HPE iLO).
   - Trade press: DatacenterDynamics, Data Center Knowledge, The Register.
   - News searches: data center fire, outage power, cooling failure, subsea cable cut, data center attack, export controls chips, transformer shortage.
   - Industry: data center power purchase agreement, nuclear data center deal, gigawatt campus announced, data center moratorium or permit denied, data center acquisition or financing, hyperscaler capex guidance, liquid cooling contract. Sources: Data Center Frontier, Utility Dive, company press releases and SEC filings.
4. **Triage** each item against the scope and source rules. Group reports about the same event.
5. **Write changes.**
   - New qualifying events go into `incidents.yaml` (keep the file in date order).
   - Developments on tracked events update the existing entry.
   - Fill `root_cause` and `supply_chain_factors` for every new or updated entry (see "Root cause and supply chain factors" in CLAUDE.md). Search specifically for post-incident reports, investigator findings, recall notices, and vendor advisories that name the failed part, maker, and model. Where none are published, research an `inferred` best guess per CLAUDE.md.
   - Revisit every `ongoing` and `unconfirmed` entry, and any entry with `root_cause.confidence: unknown` or `suspected`, for newly published causes.
   - Verify up to 3 `seed: true` entries per run: find real source URLs, correct any facts, and drop `seed: true`.
   - Add in-scope items to the top of `headlines.yaml` and trim it to about 30.
6. **Validate.** Run `npm run check` and fix any errors.
7. **PR.** Commit, push, and run `gh pr create` with the PR description format from `CLAUDE.md` (added, updated, considered and rejected, open questions). If nothing qualified, still open the PR when headlines changed. If nothing changed at all, don't open a PR; just report what you checked.

Budget: aim for under 25 searches per run. Prefer primary sources over reading many articles.
