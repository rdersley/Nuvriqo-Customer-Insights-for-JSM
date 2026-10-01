import test from 'node:test';
import assert from 'node:assert/strict';
import { filterFor, parseQuery, requestWithRetry, retryDelay } from '../src/engine.js';

const response = (status, retryAfter) => ({ status, headers: { get: (h) => (h === 'Retry-After' ? retryAfter : null) } });

test('rate limits and brief outages are retried, other answers are not', async () => {
  const waits = [];
  const replies = [response(429), response(503), response(200)];
  const result = await requestWithRetry(async () => replies.shift(), { wait: async (ms) => { waits.push(ms); } });
  assert.equal(result.status, 200);
  assert.deepEqual(waits, [1000, 2000]);

  let calls = 0;
  const notFound = await requestWithRetry(async () => { calls += 1; return response(404); }, { wait: async () => {} });
  assert.equal(notFound.status, 404);
  assert.equal(calls, 1);
});

test('gives up after the last retry and returns the final answer', async () => {
  let calls = 0;
  const result = await requestWithRetry(async () => { calls += 1; return response(429); }, { retries: 3, wait: async () => {} });
  assert.equal(result.status, 429);
  assert.equal(calls, 4);
});

test('drill-down filters accept configured fields only and the JQL is built on the server', () => {
  const breakdowns = [{ id: 'customfield_10100', label: 'Base', kind: 'option' }];
  const filter = filterFor({ id: 'customfield_10100', value: 'STN' }, breakdowns);
  assert.deepEqual(filter, { id: 'customfield_10100', label: 'Base', value: 'STN', clause: 'cf[10100] = "STN"' });
  const query = parseQuery({ organization: { name: 'Ryanair Crew' }, startDate: '2026-09-01', endDate: '2026-09-30' }, filter);
  assert.equal(query.between('2026-09-01', '2026-10-01'), 'organizations = "Ryanair Crew" AND created >= "2026-09-01" AND created < "2026-10-01" AND cf[10100] = "STN"');
  assert.throws(() => filterFor({ id: 'customfield_99999', value: 'x' }, breakdowns), /isn’t available/);
  assert.throws(() => filterFor({ id: 'customfield_10100', value: '' }, breakdowns), /isn’t available/);
  assert.equal(filterFor(null, breakdowns), null);
  assert.equal(filterFor({ id: 'customfield_10100', value: 'STN" OR project = X' }, breakdowns).clause, 'cf[10100] = "STN\\" OR project = X"');
});

test('Retry-After is honoured but capped', () => {
  assert.equal(retryDelay(response(429, '3'), 0), 3000);
  assert.equal(retryDelay(response(429, '120'), 0), 8000);
  assert.equal(retryDelay(response(429, null), 2), 4000);
});
