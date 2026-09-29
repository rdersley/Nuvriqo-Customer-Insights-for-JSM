import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@forge/bridge';
import './styles.css';

const dateValue = (date) => date.toISOString().slice(0, 10);
const daysAgo = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return dateValue(d); };

function App() {
  const [orgs, setOrgs] = useState([]);
  const [organizationId, setOrganizationId] = useState('');
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(dateValue(new Date()));
  const [projectsText, setProjectsText] = useState('');
  const [report, setReport] = useState(null);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');
  const [queryOpen, setQueryOpen] = useState(false);

  useEffect(() => {
    invoke('getOrganizations').then((result) => {
      setOrgs(result || []);
      if (result?.length) setOrganizationId(String(result[0].id));
    }).catch((e) => setError(e.message || 'Could not load customer organizations.'))
      .finally(() => setLoadingOrgs(false));
  }, []);

  const selectedOrg = orgs.find((org) => org.id === organizationId);
  const projects = projectsText.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
  const maxGroup = Math.max(1, ...(report?.groups || []).map((g) => g.count));
  const graphMax = Math.max(1, ...(report?.timeSeries || []).map((p) => p.count));
  const totalChange = report?.changePercent === null ? 'New baseline' : `${report?.changePercent > 0 ? '+' : ''}${report?.changePercent}%`;

  async function runAnalysis(event) {
    event.preventDefault();
    if (!selectedOrg) return;
    setLoadingReport(true); setError(''); setReport(null);
    try {
      const result = await invoke('analyze', { organization: selectedOrg, startDate: from, endDate: to, projects });
      setReport(result);
    } catch (e) { setError(e.message || 'Analysis failed. Check your Jira access and filters.'); }
    finally { setLoadingReport(false); }
  }

  function exportCsv() {
    if (!report) return;
    const rows = [['Customer', report.organization], ['Period', `${report.startDate} to ${report.endDate}`], [], ['Pattern', 'Ticket count', 'Previous period', 'Change', 'Example ticket']];
    for (const group of report.groups) rows.push([group.theme, group.count, group.previousCount, group.changePercent === null ? 'New' : `${group.changePercent}%`, group.tickets[0]?.key || '']);
    rows.push([], ['Date bucket', 'Tickets']);
    for (const point of report.timeSeries) rows.push([point.date, point.count]);
    const csv = rows.map((r) => r.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `customer-insights-${selectedOrg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}-${to}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">N</span><span>NUVRIQO <i>APPS</i></span></div>
      <span className="product-label">Jira Service Management</span>
    </header>
    <section className="intro">
      <div className="eyebrow"><span className="eyebrow-dot" /> CUSTOMER INTELLIGENCE</div>
      <div className="title-row"><div><h1>Customer Insights</h1><p>See recurring issues and what’s changing across a customer’s tickets.</p></div>
        {report && <button className="export-button" onClick={exportCsv} aria-label="Export report as CSV"><span>↧</span> Export CSV</button>}
      </div>
      <form className="filters" onSubmit={runAnalysis}>
        <label className="field org-field"><span>Customer organisation</span><select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} disabled={loadingOrgs || !orgs.length}>
          {loadingOrgs && <option>Loading organisations…</option>}
          {!loadingOrgs && !orgs.length && <option value="">No organisations found</option>}
          {orgs.map((org) => <option value={org.id} key={org.id}>{org.name}</option>)}
        </select></label>
        <label className="field"><span>From</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>To</span><input type="date" value={to} min={from} max={dateValue(new Date())} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="field projects-field"><span>Projects <small>optional</small></span><input value={projectsText} onChange={(e) => setProjectsText(e.target.value)} placeholder="e.g. SD, HW" /></label>
        <button className="run-button" type="submit" disabled={!selectedOrg || loadingOrgs || loadingReport}>{loadingReport ? <><span className="spinner" /> Analysing</> : <>Run analysis <span>→</span></>}</button>
      </form>
      <div className="filter-hint">Uses tickets shared with this organisation. Results follow your Jira permissions.</div>
    </section>

    {error && <div className="error-banner"><span>!</span><div><b>We couldn’t complete that request.</b><p>{error}</p></div></div>}
    {!report && !loadingReport && !error && <section className="empty-state"><div className="empty-icon">⌕</div><h2>Find the issues behind the numbers</h2><p>Choose a customer and date range to see ticket patterns, volume changes, and example requests.</p><button onClick={runAnalysis} disabled={!selectedOrg}>Analyse {selectedOrg?.name || 'customer tickets'} <span>→</span></button><div className="privacy-note"><span>▣</span> Analysis is performed on Jira ticket data your account can access.</div></section>}
    {loadingReport && <section className="loading-card"><div className="loading-ring" /><h2>Reading customer tickets</h2><p>Finding repeated themes and comparing this period with the one before it.</p></section>}

    {report && <>
      <section className="summary-grid">
        <article className="metric-card"><div className="metric-caption">{report.retrievalCapped ? 'CURRENT PERIOD SAMPLE' : 'TICKETS IN PERIOD'} <span className="metric-icon blue">▤</span></div><div className="metric-value">{report.currentCount.toLocaleString()}</div><div className="metric-foot">for {report.organization}</div></article>
        <article className="metric-card"><div className="metric-caption">VS PREVIOUS PERIOD <span className="metric-icon violet">↗</span></div><div className="metric-value">{totalChange}</div><div className={`metric-foot ${report.change > 0 ? 'up' : report.change < 0 ? 'down' : ''}`}>{report.change > 0 ? '+' : ''}{report.change} tickets · previous {report.previousCount}</div></article>
        <article className="metric-card"><div className="metric-caption">RECURRING PATTERNS <span className="metric-icon orange">⌘</span></div><div className="metric-value">{report.groups.length}</div><div className="metric-foot">with at least 2 related tickets</div></article>
        <article className="metric-card"><div className="metric-caption">TICKETS ANALYSED <span className="metric-icon green">✓</span></div><div className="metric-value">{report.analyzedCount.toLocaleString()}</div><div className="metric-foot">rule-based text matching</div></article>
      </section>

      <section className="content-grid">
        <article className="panel trend-panel"><div className="panel-heading"><div><div className="panel-kicker">VOLUME OVER TIME</div><h2>Ticket activity</h2></div><span className="period-chip">{report.startDate} — {report.endDate}</span></div>
          {report.timeSeries.length ? <div className="chart-area"><div className="y-labels"><span>{graphMax}</span><span>{Math.ceil(graphMax / 2)}</span><span>0</span></div><div className="bars" role="img" aria-label="Ticket volume over time">
            {report.timeSeries.map((point) => <div className="bar-slot" key={point.date} title={`${point.date}: ${point.count} tickets`}><div className="bar" style={{ height: `${Math.max(5, (point.count / graphMax) * 100)}%` }} /><span>{point.date.slice(5)}</span></div>)}
          </div></div> : <div className="chart-empty">No tickets were created in this period.</div>}
        </article>
        <article className="panel insight-panel"><div className="panel-heading"><div><div className="panel-kicker">QUICK READ</div><h2>What stands out</h2></div><span className="sparkle">✦</span></div>
          {report.groups.length ? <div className="insight-list">{report.groups.slice(0, 3).map((g, i) => <div className="insight-row" key={g.id}><span className={`insight-rank rank-${i}`}>0{i + 1}</span><div><b>{g.theme}</b><p>{g.count} related tickets{g.previousCount ? `, ${g.change >= 0 ? 'up' : 'down'} ${Math.abs(g.change)} from the previous period` : ', newly recurring this period'}</p></div><span className="insight-count">{g.count}</span></div>)}</div> : <div className="insight-empty">No repeated patterns found in these tickets yet.</div>}
          <div className="insight-disclaimer">Patterns are based on matching ticket text. Review the examples before drawing conclusions.</div>
        </article>
      </section>

      <section className="panel patterns-panel"><div className="panel-heading patterns-heading"><div><div className="panel-kicker">REPEATED CUSTOMER ISSUES</div><h2>Issue patterns <span className="count-pill">{report.groups.length}</span></h2></div><span className="evidence-tag">TICKET EVIDENCE INCLUDED</span></div>
        {report.groups.length ? <div className="pattern-list">{report.groups.map((group) => <details className="pattern" key={group.id}><summary><span className="pattern-title">{group.theme}</span><span className="pattern-sample">{group.sampleSummary}</span><span className="pattern-meter"><i style={{ width: `${Math.max(8, (group.count / maxGroup) * 100)}%` }} /></span><span className="pattern-number">{group.count}</span><span className={`trend-badge ${group.change > 0 ? 'badge-up' : group.change < 0 ? 'badge-down' : ''}`}>{group.previousCount ? `${group.change > 0 ? '↑' : group.change < 0 ? '↓' : '→'} ${Math.abs(group.change)}` : 'NEW'}</span><span className="chevron">⌄</span></summary><div className="ticket-evidence">{group.tickets.map((ticket) => <a key={ticket.key} href={ticket.url} target="_blank" rel="noreferrer"><span className="ticket-key">{ticket.key}</span><span className="ticket-summary">{ticket.summary}</span><span className="ticket-status">{ticket.status}</span><span className="ticket-date">{new Date(ticket.created).toLocaleDateString()}</span><span className="external">↗</span></a>)}</div></details>)}</div> : <div className="no-patterns"><span>✓</span><div><b>No repeated issue patterns detected</b><p>There are no groups of similar tickets with more than one request in this period.</p></div></div>}
        {(report.capped || report.retrievalCapped) && <div className="cap-note">{report.retrievalCapped ? `The search reached the ${report.totalFetched.toLocaleString()}-ticket retrieval limit, so counts are based on the fetched sample. ` : ''}{report.capped ? 'Pattern matching examines up to 900 tickets per period.' : ''}</div>}
        <div className="method-note"><span>ⓘ</span> Similarity groups use ticket summaries and descriptions. They are clues for review, not confirmed root causes.</div>
      </section>
      <footer className="report-footer"><span>Analysis period: {report.startDate} to {report.endDate} · Compared with the preceding {Math.max(1, Math.ceil((Date.parse(report.endDate) - Date.parse(report.startDate)) / 86400000) + 1)} days</span><button onClick={() => setQueryOpen(!queryOpen)}>{queryOpen ? 'Hide' : 'Show'} search details <span>{queryOpen ? '⌃' : '⌄'}</span></button></footer>
      {queryOpen && <div className="query-detail"><b>Data source:</b> Jira issues with <code>organizations = "{report.organization}"</code>, created between {report.startDate} and {report.endDate}. A preceding equal-length period is used for comparison. Only tickets visible to your Jira account are included.</div>}
    </>}
    <footer className="app-footer"><span>Nuvriqo Customer Insights <b>EARLY ACCESS</b></span><span>Made for service teams</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
