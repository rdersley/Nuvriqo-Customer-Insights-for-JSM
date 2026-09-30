// Customer portal: the service report(s) agents published for the viewer's
// organisation(s). Themes and counts only; no ticket details.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import '@nuvriqo/ui/css';
import { enableTheme } from '@nuvriqo/ui/theme';
import { Button, Card, EmptyState, Kpi, Loading, Lozenge, Notice } from '@nuvriqo/ui/react';
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

const time = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function Report({ report, onRefresh, refreshNote }) {
  const { totals } = report;
  const waitUntil = report.nextRefreshAt && report.nextRefreshAt > Date.now() ? report.nextRefreshAt : null;
  return <div className="nq-stack">
    <div className="nq-spread cp-title">
      <div>
        <h2 className="nq-card__title">{report.organization.name}</h2>
        <p className="nq-muted">{longDate(report.period.from)} – {longDate(report.period.to)}</p>
      </div>
      <div className="cp-updated">
        <span className="nq-muted">{report.live ? `Updated ${new Date(report.refreshedAt).toLocaleString()}` : `Published ${new Date(report.publishedAt).toLocaleDateString()}`}</span>
        {report.live && <Button small onClick={onRefresh} disabled={report.refreshing || Boolean(waitUntil)}
          title={waitUntil ? `Available again at ${time(waitUntil)}` : undefined}>
          {report.refreshing ? 'Updating…' : 'Refresh'}
        </Button>}
      </div>
    </div>
    {refreshNote && <Notice>{refreshNote}</Notice>}
    <div className="nq-kpis">
      <Kpi icon="▤" label="Requests" value={totals.current.toLocaleString()} hint="in this period" />
      <Kpi icon="↗" kind={totals.changePercent > 0 ? 'warning' : totals.changePercent < 0 ? 'success' : 'info'} label="Vs previous period"
        value={totals.changePercent === null ? '—' : `${signed(totals.changePercent)}%`} hint={`previous period: ${totals.previous.toLocaleString()}`} />
    </div>
    {report.overview && <Card title="Summary" footer={report.live && <span className="nq-muted">Written {longDate(report.summaryWrittenAt.slice(0, 10))}. The numbers on this page are kept up to date.</span>}>
      <p className="cp-text">{report.overview}</p>
    </Card>}
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

const POLL_MS = 15000;
const POLL_FOR_MS = 5 * 60000;

function App() {
  const [state, setState] = useState({ loading: true });
  const [notes, setNotes] = useState({});
  const load = () => invoke('myReports')
    .then((result) => { setState({ loading: false, ...result }); return result; })
    .catch((error) => setState({ loading: false, error: error.message || 'The service report could not be loaded.' }));
  useEffect(() => { load(); }, []);

  async function refresh(report) {
    const orgId = report.organization.id;
    setNotes((n) => ({ ...n, [orgId]: '' }));
    try {
      const result = await invoke('refreshMyReport', { orgId });
      if (!result.queued) {
        setNotes((n) => ({ ...n, [orgId]: `This report was updated recently. You can refresh it again at ${time(result.nextRefreshAt)}.` }));
        return;
      }
      setNotes((n) => ({ ...n, [orgId]: 'Updating your report. This usually takes a minute or two; the page updates by itself.' }));
      const before = report.refreshedAt;
      const stopAt = Date.now() + POLL_FOR_MS;
      const poll = async () => {
        const latest = await load();
        const updated = latest?.reports?.find((r) => r.organization.id === orgId);
        if (updated && updated.refreshedAt !== before) { setNotes((n) => ({ ...n, [orgId]: '' })); return; }
        if (Date.now() < stopAt) setTimeout(poll, POLL_MS);
        else setNotes((n) => ({ ...n, [orgId]: 'The update is taking longer than usual. Check back shortly.' }));
      };
      setTimeout(poll, POLL_MS);
    } catch (error) {
      setNotes((n) => ({ ...n, [orgId]: error.message || 'The report could not be refreshed.' }));
    }
  }

  if (state.loading) return <div className="nq-page"><Loading text="Loading your service report…" /></div>;
  return <div className="nq-page nq-page--panel">
    {state.error && <Notice kind="error" title="Something went wrong.">{state.error}</Notice>}
    {!state.error && state.available === false && <Notice kind="warning">Service reports aren’t available on this site at the moment.</Notice>}
    {!state.error && state.available !== false && !state.reports?.length && <EmptyState title="No service report yet">
      Your service team hasn’t published a report for your organisation yet.
    </EmptyState>}
    {state.reports?.map((report) => <Report key={report.organization.id} report={report} onRefresh={() => refresh(report)} refreshNote={notes[report.organization.id]} />)}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
