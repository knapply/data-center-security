# Data Center Watch: editorial rules

This repo is a curated tracker of the data center industry, published with GitHub Pages. It started with security (physical, IT/OT, supply chain) and now also covers the wider industry: energy, capacity and construction, the market, and regulation.
Claude does the curation. A human reviews every change. Read this whole file before editing `data/`.

## Layout
- `data/incidents.yaml`: the curated record. Every view (map, Sankey, network, list) is built from it.
- `data/supply-chain.yaml`: component risk levels for the supply chain tracker.
- `data/headlines.yaml`: short-lived ticker headlines (newest first, keep about 30).
- `data/vocabulary.yaml`: the only allowed values for type, category, status, severity, affects, impacts.
- `site/`: static front end (no build step beyond `scripts/build.mjs` turning YAML into JSON).
- `npm run check` validates. `npm run serve` builds and previews at http://localhost:8080.

## How changes land
- Never commit to `main`. Work on a branch named `curate/YYYY-MM-DD` (or `curate/<incident-id>`) and open a PR.
- Run `npm run check` before pushing. CI runs the same check.
- The PR description must include:
  1. **Added**: table of id, title, severity, confidence (high/medium/low), and primary source.
  2. **Updated**: what changed and why.
  3. **Considered and rejected**: each item you looked at and skipped, with a one-line reason.
  4. **Open questions** for the reviewer, if any.
- Never merge your own PR.

## Scope: what counts
In scope:
- **Physical**: fire, flood, power or cooling failure, extreme weather, sabotage, intrusion, theft, attacks on data centers, telecom hubs, subsea or long-haul fiber, and substations that serve data centers.
- **IT/OT/SCADA**: vulnerabilities or attacks on facility systems (BMS, UPS, PDUs, cooling controls, access control) and server management planes (BMC, firmware), plus confirmed intrusions into data center operators.
- **Supply chain**: policy, shortages, compromised components, or vendor failures that affect data center equipment or construction.

Industry (use `type: development` unless it is a law or rule, which is `policy`):
- **Energy**: power purchase agreements and nuclear, gas or renewable generation built or contracted for data centers; grid interconnection limits and utility tariffs for large loads.
- **Capacity**: new campuses and expansions of roughly 50 MW or more (or a major operator entering a new market), construction milestones, and cancellations or pauses.
- **Market**: M&A, financing and capex commitments of roughly $1B or more, major leases, notable earnings or guidance changes from data center suppliers and operators, and pricing shifts.
- **Regulation**: permitting decisions, moratoria, water-use and efficiency rules, reporting mandates (for example the EU Energy Efficiency Directive), and tax incentives.

Out of scope: ordinary software bugs, routine cloud outages with no physical or infrastructure cause, generic ransomware against companies that merely own servers, minor product announcements, stock-price moves on their own, rumors, and opinion pieces.

When unsure, leave it out and list it under "Considered and rejected" with your reasoning.

## Sources
- **Tier 1 (primary)**: CISA advisories and KEV, NVD, vendor PSIRTs, operator post-incident reports and status pages, regulators, court filings.
- **Tier 2**: established trade and news outlets (DatacenterDynamics, Data Center Knowledge, Data Center Frontier, The Register, Reuters, AP, Bloomberg, Utility Dive).
- For industry developments, company press releases, SEC filings and earnings materials, utility filings and planning documents count as tier 1 for what the company itself is doing.
- **Tier 3**: social media, forums, single unnamed-source reports.

An entry needs **one tier-1 source or two independent tier-2 sources**. Tier-3-only items are not published. Mention them as open questions if they look important.
Every non-seed entry needs at least one source URL. Link to the most primary source available.

## Writing entries
- `id`: `YYYY-short-slug` using the event year, for example `2024-red-sea-cable-cuts`. Never change an id once published.
- `title`: plain, factual, at most about 80 characters. No hype words ("massive", "devastating").
- `summary`: one to three sentences: what happened, what it hit, and the consequence. Facts only, attributed where uncertain.
- `date`: when the event happened (not when it was reported). If only the month is known, use the 1st and set `date_precision: month`.
- `status`: `confirmed`, `ongoing` (still developing; revisit it), or `unconfirmed` (credible but not yet corroborated; needs a tier-1 source to stay).
- **Update instead of duplicating.** If an event is already tracked, add sources or change status on the existing entry.
- Remove `seed: true` from an entry once you have verified it and linked real sources.

## Location
- City or metro level only, with **at most 2 decimal places** in coordinates. The validator enforces this.
- Never publish a street address, a building identifier, or anything that pinpoints a facility.
- Advisories, policy, and other events with no single place get `location: null`.

## Severity rubric
- **critical**: multi-day outage of a major provider or region, permanent data loss, loss of life, or an actively exploited flaw with remote takeover of facility or server management systems.
- **high**: outage lasting hours at a significant operator, a remotely exploitable flaw in widely deployed DC infrastructure, or a supply disruption affecting a major component class.
- **medium**: a limited or regional outage, a vulnerability that needs local or authenticated access, or a policy change with indirect effects.
- **low**: a near miss, a contained incident, or a minor advisory.

For `development` and `policy` entries, `severity` means **significance** to the industry:
- **critical**: reshapes the market: a multi-gigawatt or $10B+ commitment, a national moratorium, or a top-tier merger.
- **high**: a major campus (roughly 300 MW+), a $1B+ deal, a nuclear or large generation deal for data centers, or a regional rule that changes where operators build.
- **medium**: a notable project or deal below those sizes, or a local permitting decision.
- **low**: worth noting but unlikely to change behavior.

`root_cause` is required for incidents and vulnerabilities only. Developments and policies may leave `affects` and `impacts` as empty lists when nothing fits; use `capacity-added`, `capacity-delayed`, `investment` or `cost` impacts where they do.

## Tagging (feeds the Sankey and network graph)
- `category`: one or more of physical, it-ot, supply-chain.
- `affects`: the systems actually hit. Use the most specific term: a battery-room fire is `ups`, not `power`.
- `impacts`: observed consequences. Use `exposure` for vulnerabilities with no confirmed harm.
- `vendors` / `operators`: use consistent names (check existing entries first). These become network-graph nodes.
- Only add to `vocabulary.yaml` if no existing term fits, and justify the addition in the PR.

## Root cause and supply chain factors
Every non-seed entry needs a `root_cause`, and should have `supply_chain_factors` where sources support them. The goal is to show what failed, who made it, and how the supply chain contributed.

```yaml
root_cause:
  summary: Thermal runaway in a lithium-ion UPS battery rack spread to the battery room.
  confidence: likely          # confirmed | likely | suspected | unknown
  components:
    - part: UPS lithium-ion battery rack
      role: origin            # origin | contributing | affected
      manufacturer: ExampleCell Co.
      model: XR-100           # only if published
      versions: null          # firmware or software versions, mainly for vulnerabilities
      serial: null            # only if published in an official document
      detail: Rack installed 2019; fire report cites a cell defect.
    - part: Fire suppression (gaseous)
      role: contributing
      manufacturer: null
      detail: Gaseous suppression can't stop lithium-ion thermal runaway.
supply_chain_factors:
  - factor: Battery cells from a production lot later recalled for separator defects.
    component: batteries      # an id from supply-chain.yaml
    confidence: suspected
```

Rules:
- **Use only what sources say.** Fill `manufacturer`, `model`, `versions`, and `serial` only from a named source (official investigation, operator report, vendor advisory, recall notice, court filing, or credible press quoting one). These fields are for published facts only. Guesses go in `inferred` (below), never in these fields.
- **Serial numbers** almost never appear publicly. Record one only when an official document published it (for example a recall notice or regulator report), and cite that document in `sources`.
- **Separate fact from inference.** `confidence` applies to the cause as a whole; use `detail` to say which parts are confirmed and which are reported. If official and press accounts differ, say so in `detail` and raise it in the PR.
- **Vulnerabilities:** the `origin` component is the affected product. Put the vendor in `manufacturer`, the product line in `model`, and the affected firmware in `versions`. Add the OEMs that ship it as `affected` components when the advisory names them.
- **Supply chain factors** are upstream reasons the failure happened or spread: a defective lot, a single-source or shared firmware component, substitute parts used during a shortage, deferred maintenance waiting on parts, a vendor's insecure default, export-control-driven substitution, or long repair lead times that extended the outage. Link each to a `component` id in `supply-chain.yaml` when one fits. A factor without evidence is speculation; leave it out or put it in the PR as an open question.
- `root_cause.confidence: unknown` with a one-line summary is fine when nothing has been published. Revisit it when a post-incident report comes out.

### Best guesses (`inferred`)
When no source publishes the manufacturer or model of a failed part, research a best guess and record it on that component:

```yaml
    - part: UPS lithium-ion battery rack
      role: origin
      manufacturer: null            # stays null: nothing published
      inferred:
        manufacturer: ExampleCell Co.
        model: null
        confidence: suspected      # likely | suspected (never confirmed)
        reasoning: >
          The operator announced a fleet-wide deal with ExampleCell for lithium-ion UPS
          batteries in 2018, a year before this hall opened, and a 2020 vendor case study
          names this campus.
        evidence:
          - {publisher: ExampleCell press release, url: "https://...", supports: 2018 fleet-wide supply deal with the operator}
          - {publisher: ExampleCell case study, url: "https://...", supports: Names this campus as a customer site}
```

What counts as evidence, strongest first:
1. **Site-specific:** vendor case studies, press releases or customer lists naming the facility or campus; planning, permit or environmental filings listing equipment (generator and battery permits often name the maker); official photos or videos where the equipment is identifiable; court or insurance filings.
2. **Operator-specific:** the operator's announced supply agreement or standard for that equipment class in the same era (for example "operator X standardizes on vendor Y UPS"); the facility builder's or designer's published project sheet.
3. **Not enough on its own:** market share, "commonly used in the industry", or a vendor merely being big in that region. Never guess from these alone.

Rules:
- At least one piece of evidence must be tier 1 or 2 above (tied to the operator or the site). Otherwise don't guess; note the gap in the PR.
- `likely` = site-specific evidence. `suspected` = operator-specific evidence only. There is no `confirmed` guess: once a source confirms it, move the value into `manufacturer`/`model` and delete `inferred`.
- `reasoning` explains the chain in plain words, including what would contradict it (for example "the hall was refitted in 2021; the supplier may have changed").
- The guess is about **who supplied the equipment**, never about fault. Don't write that the supplier caused the failure. The site shows guesses as "equipment likely supplied by …", flagged as unconfirmed.
- Never guess serial numbers.
- List every new guess in the PR under "Best guesses" so the reviewer checks them one by one.

## Campuses (`data/campuses.yaml`)
The opportunity radar tracks individual campuses. Each entry:

```yaml
- id: 2025-stargate-abilene        # YYYY-slug, year announced; never change once published
  name: Stargate Abilene
  operator: Crusoe                  # developer or operator
  tenants: [OpenAI, Oracle]         # known anchor tenants, or []
  location: {city: Abilene, region: Texas, country: US, lat: 32.45, lon: -99.73}   # city level, 2 decimals
  capacity_mw: 1200                 # as reported; null if unknown
  capacity_basis: planned total     # what the MW figure means (IT load, utility, phase 1...)
  stage: under-construction         # announced | permitting | under-construction | operational | paused | cancelled
  announced: 2025-01-21
  expected_online: "2026"           # year or YYYY-MM, or null
  cooling: {liquid: true, vendors: [], notes: "..."}   # liquid: true/false only when a source says so, else null
  power: "..."                      # power arrangement if reported, else null
  sources: [{publisher: ..., url: "https://..."}]
```

- Same sourcing bar as incidents. Name cooling vendors only when a source names them for that site.
- Update `stage` and `expected_online` as projects move. Don't add a second entry for a new phase unless it's a separate campus.
- `data/hubs.yaml` lists major hubs for the heat and water watch. `water_stress` is the WRI Aqueduct 4.0 baseline category for the hub point; keep the version consistent.

## Supply chain tracker
- Levels: `normal`, `elevated`, `high`. Trend: `up`, `flat`, `down`.
- Change a level only with a cited reason (lead-time data, policy, an incident). Put the reason in `note` and the source in the PR.
- Update `as_of` on every weekly pass. Remove `seed: true` once every note has been checked against sources.

## Headlines (ticker)
- Short-lived, newest first, about 30 items. Each needs date, title, https URL, and category.
- Headlines may be lighter-weight than incidents (tier 2 is enough), but they must still be in scope.
