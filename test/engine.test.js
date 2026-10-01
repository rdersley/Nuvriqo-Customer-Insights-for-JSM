import test from 'node:test';
import assert from 'node:assert/strict';
import { requestWithRetry, retryDelay } from '../src/engine.js';

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

test('Retry-After is honoured but capped', () => {
  assert.equal(retryDelay(response(429, '3'), 0), 3000);
  assert.equal(retryDelay(response(429, '120'), 0), 8000);
  assert.equal(retryDelay(response(429, null), 2), 4000);
});
