import test from 'node:test';
import assert from 'node:assert/strict';
import { assignByWords, isDue, liveConfigFrom, liveCounts, livePeriod, nextCustomerRefresh, refreshedSnapshotInput } from '../src/live.js';
import { parseAssignments, assignToApproved } from '../src/ai.js';
import { portalView, snapshotFrom } from '../src/publish.js';

const now = new Date('2026-09-30T12:00:00Z');
const org = { id: '42', name: 'Ryanair Crew' };
const approved = [{ title: 'Open a barset', summary: 'Barset open requests.' }, { title: 'vPOS app freezes', summary: '' }];

test('live config: schedule off means none; bounded and defaulted', () => {
  assert.equal(liveConfigFrom({ schedule: 'off' }, { organization: org, now }), null);
  const config = liveConfigFrom({ schedule: 'weekly', preset: 'bogus', approved: [...approved, { title: '' }], overview: 'Summary.', actions: ['Do x'] }, { organization: org, projects: ['SD'], now });
  assert.equal(config.preset, 'last-30');
  assert.equal(config.approved.length, 2);
  assert.equal(config.summaryWrittenAt, '2026-09-30T12:00:00.000Z');
  assert.deepEqual(config.projects, ['SD']);
  assert.deepEqual(livePeriod({ preset: 'last-month' }, new Date(2026, 8, 30)), { from: '2026-08-01', to: '2026-08-31' });
});

test('refreshes are due by schedule and never queued twice', () => {
  const daily = { schedule: 'daily' };
  assert.equal(isDue(daily, null, now.getTime()), true);
  assert.equal(isDue(daily, { lastRefreshAt: '2026-09-30T02:00:00Z' }, now.getTime()), false);
  assert.equal(isDue(daily, { lastRefreshAt: '2026-09-29T11:00:00Z' }, now.getTime()), true);
  assert.equal(isDue(daily, { lastRefreshAt: '2026-09-29T11:00:00Z', queuedAt: '2026-09-30T11:50:00Z' }, now.getTime()), false);
  assert.equal(isDue({ schedule: 'weekly' }, { lastRefreshAt: '2026-09-26T12:00:00Z' }, now.getTime()), false);
  assert.equal(isDue({ schedule: 'off' }, null, now.getTime()), false);
});

test('customers can refresh at most once an hour', () => {
  assert.equal(nextCustomerRefresh(null, now.getTime()), 0);
  assert.equal(nextCustomerRefresh({ requestedAt: '2026-09-30T11:30:00Z' }, now.getTime()), Date.parse('2026-09-30T12:30:00Z'));
  assert.equal(nextCustomerRefresh({ requestedAt: '2026-09-30T10:30:00Z' }, now.getTime()), 0);
});

test('counts per approved issue add up, with Other as the exact remainder and new groups flagged for agents', () => {
  const report = {
    currentCount: 100, previousCount: 80, sampled: false,
    groups: [
      { theme: 'Open barset', count: 30, previousCount: 20 },
      { theme: 'Opening breset', count: 5, previousCount: 2 },
      { theme: 'vPOS stuck', count: 20, previousCount: 25 },
      { theme: 'New printer paper', count: 6, previousCount: 0 },
      { theme: 'Tiny', count: 2, previousCount: 0 },
    ],
  };
  const { patterns, unreviewed } = liveCounts(report, approved, [0, 0, 1, -1, -1]);
  assert.deepEqual(patterns.map((p) => [p.title, p.count, p.previousCount]), [
    ['Open a barset', 35, 22], ['vPOS app freezes', 20, 25], ['Other requests', 45, 33],
  ]);
  assert.equal(patterns.reduce((s, p) => s + p.count, 0), 100);
  assert.deepEqual(unreviewed, [{ title: 'New printer paper', count: 6 }]);
});

test('a refreshed snapshot keeps the agent summary and its date, and hides agent notes from customers', () => {
  const config = liveConfigFrom({ schedule: 'daily', preset: 'last-30', approved, overview: 'Barsets are the main issue.', actions: ['Automate barsets'] }, { organization: org, now: new Date('2026-09-12T09:00:00Z') });
  const report = { startDate: '2026-09-01', endDate: '2026-09-30', currentCount: 50, previousCount: 40, timeSeries: [], groups: [] };
  const snap = snapshotFrom(refreshedSnapshotInput(config, report, { patterns: [{ title: 'Open a barset', count: 10 }], unreviewed: [{ title: 'Printer paper', count: 4 }] }, now), { publishedBy: 'acc' });
  assert.equal(snap.overview, 'Barsets are the main issue.');
  assert.equal(snap.summaryWrittenAt, '2026-09-12T09:00:00.000Z');
  assert.equal(snap.refreshedAt, '2026-09-30T12:00:00.000Z');
  assert.deepEqual(snap.live, { preset: 'last-30', schedule: 'daily' });
  assert.deepEqual(snap.unreviewed, [{ title: 'Printer paper', count: 4 }]);
  const view = portalView(snap);
  assert.equal('unreviewed' in view, false);
  assert.equal('publishedBy' in view, false);
});

test('AI assignments are validated and the tool is forced; word matching is the fallback', async () => {
  assert.deepEqual(parseAssignments({ assignments: [{ index: 0, issue: 1 }, { index: 0, issue: 0 }, { index: 1, issue: 9 }, { index: 5, issue: 0 }] }, 3, 2), [1, -1, -1]);
  let prompt;
  const chatFn = async (p) => { prompt = p; return { choices: [{ message: { content: '', tool_calls: [{ function: { name: 'assign_groups', arguments: { assignments: [{ index: 0, issue: 0 }] } } }] } }] }; };
  const report = { groups: [{ theme: 'Open barset', tickets: [] }, { theme: 'Other thing', tickets: [] }] };
  const result = await assignToApproved(report, approved, { chatFn, models: ['claude-sonnet-5'] });
  assert.equal(prompt.tool_choice.function.name, 'assign_groups');
  assert.deepEqual(result.assignments, [0, -1]);
  assert.deepEqual(assignByWords([{ theme: 'Open barset' }, { theme: 'vPOS app freezing' }, { theme: 'Printer' }], approved), [0, 1, -1]);
});
