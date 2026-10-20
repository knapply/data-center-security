---
name: add-incident
description: Research one event from a URL or description and draft a tracker entry as a PR. Use when the user shares a link or names an event to add or recheck.
argument-hint: <url or description>
---

# Add or recheck one incident

Follow every rule in `CLAUDE.md`. Input: $ARGUMENTS

1. Check `data/incidents.yaml` for an existing entry about this event. If one exists, update it instead of adding a new one.
2. Research the event: find the most primary source available and at least one corroborating source. Note anything the sources disagree on.
3. Decide whether it's in scope. If not, explain why to the user and stop.
4. Draft or update the entry: tags, severity per the rubric, and city-level location (or `null`).
5. Branch `curate/<incident-id>`, run `npm run check`, commit, push, and open a PR. Include your confidence and any source disagreements.
