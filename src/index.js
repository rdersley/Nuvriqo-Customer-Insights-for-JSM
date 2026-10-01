import ResolverModule from '@forge/resolver';
import { asUser, route } from '@forge/api';
import { textOf } from './analysis.js';
import { filterFor, parseQuery, readJson, runAnalysis, searchPage } from './engine.js';
import { licenseAllows, UNLICENSED_MESSAGE } from './license.js';
import { suggestMerges, summarise } from './ai.js';
import { snapshotFrom } from './publish.js';
import { deleteLive, deleteReport, loadLiveConfig, loadLiveState, loadReport, loadSettings, saveLiveConfig, saveReport, saveSettings } from './storage.js';
import { liveConfigFrom } from './live.js';
import { queueRefresh } from './liveJobs.js';
import { sanitizeSettings, selectableFields } from './settings.js';

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
const FETCH_BUDGET_MS = 15000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

// Full analysis: the page pages through every ticket in date slices and groups
// them itself (see static/app/src/fullAnalysis.js). Each call reads Jira as the
// user, stays well inside the 25s limit, and returns only what grouping needs.
const FULL_PAGES_PER_CALL = 5;
const FULL_CALL_BUDGET_MS = 12000;
const DESCRIPTION_CHARS = 600;

define('fetchTickets', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  const { breakdowns } = await loadSettings();
  const query = parseQuery(payload, filterFor(payload?.filter, breakdowns));
  const { from, toExclusive } = payload;
  if (!ISO_DATE.test(from || '') || !ISO_DATE.test(toExclusive || '') || from < query.previousStart || toExclusive > query.endExclusive || from >= toExclusive) {
    throw new Error('Invalid ticket range.');
  }
  const deadline = Date.now() + FULL_CALL_BUDGET_MS;
  const tickets = [];
  let token = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : undefined;
  for (let page = 0; page < FULL_PAGES_PER_CALL; page += 1) {
    const result = await searchPage(query.between(from, toExclusive), 100, token, breakdowns);
    for (const issue of result.issues) {
      tickets.push({
        key: issue.key,
        self: issue.self,
        dims: issue.dims,
        fields: {
          summary: issue.fields?.summary || '',
          description: textOf(issue.fields?.description).join(' ').slice(0, DESCRIPTION_CHARS),
          created: issue.fields?.created,
          resolutiondate: issue.fields?.resolutiondate || null,
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
  const { breakdowns, minPatternSize, placeholders } = await loadSettings();
  const query = parseQuery(payload, filterFor(payload?.filter, breakdowns));
  // Resolvers are killed at 25s; runAnalysis stops starting new fetches after the budget.
  return runAnalysis(query, { breakdowns, minPatternSize, placeholders, mode: 'user', budgetMs: FETCH_BUDGET_MS });
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

// Portal publishing follows the admin setting. `forge variables set
// PORTAL_REPORTS off` forces it off, for releases without the portal module.
async function portalEnabled() {
  if (String(process.env.PORTAL_REPORTS ?? '').trim().toLowerCase() === 'off') return false;
  return (await loadSettings()).portalEnabled !== false;
}

define('getPublication', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await portalEnabled())) return { portalEnabled: false, canPublish: false, published: null };
  const organization = await visibleOrganisation(payload?.orgId);
  const [allowed, published, liveState] = await Promise.all([canPublish(), loadReport(organization.id), loadLiveState(organization.id)]);
  return { portalEnabled: true, canPublish: allowed, published, liveState };
});

// payload: { snapshot, live: { preset, schedule }, projects }. With a schedule
// the report becomes live: the approved issues, summary and next steps are
// kept, and the numbers refresh (first refresh queued straight away).
define('publishReport', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await portalEnabled())) throw new Error('Portal reports are switched off on this site.');
  if (!(await canPublish())) throw new Error('Only Jira admins and project admins can publish to the portal.');
  const organization = await visibleOrganisation(payload?.snapshot?.organization?.id);
  const snapshot = snapshotFrom({ ...payload.snapshot, organization }, { publishedBy: context?.accountId });
  const config = liveConfigFrom({
    ...payload?.live,
    approved: snapshot.patterns.filter((p) => p.title !== 'Other requests'),
    overview: snapshot.overview,
    actions: snapshot.actions,
  }, { organization, projects: payload?.projects });
  if (config) {
    snapshot.live = { preset: config.preset, schedule: config.schedule };
    config.publishedAt = snapshot.publishedAt;
    config.summaryWrittenAt = snapshot.summaryWrittenAt;
  }
  await saveReport(snapshot);
  if (config) {
    await saveLiveConfig(config);
    await queueRefresh(organization.id, 'published');
  } else {
    await deleteLive(organization.id);
  }
  console.log(`publishReport: org ${organization.id}, ${snapshot.patterns.length} patterns, live ${config ? `${config.preset}/${config.schedule}` : 'off'}`);
  return snapshot;
});

define('refreshLiveReport', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await canPublish())) throw new Error('Only Jira admins and project admins can refresh portal reports.');
  const organization = await visibleOrganisation(payload?.orgId);
  if (!(await loadLiveConfig(organization.id))) throw new Error('This portal report isn’t set to keep up to date.');
  await queueRefresh(organization.id, 'agent');
  return loadLiveState(organization.id);
});

define('unpublishReport', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await canPublish())) throw new Error('Only Jira admins and project admins can remove portal reports.');
  const organization = await visibleOrganisation(payload?.orgId);
  await Promise.all([deleteReport(organization.id), deleteLive(organization.id)]);
  return { removed: true };
});

// ---- Settings page (jira:adminPage): Jira admins only ------------------------

async function isJiraAdmin() {
  const response = await asUser().requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, { headers: { Accept: 'application/json' } });
  const data = await readJson(response, 'Permission check');
  return Boolean(data.permissions?.ADMINISTER?.havePermission);
}

async function siteFields() {
  const response = await asUser().requestJira(route`/rest/api/3/field`, { headers: { Accept: 'application/json' } });
  return selectableFields(await readJson(response, 'Field list'));
}

define('getSettings', async ({ context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await isJiraAdmin())) return { isAdmin: false };
  const [settings, fields] = await Promise.all([loadSettings(), siteFields()]);
  return {
    isAdmin: true,
    settings,
    fields,
    portalForcedOff: String(process.env.PORTAL_REPORTS ?? '').trim().toLowerCase() === 'off',
  };
});

define('saveSettings', async ({ payload, context }) => {
  if (!licenseAllows(context)) throw new Error(UNLICENSED_MESSAGE);
  if (!(await isJiraAdmin())) throw new Error('Only Jira admins can change Customer Insights settings.');
  const settings = sanitizeSettings(payload?.settings, await siteFields());
  await saveSettings(settings);
  console.log(`saveSettings: ${settings.breakdowns.length} breakdowns, portal ${settings.portalEnabled ? 'on' : 'off'}`);
  return settings;
});

export const handler = resolver.getDefinitions();
