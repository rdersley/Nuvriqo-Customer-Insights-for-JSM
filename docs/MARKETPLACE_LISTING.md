# Marketplace listing: Nuvriqo Customer Insights

Source for the Atlassian Marketplace listing. Keep it in step with the app (README.md, CHANGELOG.md).

## Basics

- **App name:** Nuvriqo Customer Insights for Jira Service Management
  (Atlassian naming rules: "for Jira Service Management", not "JSM". Rename the app in the Developer Console to match.)
- **App key / Forge app id:** 58294f6b-c741-495f-a435-0b8f253d5db8
- **Products:** Jira Service Management (Cloud)
- **Hosting:** Forge. Egress only for optional email reports (Microsoft 365: login.microsoftonline.com, graph.microsoft.com), so not eligible for Runs on Atlassian
- **Payment model:** Paid via Atlassian (as Follow-Up Manager). Pricing TBC.
- **EULA:** Atlassian Marketplace standard (Bonterms), as Follow-Up Manager
- **Support:** https://nuvriqo.atlassian.net/servicedesk/customer/portal/2 · support@nuvriqo.com
- **Categories:** IT & helpdesk; Charts & diagramming / Reports (pick the closest two)
- **Listing:** live on the Marketplace since October 2026 (app 486431556, key com.nuvriqo.customer-insights). Edit at marketplace.atlassian.com/manage/apps/486431556 → public version → Details and Highlights. Listing edits are public.
- **Keywords:** customer insights, recurring issues, ticket trends, service review, customer report, root cause, problem management, JSM reporting, customer portal report, spike alert, customer health score, SLA report

## Summary (tagline, ≤ 120 characters)

Find the issues behind each customer's tickets, see who needs attention and share a reviewed report.

## More details (250–1000 characters)

Customer Insights shows service teams what each customer's tickets are really about. Pick an organisation and a period: similar requests are grouped into recurring issues with counts, trends, time to resolve and example tickets. Atlassian-hosted AI merges duplicates, sorts them into categories and writes a summary with next steps.

A daily health score ranks every customer from Healthy to At risk, from volume, rising issues, SLAs, aged backlog and satisfaction. Spike alerts and live surge detection flag problems early, with devices affected and a suggested priority.

Break reports down by your own fields, see when tickets arrive by channel, check SLAs and knowledge gaps, and review your own team on the Internal tab. Share a branded PDF, email it on a schedule through your Microsoft 365, or publish a reviewed report to the customer portal.

Try every screen first with built-in sample data.

## Highlights (3; title ≤ 50, text ≤ 220 characters)

1. **Recurring issues, not ticket lists**
   Tickets that describe the same problem are grouped however they are worded. AI merges duplicates, sorts issues into categories and writes a plain-English summary with suggested follow-ups.
2. **See which customers need attention**
   A daily health score ranks every customer and shows the signal pulling it down. Spike alerts and live surge detection catch problems early, with devices affected and a suggested P1 or P2.
3. **Share it, or try it first**
   Send a branded PDF, email it on a schedule, or publish a reviewed report to the customer portal. Built-in sample data lets you try every screen before setting anything up.

## Screenshots and video

Capture with sample data on (Settings → General), so nothing needs blurring. The demo videos in `docs/videos/` (not in git) were made this way, showing only the app area.

1. Customer health list with trend lines and the weakest signal
2. Live surge card: devices affected and suggested priority
3. A customer report: KPIs and the health card
4. AI summary with categories, and an expanded issue with example tickets
5. When tickets arrive by contact channel, and SLAs
6. Internal tab: team performance and escalation levels
7. Settings: sample data, devices with fleet sizes

A Marketplace video needs a YouTube link: upload `nuvriqo-customer-insights-promo.mp4` (1:39) or the walkthrough (5:36) first.

## Documentation (publish before submitting)

- Documentation URL: TBC (Confluence or help centre page built from README "What it does" and "Settings")
- Privacy policy URL: TBC (publish docs/PRIVACY_POLICY.md)
- Security / vulnerability contact: support@nuvriqo.com, subject "Security — Customer Insights"

## Release notes (≤ 1000 characters)

### 1.7.0 (production 6.0.0, October 2026)

New in this version:
- Customer health score: a daily 0-100 score per customer from volume, rising issues, SLAs, aged backlog and satisfaction, ranked on the main page and shown on every report (internal only).
- Sample data: try every screen with a made-up IT support company before setting anything up. Nothing is written to Jira.
- Internal tab with settings per project, team performance with handling time, and escalation levels.
- SLAs, knowledge gaps, flow and workload with a 4-week forecast, and where the effort goes.
- Arrival heatmaps by contact channel, devices affected against each customer's fleet, and live surge detection.
- PDF logos, and scheduled email reports through your own Microsoft 365 (optional; this adds a connection to Microsoft 365, so admins approve the update).

### First public version

First Marketplace release. Recurring issues per customer organisation with trends, time to resolve and example tickets; optional AI merge and summary (Atlassian-hosted); breakdowns by your own fields with drill-down; data quality; daily spike alerts with optional Jira tickets; and reviewed reports for the customer portal, scoped to each organisation and kept up to date.
