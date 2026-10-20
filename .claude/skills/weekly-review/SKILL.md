---
name: weekly-review
description: Weekly analyst pass. Re-score the supply chain tracker, check links, spot patterns across incidents, and open a PR. Use when asked for the weekly review or a supply chain update.
---

# Weekly analyst pass

Follow every rule in `CLAUDE.md`.

1. Branch: `curate/weekly-<today>` from an up-to-date `main`.
2. **Supply chain.** For each component in `data/supply-chain.yaml`, search for the past week's lead-time, policy, and shortage news. Change `level` or `trend` only with a cited reason. Rewrite `note` if the reasoning changed. Update `related_incidents` and set `as_of` to today.
3. **Link check.** Fetch every source URL in `incidents.yaml`. Replace dead links with an archived copy (web.archive.org) or another source of the same tier.
4. **Patterns.** Look across incidents for clusters: a vendor that keeps recurring, a region with repeated events, a component class with rising incidents. Put findings in the PR description under "Patterns this week". Don't edit data based on patterns alone.
5. **Hygiene.** Check vendor and operator names for inconsistent spellings, and `affects` and `impacts` tags against the rubric in `CLAUDE.md`.
6. `npm run check`, then commit, push, and open a PR. In the PR, list each supply chain change as old level → new level, with the reason and source.
