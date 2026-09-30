import test from 'node:test';
import assert from 'node:assert/strict';
import { aiInput, parseInsights, summarise } from '../src/ai.js';

const report = {
  organization: 'Ryanair Crew', startDate: '2026-06-01', endDate: '2026-08-31', currentCount: 6793, previousCount: 4484,
  groups: Array.from({ length: 15 }, (_, i) => ({
    theme: `Theme ${i}`, count: 100 - i, previousCount: 10,
    tickets: Array.from({ length: 10 }, (_, j) => ({ summary: `RYR - CODE${j} - STN - problem ${i} ${'x'.repeat(300)}` })),
  })),
};

test('AI input is bounded: 12 patterns, 8 examples, clipped text', () => {
  const input = aiInput(report);
  assert.equal(input.patterns.length, 12);
  assert.equal(input.patterns[0].exampleSummaries.length, 8);
  assert.equal(input.patterns[0].exampleSummaries[0].length <= 200, true);
  assert.equal(input.tickets, 6793);
  assert.equal(input.patternCountsAreEstimates, false);
  assert.equal(aiInput({ ...report, sampled: true }).patternCountsAreEstimates, true);
});

test('model output is validated: bad indexes and duplicates dropped, text bounded', () => {
  const parsed = parseInsights({
    overview: 'o'.repeat(5000),
    patterns: [
      { index: 0, title: 'vPOS app freezes', summary: 's', coherent: true },
      { index: 0, title: 'duplicate', summary: 's', coherent: true },
      { index: 99, title: 'out of range', summary: 's', coherent: true },
      { index: 1, title: '', summary: 'no title', coherent: true },
      { index: 2, title: 'Mixed bag', summary: 's', coherent: false },
    ],
    actions: ['a', 'b', 'c', 'd'],
  }, 12);
  assert.equal(parsed.overview.length, 1200);
  assert.deepEqual(parsed.patterns.map((p) => p.index), [0, 2]);
  assert.equal(parsed.patterns[1].coherent, false);
  assert.equal(parsed.actions.length, 3);
  assert.throws(() => parseInsights(null, 3));
});

test('summarise forces the tool, reads its arguments and falls back to the next model', async () => {
  const calls = [];
  const chatFn = async (prompt) => {
    calls.push(prompt);
    if (prompt.model === 'unavailable') throw new Error('Forge LLMs model not allowed');
    return { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'report_insights', arguments: { overview: 'Volume up 51%.', patterns: [{ index: 0, title: 'vPOS freezes', summary: 's', coherent: true }], actions: ['Check release 3.2'] } } }] } }] };
  };
  const result = await summarise(report, { chatFn, models: ['unavailable', 'claude-sonnet-5'] });
  assert.equal(result.model, 'claude-sonnet-5');
  assert.equal(result.patterns[0].title, 'vPOS freezes');
  assert.equal(calls[1].tool_choice.function.name, 'report_insights');
  assert.equal('temperature' in calls[1], false);
});

test('summarise stops on errors that are not about the model', async () => {
  let count = 0;
  const chatFn = async () => { count += 1; throw new Error('Rate limited'); };
  await assert.rejects(summarise(report, { chatFn, models: ['a', 'b'] }), /Rate limited/);
  assert.equal(count, 1);
});
