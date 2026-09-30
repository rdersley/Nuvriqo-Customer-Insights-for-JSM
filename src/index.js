import ResolverModule from '@forge/resolver';
import { asUser, route } from '@forge/api';
import { buildReport, chartBuckets, textOf } from './analysis.js';
import { licenseAllows, UNLICENSED_MESSAGE } from './license.js';
import { suggestMerges, summarise } from './ai.js';
import { snapshotFrom } from './publish.js';
import { deleteReport, loadReport, saveReport } from './storage.js';

// This package is "type": "module"; Forge's bundler then hands CommonJS packages
// over as their exports object, so the class sits on `.default`.
const Resolver = ResolverModule.default ?? ResolverModule;
const resolver = new Resolver();

// Agent-only. Portal customers use src/portal.js; this also refuses them here
// in case a module is ever pointed at the wrong function.
function define(name, fn) {
  resolver.define(name, (request) => {
    const type = request?.context?.accountType;
    if (type && type !== 'licensed') throw new Error('Customer Insights is only available to agents.');
    return fn(request);
  });
}
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
define('getOrganizations', async ({ context }) => {
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates an analysis request and builds its JQL. Shared by analyze and fetchTickets. */
function parseQuery(payload) {
  const { organization, startDate, endDate, projects = [] } = payload || {};
  if (!organization?.name || !ISO_DATE.test(startDate || '') || !ISO_DATE.test(endDate || '')) {
    throw new Error('Choose an organization and valid start and end dates.');
  }
  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) throw new Error('Choose valid calendar dates.');
  if (startDate > endDate) throw new Error('Start date must be on or before end date.');
  const span = (Date.parse(endDate) - Date.parse(startDate)) / DAY;
  if (span > 365) throw new Error('Choose a period of 365 days or less for this first version.');
  const requestedProjects = Array.isArray(projects) ? projects : [];
  const cleanProjects = [...new Set(requestedProjects.map((key) => String(key).trim().toUpperCase()).filter((key) => /^[A-Z][A-Z0-9_]{0,49}$/.test(key)))];
  if (requestedProjects.length && !cleanProjects.length) throw new Error('Enter one or more valid Jira project keys, such as SD or HW.');
  const projectClause = cleanProjects.length ? ` AND project in (${cleanProjects.map((key) => `'${key}'`).join(', ')})` : '';
  const fullSpan = Math.max(1, span + 1);
  return {
    organization,
    startDate,
    endDate,
    cleanProjects,
    previousStart: new Date(Date.parse(`${startDate}T00:00:00Z`) - fullSpan * DAY).toISOString().slice(0, 10),
    endExclusive: new Date(Date.parse(`${endDate}T00:00:00Z`) + DAY).toISOString().slice(0, 10),
    between: (from, toExclusive) => `organizations = "${escapeJql(organization.name)}" AND created >= "${from}" AND created < "${toExclusive}"${projectClause}`,
  };
}

// Full analysis: the page pages through every ticket in date slices and groups
// them itself (see static/app/src/fullAnalysis.js). Each call reads Jira as the
// user, stays well inside the 25s limit, and returns only what grouping needs.
const FULL_PAGES_PER_CALL = 5;
const FULL_CALL_BUDGET_MS = 12000;
const DESCRIPTION_CHARS = 600;

define('fetchTickets', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const query = parseQuery(payload);
  const { from, toExclusive } = payload;
  if (!ISO_DATE.test(from || '') || !ISO_DATE.test(toExclusive || '') || from < query.previousStart || toExclusive > query.endExclusive || from >= toExclusive) {
    throw new Error('Invalid ticket range.');
  }
  const deadline = Date.now() + FULL_CALL_BUDGET_MS;
  const tickets = [];
  let token = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : undefined;
  for (let page = 0; page < FULL_PAGES_PER_CALL; page += 1) {
    const result = await searchPage(query.between(from, toExclusive), 100, token);
    for (const issue of result.issues) {
      tickets.push({
        key: issue.key,
        self: issue.self,
        fields: {
          summary: issue.fields?.summary || '',
          description: textOf(issue.fields?.description).join(' ').slice(0, DESCRIPTION_CHARS),
          created: issue.fields?.created,
          status: { name: issue.fields?.status?.name || 'Unknown' },
        },
      });
    }
    token = result.nextPageToken;
    if (!token || Date.now() > deadline) break;
  }
  return { tickets, nextPageToken: token || null };
});

define('analyze', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const { organization, startDate, endDate, cleanProjects, previousStart, endExclusive, between } = parseQuery(payload);
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
  return { ...report, organization: organization.name, startDate, endDate, previousStart, endExclusive, projectCount: cleanProjects.length || null, totalFetched: issues.length, cutShort };
});

// Opt-in, separate from analyze so it gets its own time limit. The report comes
// from this user's own analysis in the page; aiInput() bounds what is sent.
// Step 1 of the AI summary: which rule-based groups are the same issue. Only
// indexes and titles come back; counts are added up by applyMerges().
define('aiMerge', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const startedAt = Date.now();
  const result = await suggestMerges(payload?.report || {});
  console.log(`aiMerge: ${result.model}, ${result.merges.length} merged issues in ${Date.now() - startedAt}ms`);
  return result;
});

define('aiSummary', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const startedAt = Date.now();
  const result = await summarise(payload?.report || {});
  console.log(`aiSummary: ${result.model}, ${result.patterns.length} patterns in ${Date.now() - startedAt}ms`);
  return result;
});

// Publishing to the customer portal. Jira admins and project admins only.
async function canPublish() {
  const response = await asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER,ADMINISTER_PROJECTS`, { headers: { Accept: 'application/json' } });
  const data = await readJson(response, 'Permission check');
  return Boolean(data.permissions?.ADMINISTER?.havePermission || data.permissions?.ADMINISTER_PROJECTS?.havePermission);
}

/** The organisation as this agent can see it; refuses ids they can't. */
async function visibleOrganisation(orgId) {
  if (!/^\d{1,18}$/.test(String(orgId))) throw new Error('Invalid organisation.');
  const response = await asUser().requestJira(route`/rest/servicedeskapi/organization/${String(orgId)}`, { headers: { Accept: 'application/json' } });
  const data = await readJson(response, 'Organization lookup');
  return { id: String(data.id), name: data.name };
}

define('getPublication', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const organization = await visibleOrganisation(payload?.orgId);
  const [allowed, published] = await Promise.all([canPublish(), loadReport(organization.id)]);
  return { canPublish: allowed, published };
});

define('publishReport', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await canPublish())) throw new Error('Only Jira admins and project admins can publish to the portal.');
  const organization = await visibleOrganisation(payload?.snapshot?.organization?.id);
  const snapshot = snapshotFrom({ ...payload.snapshot, organization }, { publishedBy: context?.accountId });
  await saveReport(snapshot);
  console.log(`publishReport: org ${organization.id}, ${snapshot.patterns.length} patterns`);
  return snapshot;
});

define('unpublishReport', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await canPublish())) throw new Error('Only Jira admins and project admins can remove portal reports.');
  const organization = await visibleOrganisation(payload?.orgId);
  await deleteReport(organization.id);
  return { removed: true };
});

export const handler = resolver.getDefinitions();
