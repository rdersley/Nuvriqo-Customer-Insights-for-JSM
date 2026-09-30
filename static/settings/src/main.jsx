// Customer Insights settings (Jira settings → Apps). Jira admins choose which
// of the site's own fields to break reports down by, and whether reports can
// be published to the customer portal. Nothing site-specific is hard-coded.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, view } from '@forge/bridge';
import '@nuvriqo/ui/css';
import { enableTheme } from '@nuvriqo/ui/theme';
import { ActionBar, AppHeader, Button, Card, Field, Footer, Loading, Notice } from '@nuvriqo/ui/react';
import { version } from '../../../package.json';
import { MAX_BREAKDOWNS } from '../../../src/settings.js';
import './styles.css';

enableTheme(view);

const PRODUCT = 'Customer Insights';

function App() {
  const [state, setState] = useState({ loading: true });
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('getSettings')
      .then((result) => {
        setState({ loading: false, ...result });
        if (result.isAdmin) setDraft(result.settings);
      })
      .catch((e) => setState({ loading: false, error: e.message || 'Settings could not be loaded.' }));
  }, []);

  const dirty = draft && state.settings && JSON.stringify(draft) !== JSON.stringify(state.settings);
  const fieldName = (id) => state.fields?.find((f) => f.id === id)?.name || '';
  const setBreakdown = (index, change) => {
    setSaved(false);
    setDraft((d) => ({ ...d, breakdowns: d.breakdowns.map((b, i) => (i === index ? { ...b, ...change } : b)) }));
  };

  async function save() {
    setSaving(true); setError('');
    try {
      const settings = await invoke('saveSettings', { settings: draft });
      setState((s) => ({ ...s, settings })); setDraft(settings); setSaved(true);
    } catch (e) { setError(e.message || 'Saving failed.'); }
    finally { setSaving(false); }
  }

  if (state.loading) return <div className="nq-page"><Loading text="Loading settings…" /></div>;

  return <div className="nq-page nq-page--narrow">
    <AppHeader product={PRODUCT} subtitle="Settings for everyone using Customer Insights on this site." version={version} />
    {state.error && <Notice kind="error" title="Something went wrong.">{state.error}</Notice>}
    {state.isAdmin === false && <Notice kind="warning">Only Jira admins can change Customer Insights settings.</Notice>}
    {error && <Notice kind="error" title="Settings weren’t saved.">{error}</Notice>}

    {draft && <>
      <Card title="Breakdown fields" description={`Reports show tickets and each issue split by these fields, for example base or device type. Up to ${MAX_BREAKDOWNS}.`}>
        <div className="nq-stack">
          {draft.breakdowns.map((b, index) => <div className="cs-row" key={index}>
            <Field label="Field" htmlFor={`cs-field-${index}`}>
              <select id={`cs-field-${index}`} className="nq-select" value={b.id}
                onChange={(e) => setBreakdown(index, { id: e.target.value, label: fieldName(e.target.value) })}>
                {state.fields.map((f) => <option key={f.id} value={f.id}
                  disabled={f.id !== b.id && draft.breakdowns.some((x) => x.id === f.id)}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Shown as" htmlFor={`cs-label-${index}`}>
              <input id={`cs-label-${index}`} className="nq-input" maxLength={40} value={b.label} onChange={(e) => setBreakdown(index, { label: e.target.value })} />
            </Field>
            <Button appearance="subtle" small onClick={() => { setSaved(false); setDraft((d) => ({ ...d, breakdowns: d.breakdowns.filter((_, i) => i !== index) })); }}>Remove</Button>
          </div>)}
          {!draft.breakdowns.length && <p className="nq-muted">No breakdown fields yet. Reports still show patterns and trends.</p>}
          {draft.breakdowns.length < MAX_BREAKDOWNS && state.fields.length > 0 && <div>
            <Button small onClick={() => {
              setSaved(false);
              const next = state.fields.find((f) => !draft.breakdowns.some((b) => b.id === f.id));
              if (next) setDraft((d) => ({ ...d, breakdowns: [...d.breakdowns, { id: next.id, label: next.name }] }));
            }}>Add a field</Button>
          </div>}
          <p className="nq-muted">Only fields that hold choices can be used: select lists, checkboxes, radio buttons, cascading selects, labels, components, priority and request type.</p>
        </div>
      </Card>

      <Card title="Customer portal" description="Let Jira admins and project admins publish reviewed reports that customers see under “Service report” in the portal.">
        <label className="cs-check">
          <input type="checkbox" className="nq-check" checked={draft.portalEnabled && !state.portalForcedOff} disabled={state.portalForcedOff}
            onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, portalEnabled: e.target.checked })); }} />
          <span>Allow publishing reports to the customer portal</span>
        </label>
        {state.portalForcedOff && <p className="nq-muted">Switched off for this installation by the app’s deployment settings.</p>}
      </Card>

      <ActionBar state={saving ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? 'Saved' : ''}>
        <Button appearance="subtle" disabled={!dirty || saving} onClick={() => { setDraft(state.settings); setSaved(false); }}>Discard</Button>
        <Button appearance="primary" disabled={!dirty || saving} onClick={save}>Save</Button>
      </ActionBar>
    </>}
    <Footer product={PRODUCT} version={version} />
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
