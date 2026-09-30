// Customer portal: the service report(s) agents published for the viewer's
// organisation(s). Themes and counts only; no ticket details.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import '@nuvriqo/ui/css';
import { enableTheme } from '@nuvriqo/ui/theme';
import { Card, EmptyState, Kpi, Loading, Lozenge, Notice } from '@nuvriqo/ui/react';
import './styles.css';

enableTheme(view);

const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

function Trend({ pattern }) {
  if (!pattern.previousCount) return <Lozenge kind="discovery">New</Lozenge>;
  const change = pattern.count - pattern.previousCount;
  if (change > 0) return <Lozenge kind="warning">Up</Lozenge>;
  if (change < 0) return <Lozenge kind="success">Down</Lozenge>;
  return <Lozenge>Steady</Lozenge>;
}

function Report({ report }) {
  const { totals } = report;
  return <div className="nq-stack">
    <div className="nq-spread cp-title">
      <div>
        <h2 className="nq-card__title">{report.organization.name}</h2>
        <p className="nq-muted">{longDate(report.period.from)} – {longDate(report.period.to)}</p>
      </div>
      <span className="nq-muted">Published {new Date(report.publishedAt).toLocaleDateString()}</span>
    </div>
    <div className="nq-kpis">
      <Kpi icon="▤" label="Requests" value={totals.current.toLocaleString()} hint="in this period" />
      <Kpi icon="↗" kind={totals.changePercent > 0 ? 'warning' : totals.changePercent < 0 ? 'success' : 'info'} label="Vs previous period"
        value={totals.changePercent === null ? '—' : `${signed(totals.changePercent)}%`} hint={`previous period: ${totals.previous.toLocaleString()}`} />
    </div>
    {report.overview && <Card title="Summary"><p className="cp-text">{report.overview}</p></Card>}
    {report.patterns.length > 0 && <Card title="Most common issues">
      <ol className="cp-issues">{report.patterns.map((p) => <li key={p.title}>
        <div>
          <strong>{p.title}</strong>
          {p.summary && <p className="nq-muted">{p.summary}</p>}
        </div>
        <span className="cp-issues__count">{p.estimated ? '≈' : ''}{p.count.toLocaleString()}</span>
        <Trend pattern={p} />
      </li>)}</ol>
    </Card>}
    {report.actions.length > 0 && <Card title="Next steps">
      <ul className="cp-actions">{report.actions.map((a) => <li key={a}>{a}</li>)}</ul>
    </Card>}
  </div>;
}

function App() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    invoke('myReports')
      .then((result) => setState({ loading: false, ...result }))
      .catch((error) => setState({ loading: false, error: error.message || 'The service report could not be loaded.' }));
  }, []);

  if (state.loading) return <div className="nq-page"><Loading text="Loading your service report…" /></div>;
  return <div className="nq-page nq-page--panel">
    {state.error && <Notice kind="error" title="Something went wrong.">{state.error}</Notice>}
    {!state.error && state.available === false && <Notice kind="warning">Service reports aren’t available on this site at the moment.</Notice>}
    {!state.error && state.available !== false && !state.reports?.length && <EmptyState title="No service report yet">
      Your service team hasn’t published a report for your organisation yet.
    </EmptyState>}
    {state.reports?.map((report) => <Report key={report.organization.id} report={report} />)}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
