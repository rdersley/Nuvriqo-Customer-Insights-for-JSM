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

const SETTINGS_KEY = 'app-settings';

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...((await (await kvs()).get(SETTINGS_KEY)) || {}) };
}

export async function saveSettings(settings) {
  await (await kvs()).set(SETTINGS_KEY, settings);
  return settings;
}
