// Live portal reports: an agent approves the issue list and summary once; the
// app then refreshes the numbers on a schedule, or when a customer asks.
// Pure logic here; the Forge handlers are in liveJobs.js.
import { presetRange, PRESETS } from './dates.js';
import { LIVE_SCHEDULES } from './publish.js';

const HOUR = 3600000;
const INTERVAL = { daily: 23 * HOUR, weekly: 7 * 24 * HOUR - HOUR };
const QUEUED_WINDOW = 30 * 60000; // don't queue the same report twice within this
export const CUSTOMER_REFRESH_EVERY = HOUR;
const MAX_APPROVED = 15;
const UNREVIEWED_MIN = 3;

const clip = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);

/** Live settings from the agent's publish, bounded. schedule 'off' means none. */
export function liveConfigFrom(input, { organization, projects = [], now = new Date() }) {
  const schedule = LIVE_SCHEDULES.includes(input?.schedule) ? input.schedule : 'off';
  if (schedule === 'off') return null;
  const preset = PRESETS.some((p) => p.key === input?.preset) ? input.preset : 'last-30';
  return {
    organization: { id: String(organization.id), name: clip(organization.name, 120) },
    projects: (Array.isArray(projects) ? projects : []).map((p) => clip(p, 50)).filter(Boolean).slice(0, 10),
    preset,
    schedule,
    approved: (Array.isArray(input?.approved) ? input.approved : [])
      .map((a) => ({ title: clip(a?.title, 80), summary: clip(a?.summary, 300) }))
      .filter((a) => a.title)
      .slice(0, MAX_APPROVED),
    overview: clip(input?.overview, 1500),
    actions: (Array.isArray(input?.actions) ? input.actions : []).map((a) => clip(a, 240)).filter(Boolean).slice(0, 5),
    summaryWrittenAt: now.toISOString(),
    publishedAt: now.toISOString(),
  };
}

/** The rolling period for a refresh, e.g. the last 30 days up to today. */
export function livePeriod(config, now = new Date()) {
  return presetRange(config.preset, now) || presetRange('last-30', now);
}

export function isDue(config, state, now = Date.now()) {
  if (!config || !LIVE_SCHEDULES.includes(config.schedule)) return false;
  if (state?.queuedAt && now - Date.parse(state.queuedAt) < QUEUED_WINDOW) return false;
  const last = state?.lastRefreshAt ? Date.parse(state.lastRefreshAt) : 0;
  return now - last >= INTERVAL[config.schedule];
}

/** When a customer may next ask for a refresh (ms), or 0 if now. */
export function nextCustomerRefresh(state, now = Date.now()) {
  const last = Math.max(state?.requestedAt ? Date.parse(state.requestedAt) : 0, state?.queuedAt ? Date.parse(state.queuedAt) : 0);
  const next = last + CUSTOMER_REFRESH_EVERY;
  return next > now ? next : 0;
}

/**
 * Counts per approved issue from a fresh report. `assignments[i]` is the
 * approved index for report.groups[i], or -1. "Other requests" is the exact
 * remainder, so the numbers always add up to the period total.
 */
export function liveCounts(report, approved, assignments) {
  const sums = approved.map(() => ({ count: 0, previousCount: 0 }));
  const unassigned = [];
  (report.groups || []).forEach((group, i) => {
    const target = assignments[i] ?? -1;
    if (target >= 0 && target < approved.length) {
      sums[target].count += group.count;
      sums[target].previousCount += group.previousCount;
    } else unassigned.push(group);
  });
  const estimated = Boolean(report.sampled);
  const patterns = approved.map((a, i) => ({ ...a, ...sums[i], estimated }));
  const assignedNow = sums.reduce((s, x) => s + x.count, 0);
  const assignedBefore = sums.reduce((s, x) => s + x.previousCount, 0);
  const other = { title: 'Other requests', summary: 'Requests that don’t fit the issues above.', count: Math.max(0, report.currentCount - assignedNow), previousCount: Math.max(0, report.previousCount - assignedBefore), estimated };
  return {
    patterns: other.count > 0 ? [...patterns, other] : patterns,
    unreviewed: unassigned.filter((g) => g.count >= UNREVIEWED_MIN).sort((a, b) => b.count - a.count).slice(0, 5).map((g) => ({ title: g.theme, count: g.count })),
  };
}

/** Input for snapshotFrom() after a refresh: fresh numbers, the agent's words. */
export function refreshedSnapshotInput(config, report, counts, now = new Date()) {
  return {
    organization: config.organization,
    period: { from: report.startDate, to: report.endDate },
    totals: { current: report.currentCount, previous: report.previousCount },
    timeSeries: report.timeSeries,
    patterns: counts.patterns,
    overview: config.overview,
    actions: config.actions,
    publishedAt: config.publishedAt,
    summaryWrittenAt: config.summaryWrittenAt,
    refreshedAt: now.toISOString(),
    live: { preset: config.preset, schedule: config.schedule },
    unreviewed: counts.unreviewed,
  };
}

/** Fallback when the AI is unavailable: match a group to an approved title by shared words. */
export function assignByWords(groups, approved) {
  const words = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const targets = approved.map((a) => words(a.title));
  return groups.map((g) => {
    const w = words(g.theme);
    let best = -1;
    let bestScore = 0.5;
    targets.forEach((t, i) => {
      const shared = [...w].filter((x) => t.has(x)).length;
      const score = shared / Math.max(1, Math.min(w.size, t.size));
      if (score >= bestScore) { best = i; bestScore = score; }
    });
    return best;
  });
}
