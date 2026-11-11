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
- **Listing:** live on the Marketplace since October 2026 (app 486431556, key com.nuvriqo.customer-insights). Edit at marketplace.atlassian.com/manage/apps/486431556. Listing edits are public.
- **Versions:** every production deploy creates the next public Marketplace version automatically, named after the Forge version (6.1.0, 6.2.0, 6.3.0…). The "build numbers" on the Versions page are the Marketplace's own counter, not Forge versions. Each new version copies More details and Highlights from the previous one but starts with "Minor version update" as its summary and notes, and with empty Media: fill those in after each deploy.
- **Video:** the hero video field takes the YouTube video ID only (`wAN5FwIMTRk`, the walkthrough), never a full link.
- **App-level fields** (Details tab, not per version): name, tagline, summary (≤ 250), categories, keywords, logo, banner.
- **Keywords:** customer insights, recurring issues, ticket trends, service review, customer report, root cause, problem management, JSM reporting, customer portal report, spike alert, customer health score, SLA report

## Summary (tagline, ≤ 120 characters)

Find the issues behind each customer's tickets, see who needs attention and share a reviewed report.

## More details (250–1000 characters)

Customer Insights shows service teams what each customer's tickets are really about. Pick an organisation and a period: similar requests are grouped into recurring issues with counts, trends, time to resolve and example tickets. Atlassian-hosted AI merges duplicates, sorts them into categories and writes a summary with next steps.

A daily health score ranks every customer from Healthy to At risk, from volume, rising issues, SLAs, aged backlog and satisfaction. Spike alerts and live surge detection flag problems early, with devices affected and a suggested priority.

Break reports down, filter them or compare two groups by your own fields, see when tickets arrive by channel, check SLAs and knowledge gaps, and review your own team on the Internal tab. Share a branded PDF, email it on a schedule through your Microsoft 365, or publish a reviewed report to the customer portal.

Try every screen first with built-in sample data.

## App summary (Details tab, ≤ 250 characters)

Group each customer's tickets into recurring issues, rank customers with a daily health score, catch spikes and surges early, and share a reviewed report by PDF, email or the customer portal. Try it first with built-in sample data.

## Highlights (3; title ≤ 50, text ≤ 220 characters; images in docs/marketing/listing-1.7/)

1. **Recurring issues, not ticket lists**
   Tickets that describe the same problem are grouped however they are worded. AI merges duplicates, sorts issues into categories and writes a plain-English summary with suggested follow-ups.
2. **See which customers need attention**
   A daily health score ranks every customer and shows the signal pulling it down. Spike alerts and live surge detection catch problems early, with devices affected and a suggested P1 or P2.
3. **Share it, or try it first**
   Send a branded PDF, email it on a schedule, or publish a reviewed report to the customer portal. Built-in sample data lets you try every screen before setting anything up.

## Screenshots and video

Capture with sample data on (Settings → General), so nothing needs blurring. The demo videos in `docs/videos/` (not in git) were made this way, showing only the app area.

Hero: the walkthrough video (YouTube ID `wAN5FwIMTRk`). Highlight images: `highlight-1/2/3-1840x900.png`, captions:
1. An issue opened up, with its trend, where it happens and example tickets.
2. The customer health list and a live surge, with devices affected.
3. A branded PDF report, ready to share or email on a schedule.

Media (re-add on each new version), in this order:
1. `screenshot-filter-compare-1840x900.png`: Filter a report (Category is not Printers) and compare two groups side by side.
2. `screenshot-ai-summary-1840x900.png`: The AI summary: an overview of the period and suggested follow-ups.
3. `screenshot-team-1840x900.png`: Team performance on the Internal tab: SLAs, satisfaction and handling time.
4. `screenshot-sample-data-1840x900.png`: Built-in sample data, and when tickets arrive by contact channel.

## Documentation

- Documentation URL: https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/48070657 (written 2 October: still needs the health score, sample data, email reports, Internal tab and report filter)
- Privacy policy URL: https://nuvriqo.atlassian.net/wiki/spaces/NS/pages/1540097/Privacy+Policy
- Security / vulnerability contact: support@nuvriqo.com, subject "Security — Customer Insights"

## Release notes (≤ 1000 characters)

### Marketplace 6.3.0 (app 1.8.0, 11 November 2026)

Summary: Report filter (is / is not) and side-by-side comparison of two groups

New in this version:
- Report filter: on the analysis form, "Only tickets where (field) is / is not (value)" on any breakdown field, with value suggestions. For example, leave out history imported from another tool. "Is not" keeps tickets with no value.
- Compare two groups side by side (a value, and another value or everything else): tickets, change, time to resolve, still open, SLAs met, satisfaction and each group's top issues.
- The filter is kept on published portal reports, where customers see which requests the report covers, and email schedules can have their own filter. PDFs note it.

### Marketplace 6.2.0 (app 1.7.0, 10 November 2026)

Summary: Customer health score, sample data, Internal tab and Microsoft 365 email reports

New in this version:
- Customer health score: a daily 0-100 score per customer from volume, rising issues, SLAs, aged backlog and satisfaction, ranked on the main page and shown on every report (internal only).
- Sample data: try every screen with a made-up IT support company before setting anything up. Nothing is written to Jira.
- Internal tab with settings per project, team performance with handling time, and escalation levels.
- SLAs, knowledge gaps, flow and workload with a 4-week forecast, and where the effort goes.
- Arrival heatmaps by contact channel, devices affected against each customer's fleet, and live surge detection.
- PDF logos, and scheduled email reports through your own Microsoft 365 (optional; this adds a connection to Microsoft 365, so admins approve the update).

### First public version

First Marketplace release. Recurring issues per customer organisation with trends, time to resolve and example tickets; optional AI merge and summary (Atlassian-hosted); breakdowns by your own fields with drill-down; data quality; daily spike alerts with optional Jira tickets; and reviewed reports for the customer portal, scoped to each organisation and kept up to date.
