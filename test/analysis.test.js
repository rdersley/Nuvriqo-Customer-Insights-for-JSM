import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, chartBuckets, groupIssues } from '../src/analysis.js';

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

test('handles Jira rich text descriptions', () => {
  const issues = [
    issue('SD-1', 'Network issue at gate', '2026-09-10T10:00:00Z', { content: [{ text: 'airport wifi disconnected' }] }),
    issue('SD-2', 'Network issue at gate', '2026-09-11T10:00:00Z', { content: [{ text: 'airport wifi disconnected' }] }),
  ];
  assert.equal(groupIssues(issues).length, 1);
});
