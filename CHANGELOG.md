# Changelog

## 1.0.0 (2026-10-01)

First feature-complete version, running on the RiM work site and sandbox.

- **Analysis:** recurring patterns per customer organisation, with exact totals and trends against the previous period. Large customers are sampled evenly; **Analyse every ticket** removes the sample. Period presets (this or last week, month and quarter, and more).
- **Patterns:** grouping that ignores ticket codes, templates and word forms. AI merges patterns that are the same issue and names them. The **minimum tickets per pattern** is configurable (default 3).
- **AI summary:** Atlassian-hosted Claude (Forge LLMs). Gives an overview, suggested follow-ups, and names and descriptions for each pattern.
- **Breakdowns:** up to **5** admin-chosen fields (for example base or device type), with "where it happens" on each pattern.
- **Settings page:** Jira settings → Apps → Customer Insights.
- **Customer portal:** reviewed reports, optionally kept up to date daily or weekly, with a customer Refresh button limited to once an hour.
- **Reliability:** Jira rate limits (429) and brief outages (503) are retried with back-off.
- **Licensing:** Marketplace licensing that fails closed in production, with an allow-list for evaluation sites.
