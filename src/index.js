import ResolverModule from '@forge/resolver';
import { asUser, route } from '@forge/api';
import { buildReport, chartBuckets } from './analysis.js';
import { licenseAllows, UNLICENSED_MESSAGE } from './license.js';

// This package is "type": "module"; Forge's bundler then hands CommonJS packages
// over as their exports object, so the class sits on `.default`.
const Resolver = ResolverModule.default ?? ResolverModule;
const resolver = new Resolver();
const PERIOD_SAMPLE = 900; // most tickets analysed per period (groupIssues' cap)
const SAMPLE_SLICES = 9;
const CONCURRENCY = 6;
const FETCH_BUDGET_MS = 15000;
const FIELDS = ['summary', 'description', 'created', 'status'];
const DAY = 86400000;

async function jiraPost(path, body, label) {
  const response = await asUser().requestJira(path, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return readJson(response, label);
}

/** Jira's fast count (not a full search). Permissions apply as for search. */
async function countIssues(jql) {
  const result = await jiraPost(route`/rest/api/3/search/approximate-count`, { jql }, 'Ticket count');
  return Number(result.count) || 0;
}

async function searchPage(jql, maxResults, nextPageToken) {
  const body = { jql: `${jql} ORDER BY created DESC`, maxResults, fields: FIELDS };
  if (nextPageToken) body.nextPageToken = nextPageToken;
  const result = await jiraPost(route`/rest/api/3/search/jql`, body, 'Ticket search');
  return { issues: result.issues || [], nextPageToken: result.nextPageToken };
}

/** Runs async tasks with at most `limit` in flight, keeping result order. */
async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** Splits [from, toExclusive) into up to n whole-day slices. */
function dateSlices(from, toExclusive, n) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const days = Math.max(1, Math.round((Date.parse(`${toExclusive}T00:00:00Z`) - start) / DAY));
  const count = Math.min(n, days);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return Array.from({ length: count }, (_, i) => [iso(start + Math.floor((i * days) / count) * DAY), iso(start + Math.floor(((i + 1) * days) / count) * DAY)]);
}

async function readJson(response, label) {
  const body = await response.text();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${body.slice(0, 350)}`);
  return body ? JSON.parse(body) : {};
}

// Unlicensed installs get the flag and nothing else, so the page can explain why.
resolver.define('getOrganizations', async ({ context }) => {
  if (!licenseAllows(context)) return { licensed: false, organizations: [] };
  const organizations = [];
  let start = 0;
  for (let page = 0; page < 10; page += 1) {
    const response = await asUser().requestJira(route`/rest/servicedeskapi/organization?start=${start}&limit=50`, { headers: { Accept: 'application/json' } });
    const data = await readJson(response, 'Organization lookup');
    organizations.push(...(data.values || []).map(({ id, name }) => ({ id: String(id), name })));
    if (!data.isLastPage && data.values?.length) start += data.values.length;
    else break;
  }
  return { licensed: true, organizations };
});

function escapeJql(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

resolver.define('analyze', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const { organization, startDate, endDate, projects = [] } = payload || {};
  if (!organization?.name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) {
    throw new Error('Choose an organization and valid start and end dates.');
  }
  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) throw new Error('Choose valid calendar dates.');
  if (startDate > endDate) throw new Error('Start date must be on or before end date.');
  const span = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
  if (span > 365) throw new Error('Choose a period of 365 days or less for this first version.');
  const requestedProjects = Array.isArray(projects) ? projects : [];
  const cleanProjects = [...new Set(requestedProjects.map((key) => String(key).trim().toUpperCase()).filter((key) => /^[A-Z][A-Z0-9_]{0,49}$/.test(key)))];
  if (requestedProjects.length && !cleanProjects.length) throw new Error('Enter one or more valid Jira project keys, such as SD or HW.');
  const projectClause = cleanProjects.length ? ` AND project in (${cleanProjects.map((key) => `'${key}'`).join(', ')})` : '';
  const fullSpan = Math.max(1, span + 1);
  const previousStart = new Date(Date.parse(`${startDate}T00:00:00Z`) - fullSpan * 86400000).toISOString().slice(0, 10);
  const endExclusive = new Date(Date.parse(`${endDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const between = (from, toExclusive) => `organizations = "${escapeJql(organization.name)}" AND created >= "${from}" AND created < "${toExclusive}"${projectClause}`;
  // Resolvers are killed at 25s; stop starting new fetches after the budget.
  const startedAt = Date.now();
  const deadline = startedAt + FETCH_BUDGET_MS;
  let cutShort = false;

  // Exact totals first, so headline numbers and the comparison never depend on the sample.
  const [currentTotal, previousTotal] = await Promise.all([
    countIssues(between(startDate, endExclusive)),
    countIssues(between(previousStart, startDate)),
  ]);

  // Small periods are fetched in full. Large ones are sampled evenly: the newest
  // tickets of each of SAMPLE_SLICES slices, so June counts as much as August.
  async function fetchPeriod(from, toExclusive, total) {
    if (total <= PERIOD_SAMPLE) {
      const issues = [];
      let token;
      do {
        if (Date.now() > deadline) { cutShort = true; break; }
        const page = await searchPage(between(from, toExclusive), 100, token);
        issues.push(...page.issues);
        token = page.nextPageToken;
      } while (token && issues.length < PERIOD_SAMPLE);
      return issues;
    }
    const perSlice = Math.min(100, Math.ceil(PERIOD_SAMPLE / SAMPLE_SLICES));
    const pages = await pool(dateSlices(from, toExclusive, SAMPLE_SLICES).map(([a, b]) => () => {
      if (Date.now() > deadline) { cutShort = true; return { issues: [] }; }
      return searchPage(between(a, b), perSlice);
    }), CONCURRENCY);
    return pages.flatMap((page) => page.issues);
  }
  const [currentIssues, previousIssues] = await Promise.all([
    fetchPeriod(startDate, endExclusive, currentTotal),
    fetchPeriod(previousStart, startDate, previousTotal),
  ]);

  // A sampled period can't draw its own chart, so count each bucket instead.
  let timeSeries;
  if (currentIssues.length < currentTotal) {
    const buckets = chartBuckets(startDate, endDate);
    const counts = await pool(buckets.map((b) => () => countIssues(between(b.from, b.toExclusive))), CONCURRENCY);
    timeSeries = buckets.map((b, i) => ({ date: b.date, count: counts[i] }));
  }
  const issues = [...currentIssues, ...previousIssues];
  const report = buildReport(issues, startDate, endDate, { current: currentTotal, previous: previousTotal, timeSeries });
  console.log(`analyze: ${currentTotal}+${previousTotal} tickets, ${issues.length} fetched in ${Date.now() - startedAt}ms`);
  return { ...report, organization: organization.name, startDate, endDate, projectCount: cleanProjects.length || null, totalFetched: issues.length, cutShort };
});

export const handler = resolver.getDefinitions();
