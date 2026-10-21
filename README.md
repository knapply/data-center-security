# Data Center Watch

A curated tracker of the data center industry: security incidents (physical, IT/OT/SCADA, supply chain) and industry developments (energy, capacity, markets, regulation), plus a market watch of the public companies behind data centers and AI.

**Live site:** https://knapply.github.io/data-center-security/

## What's on the site
- **Incident map**: events plotted at city level, colored by category and sized by severity; flat map by default, with a 3D globe view
- **Market watch and stock tape**: AI and cloud, GPUs, cooling, power, construction, operators, and networking companies (TradingView widgets)
- **Ticker**: latest curated headlines
- **Supply chain watch**: risk levels for GPUs, transformers, batteries, cooling, firmware, and subsea capacity
- **How threats cascade**: Sankey diagram from threat category to affected system to impact
- **Connections**: network graph linking incidents, systems, and vendors
- **Risk matrix**: system hit × consequence heatmap; click a cell to filter
- **Who keeps showing up**: operators, vendors, and makers ranked by severity-weighted incidents
- **How much is known**: root-cause confidence and evidence quality for the current view
- **CVE and KEV tags** on incidents, linking to NVD
- **Share, export, subscribe**: filters live in the URL, CSV/JSON export, a printable briefing, and an Atom feed at [`feed.xml`](https://knapply.github.io/data-center-security/feed.xml)

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
