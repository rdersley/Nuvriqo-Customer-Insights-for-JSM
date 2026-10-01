// App settings chosen by a Jira admin on the Customer Insights settings page.
// Nothing site-specific is hard-coded: breakdown fields are picked from the
// site's own Jira fields.

export const MAX_BREAKDOWNS = 5;
// Fewest tickets (in the analysed sample) for a group to count as a pattern.
export const MIN_PATTERN = { min: 2, max: 10, default: 3 };
export const DEFAULT_SETTINGS = { breakdowns: [], portalEnabled: true, minPatternSize: MIN_PATTERN.default };

/** A pattern minimum within range; anything else falls back to the default. */
export function patternMinimum(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_PATTERN.min && n <= MIN_PATTERN.max ? n : MIN_PATTERN.default;
}

const clip = (value, length) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, length);

/**
 * How a Jira field's value is read, or null when it can't be broken down
 * (free text, numbers, dates, users). Based on the field's schema from
 * GET /rest/api/3/field.
 */
export function fieldKind(field) {
  const schema = field?.schema || {};
  const custom = String(schema.custom || '');
  if (schema.type === 'option') return 'option'; // select list, radio buttons
  if (schema.type === 'option-with-child') return 'cascading';
  if (schema.type === 'array' && schema.items === 'option') return 'options'; // multi-select, checkboxes
  if (schema.type === 'array' && schema.items === 'component') return 'named';
  if (schema.type === 'array' && schema.items === 'string' && (field.id === 'labels' || custom.endsWith(':labels'))) return 'strings';
  if (['priority', 'issuetype', 'resolution'].includes(schema.type)) return 'named';
  if (schema.type === 'sd-customerrequesttype') return 'requestType';
  return null;
}

/** A field value as a list of display strings. */
export function readValues(value, kind) {
  if (value === null || value === undefined) return [];
  const one = (v) => clip(v?.value ?? v?.name ?? v, 80);
  switch (kind) {
    case 'option': return [one(value)].filter(Boolean);
    case 'cascading': return [value.child?.value ? `${one(value)} / ${clip(value.child.value, 80)}` : one(value)].filter(Boolean);
    case 'options':
    case 'named':
    case 'strings': return (Array.isArray(value) ? value : [value]).map(one).filter(Boolean);
    case 'requestType': return [clip(value?.requestType?.name, 80)].filter(Boolean);
    default: return [];
  }
}

/** Fields an admin may pick from: id, name and kind, supported types only. */
export function selectableFields(fields) {
  return (Array.isArray(fields) ? fields : [])
    .map((f) => ({ id: String(f.id || ''), name: clip(f.name, 120), kind: fieldKind(f) }))
    .filter((f) => f.id && f.name && f.kind)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Validates settings from the admin page against the site's selectable fields. */
export function sanitizeSettings(input, selectable) {
  const byId = new Map(selectable.map((f) => [f.id, f]));
  const seen = new Set();
  const breakdowns = (Array.isArray(input?.breakdowns) ? input.breakdowns : [])
    .map((b) => byId.get(String(b?.id)) && { ...byId.get(String(b.id)), label: clip(b.label, 40) || byId.get(String(b.id)).name })
    .filter((b) => b && !seen.has(b.id) && seen.add(b.id))
    .slice(0, MAX_BREAKDOWNS);
  return { breakdowns, portalEnabled: input?.portalEnabled !== false, minPatternSize: patternMinimum(input?.minPatternSize) };
}

/** Breakdown values of one Jira issue: { fieldId: [values] }. */
export function dimensionsOf(issue, breakdowns) {
  const dims = {};
  for (const b of breakdowns) {
    const values = readValues(issue?.fields?.[b.id], b.kind);
    if (values.length) dims[b.id] = [...new Set(values)];
  }
  return dims;
}
