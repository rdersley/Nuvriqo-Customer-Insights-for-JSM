// Reports published to the customer portal. An agent reviews a report and
// publishes a snapshot for one organisation; members of that organisation see
// it from the portal user menu. Snapshots hold themes and counts only, never
// ticket keys, titles or who raised them.

export const MAX_PATTERNS = 15;
const MAX_POINTS = 60;
const ORG_ID = /^\d{1,18}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const LIVE_SCHEDULES = ['daily', 'weekly'];

const clip = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
const count = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);

export function reportKey(orgId) {
  if (!ORG_ID.test(String(orgId))) throw new Error('Invalid organisation.');
  return `published-report:${orgId}`;
}

/** Validates and bounds what an agent submits. Anything not listed is dropped. */
export function snapshotFrom(input, { publishedBy, now = new Date() } = {}) {
  const orgId = String(input?.organization?.id ?? '');
  reportKey(orgId);
  const from = String(input?.period?.from ?? '');
  const to = String(input?.period?.to ?? '');
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) throw new Error('Invalid period.');
  const patterns = (Array.isArray(input?.patterns) ? input.patterns : [])
    .map((p) => ({
      title: clip(p?.title, 80),
      summary: clip(p?.summary, 300),
      count: count(p?.count),
      previousCount: count(p?.previousCount),
      estimated: Boolean(p?.estimated),
    }))
    .filter((p) => p.title)
    .slice(0, MAX_PATTERNS);
  const current = count(input?.totals?.current);
  const previous = count(input?.totals?.previous);
  return {
    organization: { id: orgId, name: clip(input?.organization?.name, 120) },
    period: { from, to },
    totals: { current, previous, changePercent: previous ? Math.round(((current - previous) / previous) * 100) : null },
    timeSeries: (Array.isArray(input?.timeSeries) ? input.timeSeries : [])
      .filter((p) => ISO_DATE.test(String(p?.date)))
      .slice(0, MAX_POINTS)
      .map((p) => ({ date: String(p.date), count: count(p.count) })),
    patterns,
    overview: clip(input?.overview, 1500),
    actions: (Array.isArray(input?.actions) ? input.actions : []).map((a) => clip(a, 240)).filter(Boolean).slice(0, 5),
    publishedAt: ISO_TIME.test(String(input?.publishedAt)) ? String(input.publishedAt) : now.toISOString(),
    publishedBy: String(publishedBy || ''),
    // Live reports: the agent's summary keeps its date; numbers refresh.
    summaryWrittenAt: ISO_TIME.test(String(input?.summaryWrittenAt)) ? String(input.summaryWrittenAt) : now.toISOString(),
    refreshedAt: ISO_TIME.test(String(input?.refreshedAt)) ? String(input.refreshedAt) : now.toISOString(),
    live: input?.live && LIVE_SCHEDULES.includes(input.live.schedule) ? { preset: clip(input.live.preset, 30), schedule: input.live.schedule } : null,
    // Agent-only: patterns that fit no approved issue yet.
    unreviewed: (Array.isArray(input?.unreviewed) ? input.unreviewed : []).slice(0, 10)
      .map((u) => ({ title: clip(u?.title, 80), count: count(u?.count) })).filter((u) => u.title),
  };
}

/** What a customer sees: no publisher and no unreviewed agent notes. */
export function portalView(snapshot) {
  if (!snapshot) return null;
  const { publishedBy, unreviewed, ...visible } = snapshot;
  return visible;
}
