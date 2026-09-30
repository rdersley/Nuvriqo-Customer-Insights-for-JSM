// Published report storage (Forge KVS). Loaded on first use, like @forge/llm,
// so modules that import this file still load in tests.
import { reportKey } from './publish.js';

const kvs = async () => (await import('@forge/kvs')).kvs;

export async function loadReport(orgId) {
  return (await (await kvs()).get(reportKey(orgId))) || null;
}

export async function saveReport(snapshot) {
  await (await kvs()).set(reportKey(snapshot.organization.id), snapshot);
  return snapshot;
}

export async function deleteReport(orgId) {
  await (await kvs()).delete(reportKey(orgId));
}
