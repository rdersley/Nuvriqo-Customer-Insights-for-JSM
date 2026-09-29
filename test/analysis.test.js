import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, groupIssues } from '../src/analysis.js';

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

test('handles Jira rich text descriptions', () => {
  const issues = [
    issue('SD-1', 'Network issue at gate', '2026-09-10T10:00:00Z', { content: [{ text: 'airport wifi disconnected' }] }),
    issue('SD-2', 'Network issue at gate', '2026-09-11T10:00:00Z', { content: [{ text: 'airport wifi disconnected' }] }),
  ];
  assert.equal(groupIssues(issues).length, 1);
});
