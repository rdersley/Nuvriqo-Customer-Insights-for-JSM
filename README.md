# Nuvriqo Customer Insights for Jira Service Management

A Forge app that analyses visible Jira Service Management tickets for a selected customer organisation. The first release includes ticket volume, period-over-period comparison, recurring text patterns, linked ticket evidence, and CSV export.

## What it does

- Loads customer organisations from the site's Jira Service Management API.
- Searches issues with JQL `organizations = "<selected organisation>"` and the chosen date range. Optional project keys further restrict the search.
- Compares the selected period with the preceding period of equal length.
- Groups likely recurring issues using deterministic word weighting and similarity across summary and description text. No external AI service is used.
- Shows source tickets for every pattern and exports the summary as CSV.
- Makes requests as the signed-in Jira user, so normal Jira issue permissions continue to apply.

## Requirements

- Jira Service Management Cloud.
- Node.js 20 or later and npm.
- Forge CLI and access to the Atlassian developer account that will own the app.

## Configure and run

1. Install app dependencies: `npm install`.
2. Install and sign in to the Forge CLI: `npm install -g @forge/cli`, then `forge login`.
3. Register the app: `forge register nuvriqo-customer-insights`. Forge assigns and writes an app ID to `manifest.yml`.
4. Build the Custom UI: `npm run build`.
5. Deploy to a development environment: `forge deploy -e development`.
6. Install it on the test Jira site: `forge install -e development` and select Jira.
7. Open **Apps → Customer Insights** in Jira.

After changing scopes or modules, deploy again and upgrade the app installation when Forge prompts you. The app requests `read:jira-work` and `read:servicedesk-request` only.

## Local verification

- `npm test` runs the deterministic grouping and date-comparison tests.
- `npm run lint` checks the Forge backend JavaScript syntax.
- `npm run build` builds the Forge Custom UI bundle into `static/app/build`.

## First-version limits

- Date range is limited to 365 days.
- Up to 1,800 issues are fetched; similarity grouping examines up to 900 tickets. The UI flags when the grouping cap is reached.
- Pattern matching is a review aid, not a confirmed root-cause classification. Matching is based on words in summaries and descriptions, and groups need at least two issues.
- Organizations with unusual names that contain JQL-reserved syntax may need additional JQL escaping or an ID-backed field query in a future iteration.
- Forge app ID is a placeholder until the app is registered in the vendor's Atlassian developer account.

## Project layout

```text
manifest.yml          Forge modules, scopes, and app runtime
src/index.js          Jira API resolver functions
src/analysis.js       Deterministic grouping and comparison logic
static/app/src        React UI and styling
test                  Analysis tests
```
