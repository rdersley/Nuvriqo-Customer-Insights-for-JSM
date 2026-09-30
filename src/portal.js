// Customer portal resolver. Kept separate from the agent resolver (index.js):
// portal customers can call every definition of the function their module
// uses, so this function offers exactly one read.
import Resolver from '@forge/resolver';
import { asApp, route } from '@forge/api';
import { licenseAllows } from './license.js';
import { portalView } from './publish.js';
import { loadReport } from './storage.js';

const ResolverClass = Resolver.default ?? Resolver;
const resolver = new ResolverClass();

/** Organisations the signed-in portal user belongs to (read as the app). */
async function organisationsOf(accountId) {
  const ids = [];
  let start = 0;
  for (let page = 0; page < 10; page += 1) {
    const response = await asApp().requestJira(route`/rest/servicedeskapi/organization?accountId=${accountId}&start=${start}&limit=50`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Organisation lookup failed (${response.status}).`);
    const data = await response.json();
    ids.push(...(data.values || []).map((o) => String(o.id)));
    if (data.isLastPage || !data.values?.length) break;
    start += data.values.length;
  }
  return ids;
}

resolver.define('myReports', async ({ context }) => {
  if (!licenseAllows(context)) return { available: false, reports: [] };
  const accountId = context?.accountId;
  if (!accountId || accountId === 'unidentified') return { available: true, reports: [] };
  const orgIds = await organisationsOf(accountId);
  const reports = (await Promise.all(orgIds.map(loadReport))).filter(Boolean).map(portalView);
  reports.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { available: true, reports };
});

export const handler = resolver.getDefinitions();
