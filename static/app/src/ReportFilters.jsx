// Report filter and compare (on the analysis form), and the side-by-side card.
// The filter narrows the whole report to tickets where a breakdown field is (or
// is not) a value, e.g. Source is not "Imported from ServiceNow"; it is kept on
// published portal reports and email schedules. Compare runs the report for
// two groups of one field (a value, and another value or everything else).
import React, { useEffect, useState } from 'react';
import { Card, EmptyState, Field, Loading, Notice } from '@nuvriqo/ui/react';
import { duration } from '../../../src/trend.js';
import { filterText } from '../../../src/settings.js';

export const NO_FILTER = { id: '', exclude: false, value: '' };
export const NO_COMPARE = { on: false, id: '', a: '', b: '' };
/** The filter to send, or null when it isn't complete or its field isn't offered. */
export const activeFilter = (f, fields) => (f?.id && f.value.trim() && fields.some((x) => x.id === f.id) ? { id: f.id, value: f.value.trim(), exclude: f.exclude } : null);
export const activeCompare = (c, fields) => (c?.on && c.id && c.a.trim() && fields.some((x) => x.id === c.id) ? c : null);

/** Value suggestions for one field, from Jira's autocomplete. */
function useValues(invoke, fieldId, text) {
  const [values, setValues] = useState([]);
  useEffect(() => {
    if (!fieldId) { setValues([]); return undefined; }
    const timer = setTimeout(() => { invoke('suggestFilterValues', { id: fieldId, text }).then((v) => setValues(v || [])).catch(() => setValues([])); }, 250);
    return () => clearTimeout(timer);
  }, [fieldId, text]);
  return values;
}

function ValueInput({ id, invoke, fieldId, value, onChange, placeholder = 'Value' }) {
  const values = useValues(invoke, fieldId, value);
  return <>
    <input id={id} className="nq-input" list={`${id}-options`} value={value} placeholder={placeholder} disabled={!fieldId} maxLength={120} onChange={(e) => onChange(e.target.value)} />
    <datalist id={`${id}-options`}>{values.map((v) => <option key={v} value={v} />)}</datalist>
  </>;
}

export function FilterControls({ fields = [], filter, onFilter, compare, onCompare, invoke }) {
  if (!fields.length) return null;
  const chosen = fields.find((f) => f.id === filter.id);
  return <div className="ci-report-filter">
    <div className="nq-filters">
      <Field label="Only tickets where (optional)" htmlFor="ci-rf-field">
        <select id="ci-rf-field" className="nq-select" value={filter.id} onChange={(e) => onFilter({ ...filter, id: e.target.value, exclude: fields.find((f) => f.id === e.target.value)?.excludable ? filter.exclude : false })}>
          <option value="">All tickets</option>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </Field>
      {filter.id && <Field label="Is" htmlFor="ci-rf-op">
        <select id="ci-rf-op" className="nq-select" value={filter.exclude ? 'not' : 'is'} onChange={(e) => onFilter({ ...filter, exclude: e.target.value === 'not' })}>
          <option value="is">is</option>
          {chosen?.excludable && <option value="not">is not</option>}
        </select>
      </Field>}
      {filter.id && <Field label="Value" htmlFor="ci-rf-value">
        <ValueInput id="ci-rf-value" invoke={invoke} fieldId={filter.id} value={filter.value} onChange={(value) => onFilter({ ...filter, value })} />
      </Field>}
    </div>
    <label className="ci-check">
      <input type="checkbox" className="nq-check" checked={compare.on} onChange={(e) => onCompare({ ...compare, on: e.target.checked })} />
      <span>Compare two groups side by side</span>
    </label>
    {compare.on && <div className="nq-filters">
      <Field label="Compare by" htmlFor="ci-cmp-field">
        <select id="ci-cmp-field" className="nq-select" value={compare.id} onChange={(e) => onCompare({ ...compare, id: e.target.value })}>
          <option value="">Choose a field…</option>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </Field>
      <Field label="Group A" htmlFor="ci-cmp-a">
        <ValueInput id="ci-cmp-a" invoke={invoke} fieldId={compare.id} value={compare.a} onChange={(a) => onCompare({ ...compare, a })} placeholder="e.g. Imported from ServiceNow" />
      </Field>
      <Field label="Group B" htmlFor="ci-cmp-b">
        <ValueInput id="ci-cmp-b" invoke={invoke} fieldId={compare.id} value={compare.b} onChange={(b) => onCompare({ ...compare, b })} placeholder={fields.find((f) => f.id === compare.id)?.excludable ? 'Everything else' : 'Value'} />
      </Field>
    </div>}
  </div>;
}

/** The drill-down filter slot for each compare group. */
export function compareGroups(compare, fields) {
  const field = fields.find((f) => f.id === compare.id);
  const a = { id: compare.id, value: compare.a.trim(), exclude: false };
  const b = compare.b.trim() ? { id: compare.id, value: compare.b.trim(), exclude: false } : { id: compare.id, value: compare.a.trim(), exclude: true };
  if (!compare.b.trim() && !field?.excludable) return null;
  return { label: field?.label || 'Group', a: { ...a, name: a.value }, b: { ...b, name: compare.b.trim() || `Not ${compare.a.trim()}` } };
}

const pct = (n) => (n === null || n === undefined ? '–' : `${n}%`);
const slaMet = (r) => { const t = (r.sla || []).reduce((s, x) => ({ met: s.met + x.met, breached: s.breached + x.breached }), { met: 0, breached: 0 }); return t.met + t.breached ? Math.round((t.met / (t.met + t.breached)) * 100) : null; };

function Column({ name, report }) {
  const top = (report.groups || []).slice(0, 5);
  return <div className="ci-compare__col">
    <h3>{name}</h3>
    <dl className="ci-compare__kpis">
      <div><dt>Tickets</dt><dd>{report.currentCount.toLocaleString()}</dd></div>
      <div><dt>Vs previous period</dt><dd>{report.changePercent === null ? 'New' : `${report.changePercent > 0 ? '+' : ''}${report.changePercent}%`}</dd></div>
      <div><dt>Typical time to resolve</dt><dd>{duration(report.resolution?.medianHours)}</dd></div>
      <div><dt>Still open</dt><dd>{pct(report.resolution?.openShare)}</dd></div>
      <div><dt>SLAs met</dt><dd>{pct(slaMet(report))}</dd></div>
      <div><dt>Satisfaction</dt><dd>{report.satisfaction?.average ? `${report.satisfaction.average} / 5` : '–'}</dd></div>
    </dl>
    <strong>Top issues</strong>
    {top.length
      ? <ol className="ci-compare__issues">{top.map((g) => <li key={g.id}><span>{g.theme}</span><b>{g.estimated ? '≈' : ''}{g.count}</b></li>)}</ol>
      : <p className="nq-muted">No recurring issues.</p>}
  </div>;
}

/** Two groups side by side: { label, a: { name, report }, b: { name, report } }, or loading / error. */
export function CompareCard({ comparison }) {
  if (!comparison) return null;
  const title = `Compare by ${comparison.label}`;
  if (comparison.loading) return <Card title={title}><Loading text="Running the report for both groups…" /></Card>;
  if (comparison.error) return <Card title={title}><Notice kind="error">{comparison.error}</Notice></Card>;
  const { a, b } = comparison;
  if (!a.report.currentCount && !b.report.currentCount) return <Card title={title}><EmptyState compact title="Neither group has tickets in this period." /></Card>;
  return <Card title={title} description={`The same report for each group${comparison.reportFilter ? `, within ${filterText(comparison.reportFilter)}` : ''}. Counts and times are for the period; issues are grouped separately in each.`}>
    <div className="ci-compare">
      <Column name={a.name} report={a.report} />
      <Column name={b.name} report={b.report} />
    </div>
  </Card>;
}
