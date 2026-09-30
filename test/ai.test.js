import test from 'node:test';
import assert from 'node:assert/strict';
import { aiInput, parseInsights, parseMerges, suggestMerges, summarise } from '../src/ai.js';
import { applyMerges } from '../src/analysis.js';

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

// The barset groups from the Ryanair Crew screenshot.
const barsetGroups = [
  ['Open barset', 22, 11], ['Open barset', 7, 9], ['Crl bond open flight', 4, 3], ['Needs unlock barset vno', 3, 2],
  ['Ryanair vpack log ins', 3, 2], ['Open barsets p01', 3, 0], ['Opening breset', 3, 0], ['Broken tablets', 2, 0],
].map(([theme, count, previousCount], i) => ({
  id: `g${i}`, theme, count, previousCount, sampleCount: count, estimated: false,
  tickets: [{ key: `SD-${i}`, summary: `RYR - ${theme}`, created: `2026-08-${String(10 + i).padStart(2, '0')}T10:00:00Z`, status: 'Open', url: '#' }],
}));

test('merges are validated: in range, each group once, two or more per issue', () => {
  const merges = parseMerges({ issues: [
    { title: 'Open a barset', members: [0, 1, 5, 6, 3, 99] },
    { title: 'Duplicate use', members: [0, 7] },
    { title: 'Alone', members: [4] },
    { title: '', members: [2, 7] },
  ] }, 8);
  assert.deepEqual(merges, [{ title: 'Open a barset', members: [0, 1, 5, 6, 3] }]);
});

test('applying merges adds up counts and keeps other groups as they are', () => {
  const merged = applyMerges(barsetGroups, [{ title: 'Open a barset', members: [0, 1, 3, 5, 6] }]);
  assert.equal(merged[0].theme, 'Open a barset');
  assert.equal(merged[0].count, 22 + 7 + 3 + 3 + 3);
  assert.equal(merged[0].previousCount, 11 + 9 + 2);
  assert.equal(merged[0].change, 38 - 22);
  assert.deepEqual(merged[0].mergedFrom, ['Open barset', 'Open barset', 'Needs unlock barset vno', 'Open barsets p01', 'Opening breset']);
  assert.equal(merged.length, 4);
  assert.equal(merged.find((g) => g.theme === 'Broken tablets').count, 2);
  assert.equal(merged.reduce((sum, g) => sum + g.count, 0), barsetGroups.reduce((sum, g) => sum + g.count, 0));
});

test('suggestMerges forces the merge tool and sends bounded examples', async () => {
  let prompt;
  const chatFn = async (p) => {
    prompt = p;
    return { choices: [{ message: { content: '', tool_calls: [{ function: { name: 'merge_groups', arguments: { issues: [{ title: 'Open a barset', members: [0, 1, 6] }] } } }] } }] };
  };
  const result = await suggestMerges({ groups: barsetGroups }, { chatFn, models: ['claude-sonnet-5'] });
  assert.equal(prompt.tool_choice.function.name, 'merge_groups');
  assert.deepEqual(result.merges, [{ title: 'Open a barset', members: [0, 1, 6] }]);
  assert.equal(JSON.parse(prompt.messages[1].content.split('\n').slice(1).join('\n')).length, 8);
});

test('summarise stops on errors that are not about the model', async () => {
  let count = 0;
  const chatFn = async () => { count += 1; throw new Error('Rate limited'); };
  await assert.rejects(summarise(report, { chatFn, models: ['a', 'b'] }), /Rate limited/);
  assert.equal(count, 1);
});
