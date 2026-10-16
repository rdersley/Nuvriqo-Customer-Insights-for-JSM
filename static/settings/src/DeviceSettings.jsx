// Settings → Customers → Devices: the device ID and type fields, device types
// (which field values count), each organisation's fleet, and P1/P2 thresholds.
import React, { useState } from 'react';
import { Button, Card, Field } from '@nuvriqo/ui/react';
import { DEFAULT_DEVICES, DEVICE_LIMITS } from '../../../src/devices.js';

export default function DeviceSettings({ value, onChange, idChoices = [], fields = [], organizations = [] }) {
  const d = { ...DEFAULT_DEVICES, ...value };
  const set = (change) => onChange({ ...d, ...change });
  const setType = (i, change) => set({ types: d.types.map((t, n) => (n === i ? { ...t, ...change } : t)) });
  const [orgId, setOrgId] = useState('');
  const fleets = d.fleets || [];
  const labels = d.types.map((t) => t.label).filter(Boolean);
  const setCount = (index, label, n) => set({ fleets: fleets.map((f, i) => (i === index ? { ...f, counts: { ...f.counts, [label]: n } } : f)) });
  const free = organizations.filter((o) => !fleets.some((f) => f.organization.id === o.id));
  return <Card title="Devices" description="Count how many devices recurring issues and live surges affect, against each organisation's fleet, and suggest a priority from the share affected. Agents decide the actual priority.">
    <div className="nq-stack">
      <div className="cs-row cs-row--pair">
        <Field label="Device ID field" htmlFor="cs-dev-id" help="The ticket field with the device's serial, asset tag or name. Each distinct value is one device.">
          <select id="cs-dev-id" className="nq-select" value={d.idFieldId} onChange={(e) => set({ idFieldId: e.target.value })}>
            <option value="">Off</option>
            {idChoices.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Device type field" htmlFor="cs-dev-type" help="The ticket field that says which kind of device it is.">
          <select id="cs-dev-type" className="nq-select" value={d.typeFieldId} onChange={(e) => set({ typeFieldId: e.target.value })}>
            <option value="">None</option>
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <strong>Device types</strong>
        <p className="nq-muted">A name for each kind of device, and the device type values (or words in them) that mean it.</p>
        {d.types.map((t, i) => <div className="cs-row cs-dev-row" key={i}>
          <Field label="Name" htmlFor={`cs-dev-label-${i}`}>
            <input id={`cs-dev-label-${i}`} className="nq-input" maxLength={40} value={t.label} onChange={(e) => setType(i, { label: e.target.value })} />
          </Field>
          <Field label="Matching values" htmlFor={`cs-dev-values-${i}`}>
            <input id={`cs-dev-values-${i}`} className="nq-input" value={Array.isArray(t.values) ? t.values.join(', ') : t.values} onChange={(e) => setType(i, { values: e.target.value })} />
          </Field>
          <Button appearance="subtle" small onClick={() => set({ types: d.types.filter((_, n) => n !== i) })}>Remove</Button>
        </div>)}
        {d.types.length < DEVICE_LIMITS.types && <Button small onClick={() => set({ types: [...d.types, { label: '', values: '' }] })}>Add a device type</Button>}
      </div>
      <div>
        <strong>Fleet sizes</strong>
        <p className="nq-muted">How many devices of each type each organisation has, so reports can show the share affected. Several organisations analysed together add up.</p>
        {fleets.length > 0 && <div className="nq-table-wrap">
          <table className="nq-table cs-fleet">
            <thead><tr><th>Organisation</th>{labels.map((l) => <th key={l} className="cs-num">{l}</th>)}<th /></tr></thead>
            <tbody>{fleets.map((f, i) => <tr key={f.organization.id}>
              <td>{f.organization.name}</td>
              {labels.map((l) => <td key={l} className="cs-num">
                <input className="nq-input cs-number" type="number" min={0} aria-label={`${f.organization.name} ${l}`} value={f.counts?.[l] ?? ''} onChange={(e) => setCount(i, l, e.target.value === '' ? '' : Number(e.target.value))} />
              </td>)}
              <td><Button appearance="subtle" small onClick={() => set({ fleets: fleets.filter((_, n) => n !== i) })}>Remove</Button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {fleets.length < DEVICE_LIMITS.fleets && free.length > 0 && <div className="cs-row cs-row--pair cs-fleet-add">
          <Field label="Add an organisation's fleet" htmlFor="cs-fleet-org">
            <select id="cs-fleet-org" className="nq-select" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">Choose an organisation…</option>
              {free.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <div><Button small disabled={!orgId} onClick={() => { const o = organizations.find((x) => x.id === orgId); if (o) { set({ fleets: [...fleets, { organization: { id: o.id, name: o.name }, counts: {} }] }); setOrgId(''); } }}>Add</Button></div>
        </div>}
      </div>
      <div className="cs-row cs-row--pair">
        <Field label="Suggest P1 from (% of a fleet)" htmlFor="cs-dev-p1">
          <input id="cs-dev-p1" className="nq-input cs-number" type="number" min={1} max={100} value={d.p1Percent} onChange={(e) => set({ p1Percent: Number(e.target.value) })} />
        </Field>
        <Field label="Suggest P2 from (% of a fleet)" htmlFor="cs-dev-p2">
          <input id="cs-dev-p2" className="nq-input cs-number" type="number" min={1} max={100} value={d.p2Percent} onChange={(e) => set({ p2Percent: Number(e.target.value) })} />
        </Field>
      </div>
    </div>
  </Card>;
}
