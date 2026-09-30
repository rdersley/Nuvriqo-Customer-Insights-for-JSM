import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import '@nuvriqo/ui/css';
import { enableTheme } from '@nuvriqo/ui/theme';
import { AppHeader, Button, Card, EmptyState, Field, Footer, Kpi, Loading, Lozenge, Notice } from '@nuvriqo/ui/react';
import { version } from '../../../package.json';
import { localIso, matchPreset, presetRange, PRESETS } from '../../../src/dates.js';
import { analyseEveryTicket, Cancelled, FULL_LIMIT } from './fullAnalysis.js';
import './styles.css';

enableTheme(view);

const PRODUCT = 'Customer Insights';
const DEFAULT_RANGE = presetRange('last-30');
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

// More tickets than last period is the thing to look at, so rises are flagged.
function TrendLozenge({ group }) {
  if (!group.previousCount) return <Lozenge kind="discovery">New</Lozenge>;
  if (group.change > 0) return <Lozenge kind="warning">↑ {group.change}</Lozenge>;
  if (group.change < 0) return <Lozenge kind="success">↓ {Math.abs(group.change)}</Lozenge>;
  return <Lozenge>→ 0</Lozenge>;
}

function App() {
  const [orgs, setOrgs] = useState([]);
  const [organizationId, setOrganizationId] = useState('');
  const [from, setFrom] = useState(DEFAULT_RANGE.from);
  const [to, setTo] = useState(DEFAULT_RANGE.to);
  const [lastQuery, setLastQuery] = useState(null);
  const [fullRun, setFullRun] = useState(null); // { fetched, total, phase } while running
  const [fullError, setFullError] = useState('');
  const cancelFull = useRef(false);
  const preset = matchPreset(from, to);
  const today = localIso(new Date());
  const [projectsText, setProjectsText] = useState('');
  const [report, setReport] = useState(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');
  const [queryOpen, setQueryOpen] = useState(false);
  const [licensed, setLicensed] = useState(true);
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    invoke('getOrganizations').then((result) => {
      const list = result?.organizations || [];
      setLicensed(result?.licensed !== false);
      setOrgs(list);
      if (list.length) setOrganizationId(String(list[0].id));
    }).catch((e) => setError(e.message || 'Could not load customer organisations.'))
      .finally(() => setLoadingOrgs(false));
  }, []);

  const selectedOrg = orgs.find((org) => org.id === organizationId);
  const projects = projectsText.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const maxGroup = Math.max(1, ...(report?.groups || []).map((g) => g.count));
  const graphMax = Math.max(1, ...(report?.timeSeries || []).map((p) => p.count));
  const labelEvery = Math.max(1, Math.ceil((report?.timeSeries?.length || 0) / 10));
  const totalChange = report?.changePercent === null ? 'New baseline' : `${signed(report?.changePercent)}%`;

  async function runAnalysis(event) {
    event?.preventDefault();
    if (!selectedOrg) return;
    cancelFull.current = true;
    setLoadingReport(true); setError(''); setReport(null); setAi(null); setAiError(''); setFullRun(null); setFullError('');
    const query = { organization: selectedOrg, startDate: from, endDate: to, projects };
    try {
      const result = await invoke('analyze', query);
      setReport(result);
      setLastQuery(query);
    } catch (e) { setError(e.message || 'Analysis failed. Check your Jira access and filters.'); }
    finally { setLoadingReport(false); }
  }

  async function runFull() {
    cancelFull.current = false;
    setFullError('');
    setFullRun({ fetched: 0, total: report.currentCount + report.previousCount, phase: 'fetching' });
    try {
      const full = await analyseEveryTicket({
        query: lastQuery,
        sampled: report,
        onProgress: (fetched, total, phase) => setFullRun({ fetched, total, phase }),
        isCancelled: () => cancelFull.current,
      });
      if (cancelFull.current) return;
      setReport(full); setAi(null); setAiError('');
    } catch (e) {
      if (!(e instanceof Cancelled)) setFullError(e.message || 'The full analysis failed.');
    } finally { setFullRun(null); }
  }

  function choosePreset(key) {
    const range = presetRange(key);
    if (range) { setFrom(range.from); setTo(range.to); }
  }

  async function runAi() {
    setAiLoading(true); setAiError('');
    try { setAi(await invoke('aiSummary', { report })); }
    catch (e) { setAiError(e.message || 'The AI summary could not be created.'); }
    finally { setAiLoading(false); }
  }

  // AI names apply to the first patterns only (aiInput sends 12); the index is the report order.
  const aiPattern = (index) => ai?.patterns.find((p) => p.index === index);
  const patternName = (group, index) => aiPattern(index)?.title || group.theme;

  function exportCsv() {
    if (!report) return;
    const rows = [['Customer', report.organization], ['Period', `${report.startDate} to ${report.endDate}`]];
    if (ai?.overview) rows.push(['AI overview', ai.overview]);
    rows.push([], ['Pattern', 'AI name', 'Ticket count', 'Previous period', 'Change', 'Example ticket']);
    report.groups.forEach((group, index) => rows.push([group.theme, aiPattern(index)?.title || '', group.count, group.previousCount, group.changePercent === null ? 'New' : `${group.changePercent}%`, group.tickets[0]?.key || '']));
    rows.push([], ['Date bucket', 'Tickets']);
    for (const point of report.timeSeries) rows.push([point.date, point.count]);
    const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `customer-insights-${selectedOrg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}-${to}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  const periodDays = report ? Math.max(1, Math.ceil((Date.parse(report.endDate) - Date.parse(report.startDate)) / 86400000) + 1) : 0;

  return <div className="nq-page">
    <AppHeader
      product={PRODUCT}
      subtitle="See recurring issues and what’s changing across a customer’s tickets."
      version={version}
      actions={report && <Button onClick={exportCsv}>Export CSV</Button>}
    />

    {!licensed && <Notice kind="warning" title="Customer Insights isn’t licensed on this site">
      Analysis is unavailable until the app has an active Marketplace licence. Ask a Jira admin to check it in Manage apps.
    </Notice>}

    {licensed && <Card>
      <form className="nq-filters ci-filters" onSubmit={runAnalysis}>
        <Field label="Customer organisation" htmlFor="ci-org">
          <select id="ci-org" className="nq-select" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} disabled={loadingOrgs || !orgs.length}>
            {loadingOrgs && <option>Loading organisations…</option>}
            {!loadingOrgs && !orgs.length && <option value="">No organisations found</option>}
            {orgs.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}
          </select>
        </Field>
        <Field label="Period" htmlFor="ci-period">
          <select id="ci-period" className="nq-select" value={preset} onChange={(e) => choosePreset(e.target.value)}>
            {PRESETS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            <option value="custom" disabled={preset !== 'custom'}>Custom dates</option>
          </select>
        </Field>
        <Field label="From" htmlFor="ci-from">
          <input id="ci-from" className="nq-input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="ci-to">
          <input id="ci-to" className="nq-input" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Projects (optional)" htmlFor="ci-projects">
          <input id="ci-projects" className="nq-input" value={projectsText} onChange={(e) => setProjectsText(e.target.value)} placeholder="e.g. SD, HW" />
        </Field>
        <Button appearance="primary" type="submit" disabled={!selectedOrg || loadingOrgs || loadingReport}>
          {loadingReport ? 'Analysing…' : 'Run analysis'}
        </Button>
      </form>
      <p className="nq-muted">Uses tickets shared with this organisation. Results follow your Jira permissions.</p>
    </Card>}

    {error && <Notice kind="error" title="We couldn’t complete that request.">{error}</Notice>}

    {licensed && !loadingOrgs && !report && !loadingReport && !error && <Card>
      <EmptyState
        title="Find the issues behind the numbers"
        actions={<Button appearance="primary" onClick={runAnalysis} disabled={!selectedOrg}>Analyse {selectedOrg?.name || 'customer tickets'}</Button>}
      >
        Choose a customer and date range to see ticket patterns, volume changes and example requests. Only Jira ticket data your account can access is analysed.
      </EmptyState>
    </Card>}

    {loadingReport && <Card><Loading text="Reading customer tickets and comparing this period with the one before it…" /></Card>}

    {report && <>
      <div className="nq-kpis">
        <Kpi icon="▤" label="Tickets in period" value={report.currentCount.toLocaleString()} hint={`for ${report.organization}`} />
        <Kpi icon="↗" kind={report.change > 0 ? 'warning' : report.change < 0 ? 'success' : 'info'} label="Vs previous period" value={totalChange} hint={`${signed(report.change)} tickets · previous ${report.previousCount}`} />
        <Kpi icon="⌘" kind="warning" label="Recurring patterns" value={report.groups.length} hint="with at least 2 related tickets" />
        <Kpi icon="✓" kind="success" label="Tickets analysed" value={report.analyzedCount.toLocaleString()} hint={report.sampled ? 'sample spread across the period' : 'rule-based text matching'} />
      </div>

      {report.groups.length > 0 && <Card
        title="AI summary"
        description="Atlassian-hosted Claude. Ticket text stays on the Atlassian platform."
        actions={<Button appearance={ai ? 'default' : 'primary'} small onClick={runAi} disabled={aiLoading}>{aiLoading ? 'Summarising…' : ai ? 'Regenerate' : 'Summarise with AI'}</Button>}
        footer={ai && <span className="nq-muted">AI-generated from the pattern names, counts and example summaries above. Check the linked tickets before sharing.</span>}
      >
        {aiError && <Notice kind="error" title="The AI summary didn’t work.">{aiError}</Notice>}
        {aiLoading && <Loading inline text="Reading the patterns and writing a summary…" />}
        {!ai && !aiLoading && !aiError && <p className="nq-muted">Get plain-English names for the top patterns, an overview for a customer review and suggested follow-ups.</p>}
        {ai && !aiLoading && <div className="nq-stack">
          {ai.overview && <p className="ci-ai__overview">{ai.overview}</p>}
          {ai.actions.length > 0 && <div>
            <strong>Suggested follow-ups</strong>
            <ul className="ci-ai__actions">{ai.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </div>}
        </div>}
      </Card>}

      <div className="nq-grid ci-split">
        <Card title="Ticket activity" description="Volume over time" actions={<span className="nq-pill nq-pill--neutral">{report.startDate} – {report.endDate}</span>}>
          {report.timeSeries.length
            ? <div className="ci-chart">
              <div className="ci-chart__axis"><span>{graphMax}</span><span>{Math.ceil(graphMax / 2)}</span><span>0</span></div>
              <div className="ci-chart__bars" role="img" aria-label="Ticket volume over time">
                {report.timeSeries.map((point, i) => <div className="ci-chart__slot" key={point.date} title={`${point.date}: ${point.count} tickets`}>
                  <div className="ci-chart__bar" style={{ height: `${Math.max(5, (point.count / graphMax) * 100)}%` }} />
                  <span>{i % labelEvery === 0 ? point.date.slice(5) : ''}</span>
                </div>)}
              </div>
            </div>
            : <EmptyState compact title="No tickets were created in this period." />}
        </Card>

        <Card title="What stands out" description="Quick read" footer={<span className="nq-muted">Patterns are based on matching ticket text. Review the examples before drawing conclusions.</span>}>
          {report.groups.length
            ? <ol className="ci-insights">{report.groups.slice(0, 3).map((g, index) => <li key={g.id}>
              <div>
                <strong>{patternName(g, index)}</strong>
                <p className="nq-muted">{g.estimated ? '≈' : ''}{g.count} related tickets{g.previousCount ? `, ${g.change >= 0 ? 'up' : 'down'} ${Math.abs(g.change)} from the previous period` : ', newly recurring this period'}</p>
              </div>
              <span className="ci-insights__count">{g.estimated ? '≈' : ''}{g.count}</span>
            </li>)}</ol>
            : <EmptyState compact title="No repeated patterns found in these tickets yet." />}
        </Card>
      </div>

      <Card
        title={<>Issue patterns <span className="nq-pill nq-pill--neutral">{report.groups.length}</span></>}
        description="Repeated customer issues, with ticket evidence"
        footer={<span className="nq-muted">Similarity groups use ticket summaries and descriptions. They are clues for review, not confirmed root causes.</span>}
      >
        {report.sampled && !fullRun && <Notice>
          <div className="nq-spread ci-full">
            <span>Patterns come from {report.analyzedCount.toLocaleString()} of {report.currentCount.toLocaleString()} tickets, sampled evenly across the period. Sizes marked ≈ are estimates; ticket totals, the comparison and the chart are exact.</span>
            {report.currentCount <= FULL_LIMIT && report.previousCount <= FULL_LIMIT
              ? <Button small onClick={runFull}>Analyse every ticket</Button>
              : <span className="nq-muted">Too many tickets to analyse all of them; narrow the period or add a project.</span>}
          </div>
        </Notice>}
        {fullRun && <div className="ci-progress" role="status" aria-live="polite">
          <div className="nq-spread">
            <span>{fullRun.phase === 'grouping'
              ? `Grouping ${fullRun.fetched.toLocaleString()} tickets…`
              : `Reading tickets: ${fullRun.fetched.toLocaleString()} of ${fullRun.total.toLocaleString()}`}</span>
            <Button small appearance="subtle" onClick={() => { cancelFull.current = true; setFullRun(null); }}>Cancel</Button>
          </div>
          <div className="ci-meter ci-progress__bar"><i style={{ width: `${Math.min(100, Math.round((fullRun.fetched / Math.max(1, fullRun.total)) * 100))}%` }} /></div>
        </div>}
        {fullError && <Notice kind="error" title="The full analysis didn’t finish.">{fullError}</Notice>}
        {report.full && <Notice kind="success">All {report.currentCount.toLocaleString()} tickets in the period were analysed (plus {report.previousCount.toLocaleString()} from the previous period for trends).</Notice>}
        {report.cutShort && <Notice kind="warning">
          The analysis stopped fetching early to stay within Jira’s time limit, so the sample is smaller than usual. Try a shorter period or a project filter.
        </Notice>}
        {report.groups.length
          ? <div className="ci-patterns">{report.groups.map((group, index) => <details className="ci-pattern" key={group.id}>
            <summary>
              <span className="ci-pattern__title">
                <strong>{patternName(group, index)}</strong>
                {aiPattern(index) && <small className="nq-muted"> {group.theme}{aiPattern(index).coherent ? '' : ' · '}{!aiPattern(index).coherent && <Lozenge kind="warning">Mixed</Lozenge>}</small>}
              </span>
              <span className="ci-pattern__sample nq-muted">{aiPattern(index)?.summary || group.sampleSummary}</span>
              <span className="ci-meter"><i style={{ width: `${Math.max(8, (group.count / maxGroup) * 100)}%` }} /></span>
              <span className="ci-pattern__count" title={group.estimated ? `${group.sampleCount} in the sample` : undefined}>{group.estimated ? '≈' : ''}{group.count}</span>
              <TrendLozenge group={group} />
              <span className="ci-pattern__chevron" aria-hidden="true">›</span>
            </summary>
            <div className="nq-table-wrap">
              <table className="nq-table">
                <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Created</th></tr></thead>
                <tbody>{group.tickets.map((ticket) => <tr key={ticket.key}>
                  <td><a className="nq-table__key" href={ticket.url} target="_blank" rel="noreferrer">{ticket.key}</a></td>
                  <td>{ticket.summary}</td>
                  <td><Lozenge>{ticket.status}</Lozenge></td>
                  <td>{new Date(ticket.created).toLocaleDateString()}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>)}</div>
          : <EmptyState compact title="No repeated issue patterns detected">There are no groups of similar tickets with more than one request in this period.</EmptyState>}
      </Card>

      <div className="nq-spread ci-method">
        <span className="nq-muted">Analysis period: {report.startDate} to {report.endDate} · compared with the preceding {periodDays} days</span>
        <Button appearance="link" small onClick={() => setQueryOpen(!queryOpen)}>{queryOpen ? 'Hide' : 'Show'} search details</Button>
      </div>
      {queryOpen && <Notice title="Data source">
        Jira issues with <code>organizations = "{report.organization}"</code>, created between {report.startDate} and {report.endDate}. A preceding equal-length period is used for comparison. Only tickets visible to your Jira account are included.
      </Notice>}
    </>}

    <Footer product={PRODUCT} version={version} />
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
