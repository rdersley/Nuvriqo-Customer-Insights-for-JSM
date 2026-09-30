// AI naming and summary for a finished report, using Atlassian-hosted Claude
// (Forge LLMs). Ticket text stays on the Atlassian platform. Only what the
// report already shows is sent: pattern themes, counts and example summaries.
// @forge/llm throws on import outside the Forge runtime, so it is loaded on
// first use; tests pass their own chatFn.
const forgeChat = async (prompt) => (await import('@forge/llm')).chat(prompt);

// Preferred first. Haiku 4.5 is avoided: Forge retires it on 2026-10-15.
export const MODELS = ['claude-sonnet-5', 'claude-sonnet-4-6'];
const MAX_PATTERNS = 12;
const MAX_EXAMPLES = 8;
const clip = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);

/** The report reduced to what the model needs, with sizes bounded. */
export function aiInput(report) {
  return {
    customer: clip(report.organization, 120),
    period: `${report.startDate} to ${report.endDate}`,
    tickets: Number(report.currentCount) || 0,
    previousPeriodTickets: Number(report.previousCount) || 0,
    // Ticket totals are exact; pattern counts are scaled from a sample when true.
    patternCountsAreEstimates: Boolean(report.sampled),
    patterns: (report.groups || []).slice(0, MAX_PATTERNS).map((g, index) => ({
      index,
      ruleBasedName: clip(g.theme, 80),
      tickets: Number(g.count) || 0,
      previousPeriodTickets: Number(g.previousCount) || 0,
      exampleSummaries: (g.tickets || []).slice(0, MAX_EXAMPLES).map((t) => clip(t.summary, 200)),
    })),
  };
}

const TOOL = {
  type: 'function',
  function: {
    name: 'report_insights',
    description: 'Return the customer insight summary.',
    parameters: {
      type: 'object',
      required: ['overview', 'patterns', 'actions'],
      properties: {
        overview: { type: 'string', description: '3-5 plain sentences for an account review: volume change, the biggest problems, what is new or growing.' },
        patterns: {
          type: 'array',
          items: {
            type: 'object',
            required: ['index', 'title', 'summary', 'coherent'],
            properties: {
              index: { type: 'integer', description: 'The pattern index from the input.' },
              title: { type: 'string', description: 'Specific name for the problem, at most 8 words, e.g. "vPOS app freezes on loading screen".' },
              summary: { type: 'string', description: 'One sentence on what customers report, from the examples only.' },
              coherent: { type: 'boolean', description: 'false if the examples describe clearly different problems.' },
            },
          },
        },
        actions: { type: 'array', items: { type: 'string' }, description: 'Up to 3 concrete follow-ups for the service team.' },
      },
    },
  },
};

const SYSTEM = `You are a service desk analyst preparing a customer account review.
You get recurring ticket patterns found by rule-based text matching, with counts and example ticket summaries.
Use only the data given. Do not invent causes, numbers, dates or ticket details. Ticket codes such as crew IDs and airport codes are not problems.
Ticket totals are exact. When patternCountsAreEstimates is true, pattern counts are scaled up from a sample: describe them approximately ("around 250", "a handful", "several times more") and never quote small previous-period pattern counts as exact figures.
Write in plain British English. Call report_insights once.`;

export function aiMessages(input) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Customer ticket patterns as JSON:\n${JSON.stringify(input)}` },
  ];
}

function argumentsOf(response, name = TOOL.function.name) {
  const message = response?.choices?.[0]?.message;
  const call = message?.tool_calls?.find((c) => c.function?.name === name);
  if (call) return typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;
  // Fallback: a JSON object in the text.
  const text = Array.isArray(message?.content) ? message.content.map((p) => p.text || '').join('') : String(message?.content || '');
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

/** Validates and bounds model output; unknown or repeated pattern indexes are dropped. */
export function parseInsights(raw, patternCount) {
  if (!raw || typeof raw !== 'object') throw new Error('The AI response could not be read.');
  const seen = new Set();
  const patterns = (Array.isArray(raw.patterns) ? raw.patterns : [])
    .filter((p) => Number.isInteger(p?.index) && p.index >= 0 && p.index < patternCount && !seen.has(p.index) && seen.add(p.index))
    .map((p) => ({ index: p.index, title: clip(p.title, 80), summary: clip(p.summary, 300), coherent: p.coherent !== false }))
    .filter((p) => p.title);
  return {
    overview: clip(raw.overview, 1200),
    patterns,
    actions: (Array.isArray(raw.actions) ? raw.actions : []).map((a) => clip(a, 240)).filter(Boolean).slice(0, 3),
  };
}

// ---- Merging: which rule-based groups are the same issue ----------------------

const MERGE_GROUPS = 40;
const MERGE_EXAMPLES = 4;

export function mergeInput(report) {
  return (report.groups || []).slice(0, MERGE_GROUPS).map((g, index) => ({
    index,
    name: clip(g.theme, 60),
    tickets: Number(g.count) || 0,
    examples: (g.tickets || []).slice(0, MERGE_EXAMPLES).map((t) => clip(t.summary, 120)),
  }));
}

const MERGE_TOOL = {
  type: 'function',
  function: {
    name: 'merge_groups',
    description: 'Return the groups that describe the same issue.',
    parameters: {
      type: 'object',
      required: ['issues'],
      properties: {
        issues: {
          type: 'array',
          description: 'One entry per issue that combines two or more groups. Groups not listed stay as they are.',
          items: {
            type: 'object',
            required: ['title', 'members'],
            properties: {
              title: { type: 'string', description: 'Plain name for the combined issue, at most 6 words, e.g. "Open a barset".' },
              members: { type: 'array', items: { type: 'integer' }, description: 'Indexes of the groups that are this issue.' },
            },
          },
        },
      },
    },
  },
};

const MERGE_SYSTEM = `You tidy up ticket groups found by rule-based text matching for a service desk.
Several groups can be the same customer request or problem written differently: typos ("breset"), plurals, rewording ("open barset" / "opening barset" / "barset needs unlocking"), or extra codes such as airports, crew IDs and dates.
Combine groups only when an agent would handle their tickets the same way. Keep genuinely different problems apart even if they share words (for example "vPOS crash" and "vPOS won't charge").
Each index may appear in at most one issue. Use only the data given. Call merge_groups once.`;

/** Validates merges: indexes in range, each used once, at least two per issue. */
export function parseMerges(raw, groupCount) {
  const used = new Set();
  return (Array.isArray(raw?.issues) ? raw.issues : [])
    .map((issue) => ({
      title: clip(issue?.title, 80),
      members: [...new Set(Array.isArray(issue?.members) ? issue.members : [])]
        .filter((i) => Number.isInteger(i) && i >= 0 && i < groupCount && !used.has(i) && used.add(i)),
    }))
    .filter((issue) => issue.title && issue.members.length > 1);
}

async function callTool(chatFn, models, messages, tool) {
  let lastError;
  for (const model of models) {
    try {
      const response = await chatFn({
        model,
        messages,
        tools: [tool],
        tool_choice: { type: 'function', function: { name: tool.function.name } },
        max_completion_tokens: 2000,
      });
      return { raw: argumentsOf(response, tool.function.name), model };
    } catch (error) {
      lastError = error;
      if (!/model|not allowed|not found|unsupported/i.test(String(error?.message))) break;
    }
  }
  throw new Error(`AI request failed: ${lastError?.message || 'unknown error'}`);
}

export async function suggestMerges(report, { chatFn = forgeChat, models = MODELS } = {}) {
  const input = mergeInput(report);
  if (input.length < 2) return { merges: [], model: null };
  const { raw, model } = await callTool(chatFn, models, [
    { role: 'system', content: MERGE_SYSTEM },
    { role: 'user', content: `Ticket groups as JSON:\n${JSON.stringify(input)}` },
  ], MERGE_TOOL);
  return { merges: parseMerges(raw, input.length), model };
}

// ---- Summary -------------------------------------------------------------------

export async function summarise(report, { chatFn = forgeChat, models = MODELS } = {}) {
  const input = aiInput(report);
  if (!input.patterns.length) throw new Error('There are no patterns to summarise.');
  let lastError;
  for (const model of models) {
    try {
      const response = await chatFn({
        model,
        messages: aiMessages(input),
        tools: [TOOL],
        tool_choice: { type: 'function', function: { name: TOOL.function.name } },
        max_completion_tokens: 2000,
      });
      return { ...parseInsights(argumentsOf(response), input.patterns.length), model };
    } catch (error) {
      lastError = error;
      // Try the next model only when this one is unavailable to the app.
      if (!/model|not allowed|not found|unsupported/i.test(String(error?.message))) break;
    }
  }
  throw new Error(`AI summary failed: ${lastError?.message || 'unknown error'}`);
}
