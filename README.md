# Nuvriqo Customer Insights for Jira Service Management

A Forge app that finds the recurring issues behind a customer organisation's tickets, shows what's changing, and can share a reviewed report with that customer in the portal.

## What it does

- **Analysis** (Apps → Customer Insights): pick an organisation and a period. Tickets are found with `organizations = "<organisation>"` and read as the signed-in agent, so Jira permissions apply. Totals and the comparison with the previous period are exact; large organisations are sampled evenly, and **Analyse every ticket** removes the sample.
- **Patterns**: similar tickets are grouped by their wording (ticket codes, templates and word forms are ignored). Each pattern shows its count, change, trend line, time to resolve, where it happens and example tickets, with **Open in Jira**.
- **AI summary** (optional, per run): Atlassian-hosted Claude through Forge LLMs merges patterns that are the same issue and writes names, an overview and next steps. Ticket text stays on the Atlassian platform.
- **Breakdowns and data quality**: up to 5 admin-chosen fields (for example base or device type), with drill-down, and the share of tickets with no value or a placeholder such as "Unknown".
- **Spike alerts** (off by default): once a day, watched organisations' last 7 days are compared with the 7 before. Jumps show in the app and, if an admin switches it on, as Jira tickets in a chosen project.
- **Customer portal** (off by default): an agent reviews names, summary and next steps and publishes. The app then builds the customer's report from that organisation's own tickets: counts, trends, time to resolve, recent requests linking to the portal, and the breakdowns an admin marks **Show on portal**. Customers only ever see reports for organisations they belong to.

## Settings

Jira settings → Apps → Customer Insights (Jira admins): breakdown fields and which show on the portal, minimum tickets per pattern, words that mean the same (for example pinpad, pin pad and card reader), placeholder values, spike alerts, and the customer portal switch. Settings are per site.

## Data and permissions

| Scope | Used for |
|---|---|
| `read:jira-work` | Searching and counting tickets, fields, issue types |
| `read:servicedesk-request` | Service desks, for portal request links |
| `read:organization:jira-service-management` | Organisations, and which ones a portal customer belongs to |
| `write:jira-work` | Only spike alert tickets, when an admin switches them on |
| `storage:app` | Settings, published portal reports, alerts |

Stored in Forge storage: settings, published portal reports (counts, trends, the agent's text, up to 5 example ticket keys and summaries per issue) and spike alerts (kept 30 days). No account ids are stored. Everything is deleted when the app is uninstalled.

## Develop

1. `npm install`, then `npm install -g @forge/cli` and `forge login`.
2. `npm test` (unit tests and the UI kit check), `npm run lint`, `npm run build`.
3. `forge deploy -e development`, then `forge install -e development` (or `forge install --upgrade` after scope changes).

`ALERTS_AS_OF` (a Forge variable, testing only) moves the spike-alert week back to a date, for sites with old test data. Never set it in production.

## Release

There is one production build: `main`, with Marketplace licensing on. Sites installed outside the Marketplace (evaluation and internal sites) are allowed by cloud id in the `EVALUATION_CLOUD_IDS` production variable. Anything that differs between sites is a setting, never a Forge variable, because variables apply to every site installed from an environment.

## Project layout

```text
manifest.yml            Forge modules, scopes and runtime
src/index.js            Agent and settings resolvers
src/portal.js           Portal resolver (customers only reach this)
src/engine.js           Search, sampling and the analysis run
src/analysis.js         Grouping, trends, resolution time, breakdowns, data quality
src/ai.js               Forge LLMs: merge, summary, live assignment
src/alerts.js           Spike alerts
src/live.js, liveJobs.js  Portal report builds and the hourly scheduler
src/publish.js          Snapshot validation (what customers can receive)
static/app|portal|settings  React UIs (Nuvriqo UI kit)
test/                   node --test
```
