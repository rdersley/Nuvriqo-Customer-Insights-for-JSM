// Renders the Marketplace images (fictional "Acme Airlines" data) with headless Edge.
// node docs/marketing/build-images.cjs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = __dirname;
const logo = fs.readFileSync(path.join(dir, 'app-logo-144.png')).toString('base64');
const img = (size = 32) => `<img src="data:image/png;base64,${logo}" style="width:${size}px;height:${size}px;border-radius:${size / 4}px">`;
const css = fs.readFileSync(path.join(dir, 'mock.css'), 'utf8');
// zoom scales the layout up so it fills the frame.
const page = (w, h, body, extra = '', zoom = 1) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}${extra}</style></head><body style="width:${w}px;height:${h}px;overflow:hidden"><div style="zoom:${zoom};width:${w / zoom}px;height:${h / zoom}px">${body}</div></body></html>`;
const spark = (d, w = 150) => `<svg class="sp" width="${w}" height="30"><path d="${d}"/></svg>`;
const UP = 'M0,26 L25,24 L50,20 L75,21 L100,12 L125,8 L150,3';
const FLAT = 'M0,15 L25,16 L50,14 L75,15 L100,14 L125,16 L150,15';
const NEW = 'M0,28 L25,28 L50,27 L75,22 L100,14 L125,9 L150,5';
const DOWN = 'M0,6 L25,8 L50,10 L75,14 L100,18 L125,21 L150,24';
const top = (right) => `<div class="top">${img()}Customer Insights<em>${right}</em></div>`;
const row = (title, sub, desc, where, trend, count, loz, cls, chev = '›') =>
  `<div class="row${chev === '⌄' ? ' open' : ''}"><span><strong>${title}</strong><small>${sub}</small></span><span class="s">${desc}<small>${where}</small></span>${spark(trend)}<b>${count}</b><span class="loz ${cls}">${loz}</span><span>${chev}</span></div>`;
const ticketTable = (rows, head = ['Key', 'Summary', 'Status', 'Created']) =>
  `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr><td class="k">${r[0]}</td><td>${r[1]}</td><td><span class="st">${r[2]}</span></td>${r[3] ? `<td>${r[3]}</td>` : ''}</tr>`).join('')}</table>`;
const value = (name, meta, width, count, loz, cls) =>
  `<li><span><a>${name}</a><small>${meta}</small></span><span class="meter"><i style="width:${width}%"></i></span><b>${count}</b><span class="loz ${cls}">${loz}</span></li>`;
const bars = (heights) => `<div class="chart">${heights.map((h) => `<div style="height:${h}%"></div>`).join('')}</div>`;

const highlight1 = page(1840, 900, `${top('Acme Airlines · Last 90 days · 4,316 tickets')}
<div class="wrap"><div class="card"><h3>Issue patterns <span class="pill">24</span></h3><div class="d">Repeated customer issues, with ticket evidence</div>
${row('POS terminal freezes at start of shift', 'Combines 3: Pos frozen · Till stuck · Terminal hang', 'Crew report the POS freezing on the loading screen when the shift starts.', 'Base: LHR 41%, MAN 22% · Device: Handheld 90%', UP, '≈412', '↑ 171', 'up')}
${row('Card reader won’t pair', 'Combines 2: Pairing · Bluetooth pin pad', 'Pin pads lose pairing after a device restart.', 'Device: Handheld 88%', FLAT, '≈206', '↓ 18', 'down', '⌄')}
<div class="detail"><div class="meta"><span>Steady through the period · median 6.5 h to resolve · 4% open</span><a>Open 38 tickets in Jira</a></div>
${ticketTable([['SUP-8812', 'Pin pad not pairing with handheld after restart', 'RESOLVED', '28/09/2026'], ['SUP-8790', 'Card reader shows “not connected” at gate', 'IN PROGRESS', '27/09/2026'], ['SUP-8744', 'Bluetooth pin pad drops connection mid-sale', 'RESOLVED', '25/09/2026']])}</div>
${row('Sales not syncing after flight', 'Sync errors', 'Sales stay on the device after landing and don’t upload.', 'Base: DUB 63%', NEW, '≈131', 'New', 'new')}
${row('Can’t open the bar set', 'Combines 4: Open barset · Barset locked', 'Crew can’t open the trolley bar set at the start of the flight.', 'Base: STN 38%, BGY 21%', DOWN, '≈97', '↓ 40', 'down')}
${row('Printer out of paper alerts', 'Printer', 'Receipt printers report paper out when the roll is full.', 'Device: Printer 100%', FLAT, '≈64', '↑ 9', 'up')}
</div></div>`, '', 1.3);

const quality = (field, share, count, parts) => `<div style="font-size:14px;display:flex;justify-content:space-between;margin-top:14px"><strong>${field}</strong><span><b>${share}%</b> of tickets (≈${count}) have no real ${field}</span></div>
<div class="meter warn" style="margin:8px 0"><i style="width:${share}%"></i></div><div style="font-size:12.5px;color:#6b778c">${parts.map((p) => `<a style="color:#0c66e4;font-weight:600">${p}</a>`).join(' · ')}</div>`;
const highlight2 = page(1840, 900, `${top('Spike alerts · Breakdowns · Data quality')}
<div class="wrap">
<div class="card"><h3>Spike alerts <span class="pill">2</span></h3><div class="d">Patterns that jumped in a watched organisation’s last 7 days, against the 7 before. Checked once a day.</div>
<div class="alert"><span><strong>Acme Airlines: POS terminal freezes at start of shift</strong><small>up 140% (36 vs 15 the week before) · 21/09/2026 to 27/09/2026<br><a>Open 36 tickets in Jira</a> · Ticket <a>OPS-412</a></small></span><span><span class="btn">Analyse</span><span class="btn s">Dismiss</span></span></div>
<div class="alert"><span><strong>Globex Rail: Ticket machine card errors</strong><small>new: 9 tickets, none the week before · 21/09/2026 to 27/09/2026<br><a>Open 9 tickets in Jira</a></small></span><span><span class="btn">Analyse</span><span class="btn s">Dismiss</span></span></div></div>
<div class="grid3">
<div class="card"><h3>By Base</h3><div class="d">Click a value to analyse just those tickets</div><ul class="vals">
${value('LHR', 'median 7.1 h to resolve · 5% open', 100, '≈1,204', '↑ 310', 'up')}${value('MAN', 'median 9.4 h to resolve · 3% open', 62, '≈748', '↑ 92', 'up')}${value('DUB', 'median 1.2 days to resolve · 11% open', 47, '≈566', 'New', 'new')}${value('STN', 'median 5.0 h to resolve · 2% open', 31, '≈377', '↓ 54', 'down')}</ul></div>
<div class="card"><h3>By Device type</h3><div class="d">Click a value to analyse just those tickets</div><ul class="vals">
${value('Handheld', 'median 6.8 h to resolve · 4% open', 100, '≈2,310', '↑ 402', 'up')}${value('Printer', 'median 4.2 h to resolve · 1% open', 28, '≈640', '↓ 21', 'down')}${value('Tablet', 'median 2.1 days to resolve · 9% open', 19, '≈433', '↑ 37', 'up')}</ul></div>
<div class="card"><h3>Data quality</h3><div class="d">Breakdown fields left empty or set to a placeholder such as “Unknown”.</div>
${quality('Base', 23, '993', ['Please update: ≈610', 'Unknown: ≈281', 'No value: ≈102'])}${quality('Device type', 6, '259', ['No value: ≈259'])}</div>
</div></div>`, '', 1.2);

const portalRow = (title, desc, trend, count, loz, cls, chev = '›') =>
  `<div class="row" style="grid-template-columns:1fr 150px 70px 80px 14px"><span><strong>${title}</strong><small>${desc}</small></span>${spark(trend)}<b>${count}</b><span class="loz ${cls}">${loz}</span><span>${chev}</span></div>`;
const highlight3 = page(1840, 900, `<div class="top" style="background:#1d3b78;color:#fff;border:0"><span style="background:#e2483d;border-radius:6px;padding:4px 7px;font-size:13px">AA</span>Acme Airlines Support<em style="color:#c9d5ef">Service report</em></div>
<div class="wrap"><div style="display:flex;justify-content:space-between;align-items:flex-end"><div><h2 style="font-size:24px">Acme Airlines</h2><span style="color:#6b778c">1 July 2026 – 30 September 2026</span></div><span style="color:#6b778c;font-size:14px">Updated 02/10/2026, 07:00 <span class="btn">Refresh</span></span></div>
<div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><small>Requests</small><b>4,316</b><i>in this period</i></div><div class="kpi"><small>Vs previous period</small><b>+12%</b><i>previous period: 3,854</i></div><div class="kpi"><small>Typical time to resolve</small><b>8.2 h</b><i>5% still open</i></div></div>
<div class="grid2" style="grid-template-columns:1fr 1.25fr">
<div class="card"><h3>Requests over time</h3><div class="d">Per week</div>${bars([52, 58, 61, 55, 63, 70, 66, 74, 81, 78, 85, 92, 60])}
<div class="ai" style="margin-top:16px"><b>Summary</b> · Requests rose 12%, mostly POS freezes at the start of shifts. Pairing issues are steady and sync problems at DUB are new since August. <small style="color:#6b778c">Written 30 September 2026.</small></div></div>
<div class="card"><h3>Most common issues</h3><div class="d">Open an issue to see how it’s trending and recent requests.</div>
${portalRow('POS terminal freezes at start of shift', 'The POS freezes on the loading screen when a shift starts.', UP, '≈412', '↑ 171', 'up', '⌄')}
<div class="detail"><div class="meta"><span>Rising through the period · usually resolved in 7.4 h · 6% still open</span></div>
${ticketTable([['SUP-8851', 'Handheld frozen on loading screen at gate 4', 'IN PROGRESS'], ['SUP-8820', 'POS stuck after login on early shift', 'RESOLVED']], ['Request', 'Summary', 'Status'])}</div>
${portalRow('Card reader won’t pair', 'Pin pads lose pairing after a restart.', FLAT, '≈206', '↓ 18', 'down')}
${portalRow('Sales not syncing after flight', 'Sales stay on the device after landing.', NEW, '≈131', 'New', 'new')}
</div></div></div>`, '', 1.27);

const hero = page(960, 600, `<div class="top" style="font-size:16px;padding:11px 18px">${img(26)}Customer Insights<em style="font-size:13px">Acme Airlines · Last 30 days</em></div>
<div class="wrap"><div class="kpis" style="grid-template-columns:repeat(4,1fr);gap:10px"><div class="kpi"><small>Tickets</small><b>1,482</b><i>in period</i></div><div class="kpi"><small>Vs previous</small><b>+18%</b><i>+226 tickets</i></div><div class="kpi"><small>Recurring issues</small><b>24</b><i>3+ related tickets</i></div><div class="kpi"><small>Time to resolve</small><b>2.4 days</b><i>7% still open</i></div></div>
<div class="card" style="padding:14px 16px"><h3 style="font-size:15px">Ticket activity</h3>${bars([40, 52, 49, 58, 55, 61, 66, 59, 70, 74, 68, 79, 83, 77, 88, 92, 85])}</div>
<div class="ai" style="font-size:13px;padding:12px 16px"><b>AI summary</b> · Volume is up 18%, driven by POS freezes at the start of shifts, mostly at LHR (≈412 tickets, rising). Card-reader pairing is steady. Sales sync failures are new this month and concentrated at DUB.<br><b>Next steps</b> · Review the latest terminal update with the vendor · Check the DUB network after the August change · Clean up “Please update” bases (23%).</div>
</div>`, '.kpi b{font-size:22px}.kpi{padding:10px 12px}.wrap{padding:16px 18px;gap:12px}.chart{height:110px;gap:6px}', 1.3);

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
for (const [name, html, w, h] of [['highlight-1-1840x900', highlight1, 1840, 900], ['highlight-2-1840x900', highlight2, 1840, 900], ['highlight-3-1840x900', highlight3, 1840, 900], ['hero-960x600', hero, 960, 600]]) {
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, html);
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, `--screenshot=${path.join(dir, `${name}.png`)}`, `file:///${file.replace(/\\/g, '/')}`], { stdio: 'ignore' });
  console.log('rendered', name);
}
