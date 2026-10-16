# Changelog

## 1.6.0 (2026-10-16)

Brought over from the internal edition (everything except crew numbers). **This is a major version** for installed sites: email reports add egress to Microsoft 365, so admins approve the update and the app is no longer eligible for Runs on Atlassian.

- **Internal tab:** analyse your own projects instead of customer organisations, optionally by client (read from client fields an admin chooses). Settings have Customers, Internal and General tabs, and **settings per project** (own client fields, breakdowns, SLAs, patterns, escalation levels and handling statuses).
- **Flow and workload:** created against resolved, backlog change, open tickets and their age, and a 4-week forecast. **Where the effort goes:** recurring issues ranked by time logged, or tickets × typical time to resolve.
- **SLAs:** choose the service project SLA fields that matter; reports show met and breached, per issue and per breakdown value.
- **Knowledge gaps:** check the knowledge base for the top 15 recurring issues and flag the ones with no matching article.
- **Team performance:** resolved, typical time to resolve, SLA met and customer satisfaction for the team. On the Internal tab, Jira admins also see each agent, with **AHT** (time in progress while assigned) in minutes.
- **Escalation levels** (Internal): the highest support level each ticket reached, with percentages and the time from created to 2nd level.
- **When tickets arrive, by contact channel:** choose the channel field (for example Email, Phone, Portal); the heatmap has a button per channel, and the PDF draws a heatmap per channel so they can be compared.
- **Devices affected:** choose the device ID and device type fields, and enter each organisation's **fleet sizes** per device type (Customers → Devices). Reports and surges show devices affected and the share of the fleet, with a suggested P1/P2 from admin thresholds. Agents decide the priority.
- **Live surge detection** (off by default): every 5 minutes, watched organisations' latest tickets are grouped; a burst on one issue raises one "Possible incident" ticket in a chosen project, and later tickets are linked to it.
- **PDF logos:** your logo and one per organisation, top left and right of the PDF.
- **Email reports** (off until set up): connect a Microsoft 365 mailbox (tenant ID, app client ID, client secret, sender) and add weekly or monthly schedules, or send now, to internal staff and customer contacts. The PDF is built by the app and sent with Microsoft Graph. The client secret is kept as a Forge secret, never shown again and not in backups.
- The app has its icon in the Jira sidebar.

## 1.5.0 (2026-10-09)

- **AI categories:** "Summarise with AI" now also sorts the issues into a few broad categories (for example the point-of-sale app, payment devices, stock and products) with totals and change, and each category opens to its patterns. Switch between By category and All patterns. Categories are in the PDF and CSV, and the AI overview leads with them.
- **Words that mean the same:** tickets that call the same thing by different names now group together, for example "Card reader connection" and "Pinpad connection", or "sync" and "synchronisation". Admins edit the lists in settings (Patterns); the first word of each list names the pattern. Defaults cover payment devices (pinpad, pin pad, card reader…), sync and log in. The AI merge and live report refreshes are given the same lists.

## 1.4.0 (2026-10-09)

- **Download PDF:** a branded A4 report from the agent page, and from the customer portal's service report.
- **Create problem:** turn a recurring issue into a Jira problem (created as the agent), with the facts and optionally links to up to 20 example tickets.
- **Portal: when requests arrive:** busiest hours, busiest day and a heatmap on portal reports, in the publishing agent's time zone. Reports published earlier show UTC until they're replaced.
- **Backup & restore:** Jira admins can download every record the app keeps and restore it, for example when moving to another installation.

## 1.3.0 (2026-10-02)

- **Several organisations at once:** analyse up to 10 organisations together. A By Organisation breakdown is added automatically, with drill-down and Open in Jira, and each issue shows its split by organisation. Portal reports stay one organisation each.

## 1.2.0 (2026-10-02)

- **When tickets arrive:** a day-of-week × hour heatmap in the agent's time zone, with the busiest hours, busiest day and the share created out of hours. Each issue says when it mostly happens, and the AI summary can mention it.
- **Licensing:** sites on the evaluation list are allowed even when Forge reports an inactive licence (sharing-link installs).

Marketplace readiness:

- **Customer portal is off by default** and switched on per site in settings. The `PORTAL_REPORTS` Forge variable is gone: variables apply to every site installed from an environment.
- **No account ids are stored.** Reports no longer keep who published them and alerts no longer keep who dismissed them; ids stored by older versions are removed by the hourly job.
- **One production build:** `main` with licensing on; internal and evaluation sites are allowed through `EVALUATION_CLOUD_IDS`.
- README rewritten to match the app, with a data and permissions table.

## 1.1.0 (2026-10-01)

Needs permission to create Jira issues (`write:jira-work`), so a Jira admin approves the upgrade. Tickets are only created when an admin switches it on.

- **Resolution time:** median time to resolve and share still open, for the period, each pattern and each breakdown value.
- **Drill-down:** click a breakdown value to analyse just those tickets; **Open in Jira** for patterns and values.
- **Data quality:** share of tickets with no value or a placeholder (Unknown, Please update…) per breakdown field, with examples. Placeholder values are an admin setting.
- **Trends:** a trend line and New / Rising / Steady / Fading for each pattern.
- **Spike alerts:** a daily check of watched organisations; patterns that jump show as alerts in the app, and optionally as Jira tickets in a chosen project.
- **Customer portal:** customers see the same report as agents for their own organisation, built by the app from their organisation's tickets: trends, time to resolve, example requests linking to the portal, and breakdowns an admin marks **Show on portal**.
- **Fixes:** links to tickets and searches now open the Jira site, not api.atlassian.com.

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
