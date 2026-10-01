import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, chartBuckets, groupIssues, median, mergeGroups, tokenize, topShares } from '../src/analysis.js';

function issue(key, summary, created, description = '') {
  return {
    key,
    self: `https://example.atlassian.net/rest/api/3/issue/${key}`,
    fields: { summary, description, created, status: { name: 'Open' } },
  };
}

test('groups repeated requests and keeps ticket evidence', () => {
  const issues = [
    issue('SD-1', 'Crew vPOS cannot sign in', '2026-09-10T10:00:00Z'),
    issue('SD-2', 'Crew vPOS cannot sign in', '2026-09-11T10:00:00Z'),
    issue('SD-3', 'Printer paper order', '2026-09-12T10:00:00Z'),
  ];
  const groups = groupIssues(issues);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].tickets[0].key, 'SD-2');
  assert.equal(groups[0].tickets[0].url, 'https://example.atlassian.net/browse/SD-2');
  assert.equal(Object.hasOwn(groups[0], '_issues'), false);
});

test('compares the selected period with the preceding period', () => {
  const issues = [
    issue('SD-1', 'Crew vPOS cannot sign in', '2026-09-09T10:00:00Z'),
    issue('SD-2', 'Crew vPOS cannot sign in', '2026-09-10T10:00:00Z'),
    issue('SD-3', 'Crew vPOS cannot sign in', '2026-09-16T10:00:00Z'),
    issue('SD-4', 'Crew vPOS cannot sign in', '2026-09-17T10:00:00Z'),
  ];
  const report = buildReport(issues, '2026-09-16', '2026-09-22');
  assert.equal(report.currentCount, 2);
  assert.equal(report.previousCount, 2);
  assert.equal(report.changePercent, 0);
  assert.equal(report.groups[0].previousCount, 2);
});

// Real Ryanair Crew summaries: "RYR - <crew code> - <airport> - <problem>", with
// a templated description. Codes and template text must not create patterns.
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const template = (problem) => adf(`Crew ID and base are in the summary. Device: vPOS. Please describe the problem: ${problem}`);
const crewIssues = () => [
  ['RYR - COCCAM - CAG - P2P', 'p2p transfer failed'],
  ['RYR - KURVIK - PFO - DEVICE CRASHES', 'app closes during service'],
  ['RYR - ZAHAIU - OTP - RYR Connect Issue', 'ryr connect will not load'],
  ['RYR - CAUGAR - TSF', 'tsf'],
  ['RYR - TAJYOY - FCO - Sales lost all after turn around', 'sales disappeared after turnaround'],
  ['RYR - BJESSI - DUB - Sales', 'sales question'],
  ['RYR - DUB - PORCMI - VPOS NOT CHARGING', 'device will not charge'],
  ['RYR - SHEPAA - MAN - PIN PAD ISSUE', 'pin pad not pairing'],
  ['RYR - KARAST - STN - New pin pad', 'need a new pin pad'],
  ['RYR - LOPMAR - BGY - Pin pad not connecting', 'pin pad will not connect to vpos'],
  ['RYR - WESDAN - STN - pin pad faulty', 'pin pad keeps disconnecting'],
].map(([summary, problem], i) => issue(`SD-${100 + i}`, summary, `2026-09-${String(10 + (i % 9)).padStart(2, '0')}T10:00:00Z`, template(problem)));

test('shared prefixes, codes and templated descriptions do not create patterns', () => {
  const groups = groupIssues(crewIssues());
  const grouped = groups.flatMap((g) => g.tickets.map((t) => t.summary));
  for (const unrelated of ['RYR - KURVIK - PFO - DEVICE CRASHES', 'RYR - ZAHAIU - OTP - RYR Connect Issue', 'RYR - COCCAM - CAG - P2P', 'RYR - CAUGAR - TSF']) {
    assert.equal(grouped.includes(unrelated), false, `${unrelated} should not be in a pattern`);
  }
});

test('the real repeated problem is still found', () => {
  const groups = groupIssues(crewIssues());
  const pinPad = groups.find((g) => g.tickets.some((t) => t.summary.includes('PIN PAD ISSUE')));
  assert.ok(pinPad, 'pin pad tickets form a pattern');
  assert.equal(pinPad.count, 4);
  assert.match(pinPad.theme, /pin/i);
  assert.equal(pinPad.tickets.every((t) => /pin pad/i.test(t.summary)), true);
});

test('word forms and split compounds count as the same problem', () => {
  const issues = [
    ['RYR - EDI - ANTPER - vPOS Crashing', 'app crashing mid flight'],
    ['RYR - ALIMLA - SNN - vPOS crash', 'app crash on login'],
    ['RYR - STN - JONMAR - vPOS crashes', 'crashes every sector'],
    ['RYR - ARN - PONTCR - New pin pad', 'pin pad broken'],
    ['RYR - KELLIL - BFS - pinpad contactless', 'pinpad contactless not working'],
    ['RYR - DUB - MURSEA - Pinpad not pairing', 'pinpad will not pair'],
    ['RYR - BGY - FRIEPA - Missing Products', 'products missing from menu'],
    ['RYR - MAN - HALTOM - P2P Issue', 'p2p transfer stuck'],
  ].map(([summary, problem], i) => issue(`SD-${200 + i}`, summary, `2026-08-${String(10 + i).padStart(2, '0')}T10:00:00Z`, template(problem)));
  const groups = groupIssues(issues);
  const crash = groups.find((g) => g.tickets.some((t) => t.summary.endsWith('vPOS crash')));
  assert.equal(crash?.count, 3);
  assert.match(crash.theme, /crash/i);
  const pinPad = groups.find((g) => g.tickets.some((t) => t.summary.endsWith('New pin pad')));
  assert.equal(pinPad?.count, 3);
  assert.doesNotMatch(pinPad.theme, /pinpad pin|pin pad pin/i);
});

test('chart buckets are days up to 35 days and Monday weeks after, clipped to the period', () => {
  const days = chartBuckets('2026-09-01', '2026-09-30');
  assert.equal(days.length, 30);
  assert.deepEqual(days[0], { date: '2026-09-01', from: '2026-09-01', toExclusive: '2026-09-02' });
  const weeks = chartBuckets('2026-06-01', '2026-08-31'); // 1 June 2026 is a Monday
  assert.equal(weeks[0].date, '2026-06-01');
  assert.equal(weeks.at(-1).date, '2026-08-31');
  assert.equal(weeks.at(-1).toExclusive, '2026-09-01');
  const midWeek = chartBuckets('2026-06-03', '2026-08-31');
  assert.equal(midWeek[0].date, '2026-06-01');
  assert.equal(midWeek[0].from, '2026-06-03');
});

test('exact totals override a sample and pattern counts are scaled estimates', () => {
  const sample = [
    issue('SD-1', 'Crew vPOS cannot sign in', '2026-09-16T10:00:00Z'),
    issue('SD-2', 'Crew vPOS cannot sign in', '2026-09-17T10:00:00Z'),
    issue('SD-3', 'Printer paper order', '2026-09-18T10:00:00Z'),
    issue('SD-4', 'Printer toner order', '2026-09-10T10:00:00Z'),
  ];
  const report = buildReport(sample, '2026-09-16', '2026-09-22', { current: 30, previous: 10, timeSeries: [{ date: '2026-09-16', count: 30 }] });
  assert.equal(report.currentCount, 30);
  assert.equal(report.changePercent, 200);
  assert.equal(report.sampled, true);
  assert.equal(report.groups[0].sampleCount, 2);
  assert.equal(report.groups[0].count, 20);
  assert.equal(report.groups[0].estimated, true);
  assert.deepEqual(report.timeSeries, [{ date: '2026-09-16', count: 30 }]);
});

test('a pattern worded differently in each period still gets a trend', () => {
  const issues = [
    issue('SD-1', 'RYR - BOUZYA - STN - vPOS is Stuck', '2026-09-02T10:00:00Z'),
    issue('SD-2', 'RYR - HAMDBO - EDI - vPOS stuck', '2026-09-03T10:00:00Z'),
    issue('SD-3', 'RYR - JONMAR - DUB - Stuck on vPOS', '2026-09-04T10:00:00Z'),
    issue('SD-4', 'RYR - LOPMAR - BGY - vPOS stuck again', '2026-09-17T10:00:00Z'),
    issue('SD-5', 'RYR - WESDAN - MAN - stuck', '2026-09-18T10:00:00Z'),
    issue('SD-6', 'RYR - KARAST - STN - Printer paper', '2026-09-19T10:00:00Z'),
  ];
  const report = buildReport(issues, '2026-09-16', '2026-09-29');
  const stuck = report.groups.find((g) => /stuck/i.test(g.theme));
  assert.equal(stuck.count, 2);
  assert.equal(stuck.previousCount, 3);
  assert.equal(stuck.tickets.every((t) => ['SD-4', 'SD-5'].includes(t.key)), true);
});

test('code-only prefixes without spaces, // separators, dates and IDs are not problem words', () => {
  const words = (summary) => tokenize({ fields: { summary } }).summaryWords;
  assert.deepEqual(words('RYR-BOND-open barset'), ['open', 'barset', 'openbarset']);
  assert.deepEqual(words('RYR - OPEN BARSET // LIS // 07.08'), ['open', 'barset', 'openbarset']);
  assert.deepEqual(words('RYR - Reopen Barset - TNG Bond 19.07.2026'), ['reopen', 'barset', 'tng', 'bond', 'reopenbarset', 'barsettng', 'tngbond']);
  assert.equal(words('RYR - VNO - BOND - Needs to unlock a barset no.DUB24150 in VNO').includes('dub24150'), false);
  assert.deepEqual(words('RYR - P2P issue'), ['p2p']);
});

test('groups that end up with the same name are merged', () => {
  const issues = [
    issue('SD-1', 'RYR - BOH - BOND - OPEN BARSET', '2026-09-16T10:00:00Z'),
    issue('SD-2', 'RYR - STN - BOND - OPEN BARSET', '2026-09-16T11:00:00Z'),
    issue('SD-3', 'RYR - Open barset please', '2026-09-17T10:00:00Z'),
    issue('SD-4', 'RYR - Open barset please now', '2026-09-17T11:00:00Z'),
  ];
  const report = buildReport(issues, '2026-09-16', '2026-09-22');
  const open = report.groups.filter((g) => /^open barset$/i.test(g.theme));
  assert.equal(open.length, 1);
  assert.equal(open[0].count, 4);
});

test('breakdowns count each field value per period, and patterns keep their own value counts', () => {
  const at = (key, summary, created, base, devices) => ({ ...issue(key, summary, created), dims: { base: [base], device: devices } });
  const issues = [
    at('SD-1', 'RYR - vPOS stuck', '2026-09-16T10:00:00Z', 'STN', ['vPOS']),
    at('SD-2', 'RYR - vPOS stuck again', '2026-09-17T10:00:00Z', 'STN', ['vPOS']),
    at('SD-3', 'RYR - vPOS stuck on loading', '2026-09-18T10:00:00Z', 'DUB', ['vPOS', 'Pin pad']),
    at('SD-4', 'RYR - Printer paper', '2026-09-19T10:00:00Z', 'DUB', ['Printer']),
    at('SD-5', 'RYR - vPOS stuck', '2026-09-10T10:00:00Z', 'DUB', ['vPOS']),
  ];
  const breakdowns = [{ id: 'base', label: 'Base' }, { id: 'device', label: 'Device type' }];
  const report = buildReport(issues, '2026-09-16', '2026-09-22', null, { breakdowns });
  const base = report.breakdowns.find((b) => b.id === 'base');
  assert.deepEqual(base.values.map(({ value, count, previousCount, change }) => ({ value, count, previousCount, change })), [
    { value: 'STN', count: 2, previousCount: 0, change: 2 },
    { value: 'DUB', count: 2, previousCount: 1, change: 1 },
  ]);
  assert.equal(report.breakdowns[1].values[0].value, 'vPOS');
  const stuck = report.groups.find((g) => /stuck/i.test(g.theme));
  assert.deepEqual(topShares(stuck, 'base'), [{ value: 'STN', share: 67 }, { value: 'DUB', share: 33 }]);
});

test('merging patterns adds up their field value counts', () => {
  const a = { id: 'a', theme: 'x', count: 2, previousCount: 0, sampleCount: 2, tickets: [], dimCounts: { base: { STN: 2 } } };
  const b = { id: 'b', theme: 'x', count: 3, previousCount: 1, sampleCount: 3, tickets: [], dimCounts: { base: { STN: 1, DUB: 2 } } };
  const [merged] = mergeGroups([a, b], (g) => g.theme);
  assert.deepEqual(merged.dimCounts, { base: { STN: 3, DUB: 2 } });
  assert.deepEqual(topShares(merged, 'base'), [{ value: 'STN', share: 60 }, { value: 'DUB', share: 40 }]);
  assert.deepEqual(a.dimCounts, { base: { STN: 2 } });
});

test('patterns need the configured minimum of tickets', () => {
  const issues = [
    issue('SD-1', 'Crew vPOS cannot sign in', '2026-09-16T10:00:00Z'),
    issue('SD-2', 'Crew vPOS cannot sign in', '2026-09-17T10:00:00Z'),
    issue('SD-3', 'Printer paper order', '2026-09-18T10:00:00Z'),
    issue('SD-4', 'Printer paper order', '2026-09-18T11:00:00Z'),
    issue('SD-5', 'Printer paper order', '2026-09-18T12:00:00Z'),
  ];
  assert.equal(buildReport(issues, '2026-09-16', '2026-09-22').groups.length, 2);
  const three = buildReport(issues, '2026-09-16', '2026-09-22', null, { minPatternSize: 3 });
  assert.deepEqual(three.groups.map((g) => g.count), [3]);
  assert.equal(three.minPatternSize, 3);
});

test('resolution time: median hours and share still open, overall, per pattern and per value', () => {
  const at = (key, summary, created, resolved, base) => ({
    key, self: `https://x.atlassian.net/rest/api/3/issue/${key}`, dims: { base: [base] },
    fields: { summary, created, resolutiondate: resolved, status: { name: resolved ? 'Resolved' : 'Open' } },
  });
  const issues = [
    at('SD-1', 'vPOS stuck', '2026-09-16T10:00:00Z', '2026-09-16T12:00:00Z', 'STN'),
    at('SD-2', 'vPOS stuck', '2026-09-17T10:00:00Z', '2026-09-17T16:00:00Z', 'STN'),
    at('SD-3', 'vPOS stuck', '2026-09-18T10:00:00Z', null, 'DUB'),
    at('SD-4', 'Printer paper', '2026-09-18T10:00:00Z', '2026-09-20T10:00:00Z', 'DUB'),
  ];
  const report = buildReport(issues, '2026-09-16', '2026-09-22', null, { breakdowns: [{ id: 'base', label: 'Base' }] });
  assert.deepEqual(report.resolution, { medianHours: 6, openShare: 25 });
  const stuck = report.groups.find((g) => /stuck/i.test(g.theme));
  assert.deepEqual(stuck.resolvedHours.sort((a, b) => a - b), [2, 6]);
  assert.equal(stuck.openCount, 1);
  assert.deepEqual(stuck.keys.sort(), ['SD-1', 'SD-2', 'SD-3']);
  const stn = report.breakdowns[0].values.find((v) => v.value === 'STN');
  assert.deepEqual([stn.medianHours, stn.openShare], [4, 0]);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([]), null);
});

test('handles Jira rich text descriptions', () => {
  const issues = [
    issue('SD-1', 'Network issue at gate', '2026-09-10T10:00:00Z', { content: [{ text: 'airport wifi disconnected' }] }),
    issue('SD-2', 'Network issue at gate', '2026-09-11T10:00:00Z', { content: [{ text: 'airport wifi disconnected' }] }),
  ];
  assert.equal(groupIssues(issues).length, 1);
});
