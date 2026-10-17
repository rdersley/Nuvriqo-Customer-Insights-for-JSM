# Privacy & Security answers: Nuvriqo Customer Insights

Draft answers for the Marketplace Privacy & Security tab. The form ignores automated input, so these are typed in by hand. Check each against the code before submitting. This is not legal advice.

## Data storage

- **Does the app store end-user data outside Atlassian?** No. All storage is Forge hosted storage (KVS) and Forge secret storage.
- **Does the app transmit data outside Atlassian?** Yes, only for **email reports**, and only after a Jira admin connects their own Microsoft 365 tenant. The app then calls `login.microsoftonline.com` (client-credentials sign-in) and `graph.microsoft.com` (sendMail from the admin-chosen mailbox). What is sent: the PDF report (organisation name, period, counts, trends, issue names, the AI summary if generated, up to 5 example ticket keys and summaries per issue, breakdowns) and the recipients' email addresses. Nothing is sent until email is set up. There is no other external fetch and no Forge Remote. AI features use Forge LLMs, which run on the Atlassian platform.
- **Data residency:** Forge hosted storage; follows Atlassian's data residency for Forge apps. Not eligible for Runs on Atlassian (egress to Microsoft 365). Email is delivered by the customer's own Microsoft 365 tenant, under their Microsoft data residency.
- **What is stored** (Forge KVS):
  - Settings: breakdown field ids and labels, placeholder values, pattern minimum, alert settings (watched organisation ids and names, thresholds, project key, issue type id), portal switch.
  - Published portal reports: organisation id and name, period, counts, trends, the agent's issue names, summary and next steps, and per issue up to 5 example tickets (key, summary, status, created date, portal link); breakdown values for fields marked Show on portal.
  - Report settings and refresh state for each published organisation.
  - Spike alerts: organisation, issue name, counts, up to 100 ticket keys, up to 3 example ticket summaries, and the created alert ticket key. Kept 30 days.
  - Live surge state: per watched organisation, recent issue counts and the open incident ticket key.
  - PDF logos: images uploaded by a Jira admin.
  - Email reports: Microsoft 365 tenant ID, app client ID and sender mailbox; schedules (name, organisations, period, frequency, recipient email addresses, last sent). The client secret is in Forge secret storage, write-only from the UI and not included in backups.
  - Customer health: per listed organisation, the latest score, its signals and 90 days of daily scores (numbers and issue counts only).
  - Sample data: a switch, and the sample settings while it is on. Sample tickets are generated in memory, not stored.
  - Settings also hold project settings, SLA field ids, the contact-channel field, device fields and each organisation's fleet sizes (numbers only).
- **Personal data:** the app stores no Atlassian account ids or display names. The only email addresses stored are the recipients a Jira admin types into email report schedules. Team performance reads assignees and display names for Jira admins when a report runs and does not store them. Ticket summaries can contain whatever customers typed, which may include names or codes; they are stored only in published reports (up to 5 per issue) and alerts (up to 3), and appear in emailed PDFs.
- **Retention:** settings until changed; reports until an agent removes or replaces them; alerts 30 days. All app storage is deleted by Atlassian when the app is uninstalled, following the Forge data lifecycle.

## Data processing

- **Purpose:** analysing a customer organisation's Jira Service Management tickets to show recurring issues, trends and resolution times to agents, and, when published, to that organisation's portal users.
- **Access model:** the agent page reads Jira as the signed-in agent (`asUser`), so Jira permissions apply. Background jobs (portal report builds, spike alerts, surge detection, email reports) read as the app, limited to `organizations = <that organisation>`.
- **AI:** optional and started by an agent per run. Pattern names, counts and example ticket summaries are sent to Forge LLMs (Atlassian-hosted Claude). Nothing leaves the Atlassian platform. (Verify Atlassian's current Forge LLM terms on data use before stating anything about training.)
- **Portal customers:** the portal resolver works out the viewer's organisations from their account on every request and returns only those reports. The account id is used for that lookup and not stored.

## Security

- Built on Atlassian Forge; access limited to the declared scopes.
- Agent and admin features are checked on the server (Jira admin for settings; Jira or project admin to publish). Portal customers use a separate function that can only read their own organisations' reports and ask for a refresh (at most once an hour).
- Licensing fails closed in production.
- Email: Microsoft Graph tokens are requested per send and not stored. The app only calls sendMail as the configured sender. Admins should limit the Entra app's `Mail.Send` permission to that mailbox (an application access policy).
- CI on every pull request: unit tests, UI kit check, syntax check and build.
- Logging: Forge logs hold operational lines (organisation ids, counts, timings, settings summaries) and error messages, which can include up to 350 characters of a Jira API error response. No ticket text is logged deliberately.
- Vulnerability reports: support@nuvriqo.com, subject "Security — Customer Insights".
- Not held: SOC 2, ISO 27001, penetration test report (answer No; don't claim them).

## Scope justification (250–5000 characters, required for Forge apps)

Customer Insights analyses a customer organisation's Jira Service Management tickets to show agents the recurring issues behind them, and can share a reviewed report with that organisation in the portal.

read:jira-work: searches and counts the organisation's tickets (JQL organizations = "<organisation>" and a date range), reads the summary, description, created and resolution dates, status and the admin-chosen breakdown fields, lists fields for the settings page, and checks a project's issue types when an admin sets up alert tickets.

read:servicedesk-request: lists the site's service desks so example requests in portal reports link to the customer's portal request page.

read:organization:jira-service-management: lists organisations for the agent's picker and the alerts settings, looks up an organisation by id when a report is built, and finds which organisations a portal customer belongs to so they only see their own reports.

write:jira-work: only used when a Jira admin switches on "Create a Jira ticket for each alert" and chooses a project; the daily spike check then creates one ticket per alert in that project. Off by default.

storage:app: stores settings, published portal reports and spike alerts in Forge hosted storage. No account ids are stored.

The app also uses Forge LLMs (Atlassian-hosted) for the optional AI summary, scheduled triggers (hourly for reports, alerts and email schedules; every 5 minutes for surge detection, which does nothing until switched on) and a queue consumer for report builds and emails.

## Egress justification

Email reports (optional, off until a Jira admin sets them up): the app signs in to the customer's own Microsoft 365 tenant at login.microsoftonline.com with the client ID and secret the admin provides, and sends the scheduled PDF report through Microsoft Graph (graph.microsoft.com, sendMail) from the admin-chosen mailbox to the recipients they list. No other data leaves Atlassian, and nothing is sent to Nuvriqo.
