import ResolverModule from '@forge/resolver';
import { asUser, route } from '@forge/api';
import { buildReport } from './analysis.js';
import { licenseAllows, UNLICENSED_MESSAGE } from './license.js';

// This package is "type": "module"; Forge's bundler then hands CommonJS packages
// over as their exports object, so the class sits on `.default`.
const Resolver = ResolverModule.default ?? ResolverModule;
const resolver = new Resolver();
const MAX_ISSUES = 1800;
const FETCH_BUDGET_MS = 15000;

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
  const jql = `organizations = "${escapeJql(organization.name)}" AND created >= "${previousStart}" AND created < "${endExclusive}"${projectClause} ORDER BY created DESC`;
  let nextPageToken;
  const issues = [];
  // Resolvers are killed at 25s. Stop fetching with time left to analyse and
  // return; the report is then flagged retrievalCapped.
  const startedAt = Date.now();
  const fetchDeadline = startedAt + FETCH_BUDGET_MS;
  for (let page = 0; page < 18; page += 1) {
    const body = { jql, maxResults: 100, fields: ['summary', 'description', 'created', 'status'] };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const response = await asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await readJson(response, 'Ticket search');
    issues.push(...(result.issues || []));
    nextPageToken = result.nextPageToken;
    if (!nextPageToken || issues.length >= MAX_ISSUES || Date.now() > fetchDeadline) break;
  }
  const report = buildReport(issues, startDate, endDate);
  console.log(`analyze: ${issues.length} issues in ${Date.now() - startedAt}ms`);
  return { ...report, organization: organization.name, startDate, endDate, projectCount: cleanProjects.length || null, totalFetched: issues.length, retrievalCapped: Boolean(nextPageToken) };
});

export const handler = resolver.getDefinitions();
