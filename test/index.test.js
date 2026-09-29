import test from 'node:test';
import assert from 'node:assert/strict';

test('resolver module loads and exports a handler', async () => {
  const { handler } = await import('../src/index.js');
  assert.equal(typeof handler, 'function');
});
