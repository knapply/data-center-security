# Data Center Security Watch

A curated tracker of security events affecting data centers worldwide. It covers physical threats, IT/OT/SCADA vulnerabilities, and supply-chain risk.

**Live site:** https://knapply.github.io/data-center-security/

## What's on the site
- **Incident map**: events plotted at city level, colored by category and sized by severity
- **Ticker**: latest curated headlines
- **Supply chain watch**: risk levels for GPUs, transformers, batteries, cooling, firmware, and subsea capacity
- **How threats cascade**: Sankey diagram from threat category to affected system to impact
- **Connections**: network graph linking incidents, systems, and vendors

## How it's curated
Entries are drafted by Claude Code against the editorial rules in [`CLAUDE.md`](CLAUDE.md) and land as pull requests. A person reviews each one before merging. GitHub Actions only validate the data and deploy the site.

| Skill | When | What it does |
|---|---|---|
| `/curate` | daily | Sweeps sources, adds or updates incidents and headlines, opens a PR |
| `/weekly-review` | weekly | Re-scores the supply chain tracker, checks links, notes patterns |
| `/add-incident <url>` | on demand | Researches one event and drafts an entry |

## Local development
```bash
npm install
npm run serve      # validate, build, and preview at http://localhost:8080
npm run check      # validate data only
```

Data lives in [`data/`](data/). Edit the YAML files, never the generated JSON.
