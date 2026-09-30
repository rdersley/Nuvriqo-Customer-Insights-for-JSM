// Published report storage (Forge KVS). Loaded on first use, like @forge/llm,
// so modules that import this file still load in tests.
import { reportKey } from './publish.js';
import { DEFAULT_SETTINGS } from './settings.js';

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

// Live reports: the agent's approved settings, and refresh bookkeeping.
const liveKey = (orgId) => `live-config:${reportKey(orgId).split(':')[1]}`;
const stateKey = (orgId) => `live-state:${reportKey(orgId).split(':')[1]}`;

export async function loadLiveConfig(orgId) {
  return (await (await kvs()).get(liveKey(orgId))) || null;
}

export async function saveLiveConfig(config) {
  await (await kvs()).set(liveKey(config.organization.id), config);
}

export async function deleteLive(orgId) {
  const store = await kvs();
  await Promise.all([store.delete(liveKey(orgId)), store.delete(stateKey(orgId))]);
}

export async function loadLiveState(orgId) {
  return (await (await kvs()).get(stateKey(orgId))) || {};
}

export async function updateLiveState(orgId, change) {
  const state = { ...(await loadLiveState(orgId)), ...change };
  await (await kvs()).set(stateKey(orgId), state);
  return state;
}

/** Every live report config, following cursors. */
export async function listLiveConfigs() {
  const { kvs: store, WhereConditions } = await import('@forge/kvs');
  const configs = [];
  let cursor;
  do {
    let query = store.query().where('key', WhereConditions.beginsWith('live-config:')).limit(50);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    configs.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return configs;
}

const SETTINGS_KEY = 'app-settings';

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...((await (await kvs()).get(SETTINGS_KEY)) || {}) };
}

export async function saveSettings(settings) {
  await (await kvs()).set(SETTINGS_KEY, settings);
  return settings;
}
