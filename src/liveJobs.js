// Forge handlers for live portal reports and spike alerts.
// - scheduler: hourly trigger; queues the reports and alert checks that are due.
// - consumer: queue job (up to 15 minutes); refreshes or checks one organisation.
// Background jobs have no signed-in user, so Jira is read as the app. Only
// counts for that organisation's own tickets are stored; customers never get
// ticket details.
import { runAnalysis, parseQuery } from './engine.js';
import { assignToApproved } from './ai.js';
import { assignByWords, isDue, liveCounts, livePeriod, refreshedSnapshotInput } from './live.js';
import { snapshotFrom } from './publish.js';
import * as storage from './storage.js';
import { checkOrganisation, isCheckDue } from './alerts.js';

const { deleteAlert, listAlerts, listLiveConfigs, loadAlertState, loadLiveConfig, loadLiveState, loadSettings, saveAlertState, saveReport, updateLiveState } = storage;
const ALERT_DAYS_KEPT = 30;

const QUEUE = 'live-report-refresh';
const queue = async () => new (await import('@forge/events')).Queue({ key: QUEUE });

/** Queues a refresh for one organisation; `reason` is logged. */
export async function queueRefresh(orgId, reason) {
  await (await queue()).push({ body: { orgId: String(orgId), reason } });
  await updateLiveState(orgId, { queuedAt: new Date().toISOString(), queuedFor: reason });
  console.log(`live: queued ${orgId} (${reason})`);
}

export async function refreshLiveReport(orgId) {
  const config = await loadLiveConfig(orgId);
  if (!config) return { skipped: 'no live report' };
  const startedAt = Date.now();
  try {
    const { from, to } = livePeriod(config);
    const query = parseQuery({ organization: config.organization, startDate: from, endDate: to, projects: config.projects });
    const { breakdowns, minPatternSize, placeholders } = await loadSettings();
    const report = await runAnalysis(query, { breakdowns, minPatternSize, placeholders, mode: 'app', budgetMs: 240000 });
    let assignments;
    try {
      ({ assignments } = await assignToApproved(report, config.approved));
    } catch (error) {
      console.log(`live: AI assignment failed for ${orgId}, using word matching: ${error.message}`);
      assignments = assignByWords(report.groups, config.approved);
    }
    const counts = liveCounts(report, config.approved, assignments);
    const snapshot = snapshotFrom(refreshedSnapshotInput(config, report, counts), { publishedBy: 'live-refresh' });
    // Don't overwrite if the agent removed or replaced the live report meanwhile.
    const current = await loadLiveConfig(orgId);
    if (!current || current.publishedAt !== config.publishedAt) return { skipped: 'changed while refreshing' };
    await saveReport(snapshot);
    await updateLiveState(orgId, { lastRefreshAt: snapshot.refreshedAt, lastError: null, queuedAt: null });
    console.log(`live: refreshed ${orgId} in ${Date.now() - startedAt}ms, ${counts.unreviewed.length} unreviewed`);
    return { refreshed: true };
  } catch (error) {
    await updateLiveState(orgId, { lastError: String(error.message || error).slice(0, 300), lastErrorAt: new Date().toISOString(), queuedAt: null });
    console.error(`live: refresh failed for ${orgId}: ${error.message}`);
    return { failed: true };
  }
}

export const scheduler = async () => {
  const configs = await listLiveConfigs();
  let queued = 0;
  for (const config of configs) {
    const state = await loadLiveState(config.organization.id);
    if (isDue(config, state)) { await queueRefresh(config.organization.id, 'schedule'); queued += 1; }
  }
  console.log(`live: scheduler checked ${configs.length}, queued ${queued}`);
  await scheduleAlerts();
};

/** Queues a spike check for one organisation (the scheduler, or "Check now"). */
export async function queueAlertCheck(orgId, state = null) {
  await (await queue()).push({ body: { type: 'alerts', orgId: String(orgId) } });
  await saveAlertState(orgId, { ...(state || await loadAlertState(orgId)), queuedAt: new Date().toISOString() });
}

/** Queues the daily spike check for watched organisations, and drops old alerts. */
async function scheduleAlerts() {
  const { alerts } = await loadSettings();
  let queued = 0;
  if (alerts?.enabled) {
    for (const organization of alerts.organizations) {
      const state = await loadAlertState(organization.id);
      const recentlyQueued = state.queuedAt && Date.now() - Date.parse(state.queuedAt) < 3600000;
      if (!isCheckDue(state) || recentlyQueued) continue;
      await queueAlertCheck(organization.id, state);
      queued += 1;
    }
  }
  const cutoff = Date.now() - ALERT_DAYS_KEPT * 86400000;
  const old = (await listAlerts()).filter((a) => Date.parse(a.createdAt) < cutoff);
  for (const alert of old) await deleteAlert(alert.id);
  console.log(`alerts: scheduler queued ${queued}, removed ${old.length} old`);
}

export const consumer = async (event) => {
  const orgId = event?.body?.orgId;
  if (!/^\d{1,18}$/.test(String(orgId))) return;
  if (event?.body?.type === 'alerts') await checkOrganisation(orgId, storage);
  else await refreshLiveReport(orgId);
};
