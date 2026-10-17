// Settings → General: sample data (src/sample.js). A made-up IT support company
// with seven client organisations, so every screen can be tried before real
// data is set up. Settings made while it is on are kept apart from the real ones.
import React, { useState } from 'react';
import { Button, Card, Notice } from '@nuvriqo/ui/react';

export default function SampleData({ state, invoke, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const on = state?.enabled === true;
  async function set(enabled) {
    setBusy(true); setError('');
    try { await invoke('setSampleData', { enabled }); await onChanged(); }
    catch (e) { setError(e.message || 'That didn’t work.'); }
    finally { setBusy(false); }
  }
  return <Card title="Sample data" description="Try every part of Customer Insights with a made-up IT support company and its seven client organisations: a year of tickets with sites, categories, contact channels, devices, SLAs, satisfaction ratings and escalations. Nothing is written to Jira.">
    <div className="nq-stack">
      {error && <Notice kind="error">{error}</Notice>}
      {on
        ? <p>Sample data is <strong>on</strong> for everyone on this site{state.since ? ` (since ${new Date(state.since).toLocaleString()})` : ''}. Settings changed now only apply to the sample. Emails are paused and the customer portal keeps showing real reports.</p>
        : <p className="nq-muted">Your real settings are kept and come back when you turn sample data off. Turning it off removes the sample alerts, scores and reports.</p>}
      <div><Button appearance={on ? 'default' : 'primary'} disabled={busy} onClick={() => set(!on)}>{busy ? 'Switching…' : on ? 'Turn off sample data' : 'Turn on sample data'}</Button></div>
    </div>
  </Card>;
}
