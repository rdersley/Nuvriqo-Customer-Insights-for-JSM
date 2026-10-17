// Sample data mode: a made-up IT managed service provider with seven client
// organisations and a year of tickets, answered in place of Jira so every
// screen can be tried (and shown) before real data is set up. Nothing here is
// written to Jira. Tickets are generated per day from a fixed seed, so a day's
// tickets are the same on every call; today's stop at the current time.
//
// fakeJira(path, init, now) answers the Jira REST calls the app makes (search,
// count, fields, organisations, statuses, ticket history, knowledge base,
// projects, client suggestions). Calls it doesn't know return null, and the
// caller sends them to Jira (server info, permission checks). Writes (create
// issue, comment, link) are refused.

const DAY = 86400000;
const HOUR = 3600000;
const MIN = 60000;
const DAYS_BACK = 400;

export const SAMPLE_FIELDS = {
  site: 'customfield_90001',
  category: 'customfield_90002',
  channel: 'customfield_90003',
  deviceId: 'customfield_90004',
  deviceType: 'customfield_90005',
  client: 'customfield_90006',
  ttr: 'customfield_90007',
  tfr: 'customfield_90008',
  csat: 'customfield_90009',
  orgs: 'customfield_90010',
};
const F = SAMPLE_FIELDS;

// ---- The customers ---------------------------------------------------------------
// rate: tickets a working day. breach: share of tickets that miss resolution SLA.
// csat: typical rating. stuck: share left open for a long time. trend: recent change.
export const SAMPLE_ORGS = [
  { id: '9001', name: 'Brightwell Dental Group', rate: 3.4, breach: 0.05, csat: 4.6, stuck: 0.003, trend: -0.15, app: 'Dentally',
    sites: ['Head office', 'Bath clinic', 'Bristol clinic', 'Cardiff clinic', 'Swindon clinic'], fleet: { Laptop: 40, Desktop: 55, Printer: 14 },
    mix: { logins: 3, email: 2, laptops: 2, printers: 3, network: 1, software: 2, security: 1, phones: 1 } },
  { id: '9002', name: 'Harbour & Finch Solicitors', rate: 2.8, breach: 0.24, csat: 3.2, stuck: 0.04, trend: 0.45, app: 'Clio',
    sites: ['London office', 'Manchester office', 'Remote'], fleet: { Laptop: 130, Desktop: 15, Printer: 9 },
    mix: { logins: 3, email: 4, laptops: 3, printers: 1, network: 1, software: 2, security: 2, phones: 1 } },
  { id: '9003', name: 'Northgate Retail', rate: 4.6, breach: 0.1, csat: 4.0, stuck: 0.008, trend: 0.05, app: 'Stock manager', weekend: 0.7,
    sites: ['Leeds store', 'York store', 'Sheffield store', 'Hull store', 'Warehouse', 'Head office'], fleet: { 'POS terminal': 48, 'Card reader': 52, Laptop: 30, Printer: 12 },
    mix: { logins: 2, email: 1, laptops: 1, printers: 2, network: 2, pos: 6, software: 1, phones: 1 } },
  { id: '9004', name: 'Meridian Logistics', rate: 3.0, breach: 0.13, csat: 3.8, stuck: 0.015, trend: 0.12, app: 'Scanner app',
    sites: ['North depot', 'South depot', 'Transport office', 'Head office'], fleet: { Laptop: 45, Desktop: 25, Printer: 16 },
    mix: { logins: 2, email: 2, laptops: 2, printers: 3, network: 3, software: 3, phones: 1 } },
  { id: '9005', name: 'Oakridge Academy', rate: 1.5, breach: 0.04, csat: 4.7, stuck: 0.003, trend: 0, app: 'Arbor', school: true,
    sites: ['Main building', 'Sports hall', 'Admin office'], fleet: { Laptop: 160, Desktop: 60, Printer: 10 },
    mix: { logins: 4, email: 1, laptops: 3, printers: 2, network: 2, software: 2 } },
  { id: '9006', name: 'Clearview Accountants', rate: 1.9, breach: 0.08, csat: 4.3, stuck: 0.008, trend: 0.05, app: 'Xero',
    sites: ['Head office', 'Remote'], fleet: { Laptop: 38, Desktop: 6, Printer: 4 },
    mix: { logins: 3, email: 3, laptops: 2, printers: 1, network: 3, software: 3, security: 1 } },
  { id: '9007', name: 'Summit Fitness Clubs', rate: 2.2, breach: 0.07, csat: 4.4, stuck: 0.003, trend: -0.05, app: 'Booking system', weekend: 0.8,
    sites: ['Reading club', 'Oxford club', 'Slough club', 'Head office'], fleet: { Laptop: 18, Desktop: 22, Printer: 8 },
    mix: { logins: 2, email: 1, laptops: 1, printers: 1, network: 2, software: 4, phones: 2 } },
];
export const SAMPLE_ORG_IDS = new Set(SAMPLE_ORGS.map((o) => o.id));

// ---- What tickets are about ----------------------------------------------------------
// group: the org mix key. hours: typical hours to resolve. esc: chance of 2nd line.
// kb: has a knowledge base article. device: the device type it is about.
const THEMES = [
  { key: 'password', group: 'logins', category: 'Accounts & logins', w: 4, hours: 1.5, esc: 0.03, kb: true, summaries: ['Password reset request', 'Reset password for {user}', 'Locked out of my account', 'Account locked - please unlock', 'Password expired, cannot log in', 'password reset {user}'] },
  { key: 'starter', group: 'logins', category: 'Accounts & logins', w: 1.5, hours: 20, esc: 0.15, kb: true, summaries: ['New starter: set up accounts for {user}', 'New user setup - {user}', 'Create accounts for new starter {user}'] },
  { key: 'leaver', group: 'logins', category: 'Accounts & logins', w: 0.8, hours: 6, esc: 0.05, kb: true, summaries: ['Leaver: disable account for {user}', 'Remove access for leaver {user}', 'Leaver {user} - remove licences'] },
  { key: 'mfa', group: 'logins', category: 'Accounts & logins', w: 1.2, hours: 2, esc: 0.08, kb: false, summaries: ['MFA code not arriving', 'Authenticator app not working on new phone', 'Reset MFA for {user}', 'Not getting the sign-in code on my phone'] },
  { key: 'outlook-password', group: 'email', category: 'Email & Microsoft 365', w: 0.6, hours: 5, esc: 0.2, kb: false, summaries: ['Outlook keeps asking for password', 'Outlook password prompt keeps popping up', 'Outlook asking for credentials repeatedly', 'Outlook keeps asking me to sign in'] },
  { key: 'shared-mailbox', group: 'email', category: 'Email & Microsoft 365', w: 1.5, hours: 4, esc: 0.03, kb: true, summaries: ['Access to the {box} shared mailbox', 'Add {user} to the {box} mailbox', 'Cannot see the {box} mailbox in Outlook'] },
  { key: 'teams', group: 'email', category: 'Email & Microsoft 365', w: 1.3, hours: 6, esc: 0.12, kb: false, summaries: ['Teams not loading', 'Teams calls dropping', 'No audio in Teams meetings', 'Teams stuck on loading screen'] },
  { key: 'mailbox-full', group: 'email', category: 'Email & Microsoft 365', w: 0.7, hours: 8, esc: 0.05, kb: true, summaries: ['Mailbox full warning', 'Mailbox almost full - please archive', 'Cannot send emails, mailbox full'] },
  { key: 'slow-laptop', group: 'laptops', category: 'Laptops & desktops', w: 1.6, hours: 24, esc: 0.2, kb: true, device: 'Laptop', summaries: ['Laptop running very slow', 'Laptop slow to start up', 'Laptop really slow since update'] },
  { key: 'no-power', group: 'laptops', category: 'Laptops & desktops', w: 0.8, hours: 30, esc: 0.45, kb: false, device: 'Laptop', summaries: ['Laptop will not turn on', 'Laptop not powering on', 'Laptop dead - no lights'] },
  { key: 'dock', group: 'laptops', category: 'Laptops & desktops', w: 1.1, hours: 10, esc: 0.15, kb: false, device: 'Laptop', summaries: ['Docking station not detecting monitors', 'Second screen not working with dock', 'Monitors not working through docking station'] },
  { key: 'desktop', group: 'laptops', category: 'Laptops & desktops', w: 1, hours: 20, esc: 0.25, kb: false, device: 'Desktop', summaries: ['PC blue screen on start up', 'Desktop PC keeps restarting', 'PC freezing at {site}'] },
  { key: 'printer-offline', group: 'printers', category: 'Printers', w: 2, hours: 8, esc: 0.1, kb: true, device: 'Printer', summaries: ['Printer offline', 'Printer showing offline at {site}', 'Cannot print - printer offline', 'printer offline again'] },
  { key: 'paper-jam', group: 'printers', category: 'Printers', w: 1, hours: 6, esc: 0.05, kb: true, device: 'Printer', summaries: ['Paper jam on the {site} printer', 'Printer jammed and showing error', 'Constant paper jams on printer'] },
  { key: 'scan-email', group: 'printers', category: 'Printers', w: 0.8, hours: 12, esc: 0.2, kb: false, device: 'Printer', summaries: ['Scan to email not working', 'Scanner not sending emails', 'Scan to email stopped working'] },
  { key: 'wifi', group: 'network', category: 'Network & Wi-Fi', w: 1.6, hours: 6, esc: 0.35, kb: false, summaries: ['Wi-Fi dropping at {site}', 'Wi-Fi keeps disconnecting', 'Poor Wi-Fi signal at {site}'] },
  { key: 'no-internet', group: 'network', category: 'Network & Wi-Fi', w: 0.8, hours: 3, esc: 0.5, kb: false, summaries: ['No internet at {site}', 'Internet down at {site}', 'Whole site has no internet'] },
  { key: 'vpn', group: 'network', category: 'Network & Wi-Fi', w: 1.2, hours: 4, esc: 0.25, kb: true, summaries: ['VPN not connecting', 'Cannot connect to VPN from home', 'VPN keeps disconnecting'] },
  { key: 'till', group: 'pos', category: 'Point of sale', w: 1.6, hours: 3, esc: 0.2, kb: true, device: 'POS terminal', summaries: ['Till frozen at {site}', 'POS terminal not responding', 'Till screen frozen', 'Till keeps crashing at {site}'] },
  { key: 'card-reader', group: 'pos', category: 'Point of sale', w: 1.3, hours: 3, esc: 0.3, kb: false, device: 'Card reader', summaries: ['Card reader not connecting', 'Card reader not connecting to till', 'Card payments failing - reader offline', 'Card reader offline at {site}'] },
  { key: 'receipt', group: 'pos', category: 'Point of sale', w: 0.8, hours: 6, esc: 0.05, kb: true, device: 'POS terminal', summaries: ['Receipt printer not working', 'Till not printing receipts', 'Receipt printer jammed'] },
  { key: 'app-install', group: 'software', category: 'Software & apps', w: 1.2, hours: 16, esc: 0.05, kb: true, summaries: ['Install {app} for {user}', 'Please install {app} on my laptop', 'Need {app} installed'] },
  { key: 'app-crash', group: 'software', category: 'Software & apps', w: 1.4, hours: 20, esc: 0.35, kb: false, summaries: ['{app} crashing', '{app} keeps freezing', '{app} not opening', '{app} error when saving'] },
  { key: 'app-licence', group: 'software', category: 'Software & apps', w: 0.6, hours: 24, esc: 0.1, kb: false, summaries: ['{app} licence expired', '{app} says licence not valid'] },
  { key: 'phishing', group: 'security', category: 'Security', w: 1.4, hours: 2, esc: 0.3, kb: true, summaries: ['Phishing email reported', 'Suspicious email received', 'Clicked a link in a suspicious email'] },
  { key: 'login-alert', group: 'security', category: 'Security', w: 0.6, hours: 3, esc: 0.5, kb: false, summaries: ['Suspicious sign-in alert', 'Unusual sign-in activity on my account'] },
  { key: 'desk-phone', group: 'phones', category: 'Phones', w: 1, hours: 8, esc: 0.2, kb: false, summaries: ['Desk phone no dial tone', 'Desk phone not working at {site}', 'Phone showing no service'] },
  { key: 'voicemail', group: 'phones', category: 'Phones', w: 0.6, hours: 6, esc: 0.05, kb: true, summaries: ['Voicemail not working', 'Set up voicemail for {user}', 'Voicemail PIN reset'] },
];
const THEME = new Map(THEMES.map((t) => [t.key, t]));

// Stories in the data: what changed recently, by customer (multiplier on a theme's weight by days ago).
const STORIES = {
  9002: { 'outlook-password': (ago) => (ago < 35 ? 1 + 9 * (1 - ago / 35) : 1), vpn: (ago) => (ago < 60 ? 1.6 : 1) },
  9003: { 'card-reader': (ago) => (ago < 12 ? 2.2 : 1) },
  9004: { 'app-crash': (ago) => (ago < 28 ? 3.5 : 1), wifi: (ago) => (ago < 40 ? 1.8 : 1) },
  9006: { vpn: (ago) => (ago < 7 ? 6 : 1) },
  9007: { 'app-crash': (ago) => (ago > 90 && ago < 120 ? 3 : 1) },
};

const USERS = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Jack', 'Isla', 'Oscar', 'Mia', 'Leo', 'Grace', 'Harry', 'Ruby', 'Arthur', 'Freya', 'Alfie'];
const BOXES = ['Accounts', 'Reception', 'Bookings', 'HR', 'Operations', 'Info'];
const DESCRIPTIONS = [
  'Started this morning. Tried restarting but no change.',
  'Affecting a couple of people here. Please call back when you can.',
  'This has happened a few times this week.',
  'Urgent please, customers waiting.',
  'Not sure what changed, it was fine yesterday.',
  'Screenshot attached. Error comes up straight away.',
];
const AGENTS = [
  { accountId: 'sample-agent-1', displayName: 'Alex Morgan', level: 1 },
  { accountId: 'sample-agent-2', displayName: 'Priya Shah', level: 1 },
  { accountId: 'sample-agent-3', displayName: 'Tom Becker', level: 1 },
  { accountId: 'sample-agent-4', displayName: 'Chloe Adams', level: 1 },
  { accountId: 'sample-agent-5', displayName: 'Sam O’Neill', level: 1 },
  { accountId: 'sample-agent-6', displayName: 'Maria Lopez', level: 2 },
  { accountId: 'sample-agent-7', displayName: 'Jordan Lee', level: 2 },
  { accountId: 'sample-agent-8', displayName: 'Ben Carter', level: 3 },
];
const STATUSES = [
  { id: '90101', name: 'Open', statusCategory: { key: 'new' } },
  { id: '90102', name: 'In Progress 1st Line', statusCategory: { key: 'indeterminate' } },
  { id: '90103', name: 'Escalated to 2nd Line', statusCategory: { key: 'indeterminate' } },
  { id: '90104', name: 'With 3rd Line', statusCategory: { key: 'indeterminate' } },
  { id: '90105', name: 'Waiting for customer', statusCategory: { key: 'indeterminate' } },
  { id: '90108', name: 'Waiting for support', statusCategory: { key: 'indeterminate' } },
  { id: '90106', name: 'Resolved', statusCategory: { key: 'done' } },
  { id: '90107', name: 'Closed', statusCategory: { key: 'done' } },
];
const STATUS = Object.fromEntries(STATUSES.map((s) => [s.name, s]));
const CHANNELS = [['Email', 0.4], ['Phone', 0.3], ['Portal', 0.25], ['Chat', 0.05]];
const PRIORITIES = [['Low', 0.3], ['Medium', 0.52], ['High', 0.14], ['Highest', 0.04]];
const DEVICE_PREFIX = { Laptop: 'LT', Desktop: 'PC', Printer: 'PR', 'POS terminal': 'POS', 'Card reader': 'CR' };

export const SAMPLE_PROJECTS = [{ key: 'SUP', name: 'Client Support' }, { key: 'INT', name: 'Internal IT' }];

// ---- Seeded randomness -------------------------------------------------------------------
function rng(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const weighted = (r, pairs) => { let x = r() * pairs.reduce((n, [, w]) => n + w, 0); for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; } return pairs[pairs.length - 1][0]; };
function poisson(r, mean) { const l = Math.exp(-mean); let k = 0; let p = 1; do { k += 1; p *= r(); } while (p > l && k < 60); return k - 1; }
const logNormal = (r, median, spread = 0.9) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()));
// Working hours, busier in the morning; phone calls more so.
const HOURS = [0.05, 0.02, 0.02, 0.02, 0.03, 0.08, 0.3, 1.1, 2.6, 3.1, 2.6, 2.2, 1.6, 1.9, 2.1, 1.8, 1.4, 0.9, 0.5, 0.35, 0.3, 0.25, 0.15, 0.08];

// ---- Tickets ---------------------------------------------------------------------------------
function dayVolume(org, date, ago) {
  const dow = new Date(date).getUTCDay();
  const week = [org.weekend ? 0.55 * org.weekend : 0.06, 1.3, 1.15, 1.05, 1, 0.85, org.weekend ? 0.75 * org.weekend : 0.12][dow];
  const month = new Date(date).getUTCMonth();
  const season = org.school ? ([0.95, 1, 0.95, 0.85, 1, 1, 0.85, 0.6, 1.1, 1.05, 1, 0.85][month]) : (month === 11 ? 0.85 : 1);
  const trend = 1 + org.trend * Math.max(0, 1 - ago / 45);
  return 1.6 * org.rate * week * season * trend;
}

function makeTicket(org, theme, created, r, n, extra = {}) {
  // n: the key number; ids are kept apart from keys (SUP-1234 has id 10001234).
  const site = extra.site || pick(r, org.sites);
  const summary = pick(r, theme.summaries).replace('{user}', pick(r, USERS)).replace('{site}', site).replace('{app}', org.app).replace('{box}', pick(r, BOXES));
  const priority = theme.group === 'pos' || theme.key === 'no-internet' ? weighted(r, [['Medium', 0.4], ['High', 0.4], ['Highest', 0.2]]) : weighted(r, PRIORITIES);
  const esc2 = r() < theme.esc * (org.id === '9002' ? 1.4 : 1);
  const esc3 = esc2 && r() < 0.25;
  const level = esc3 ? 3 : esc2 ? 2 : 1;
  const stuck = r() < org.stuck;
  const hours = stuck ? 24 * (35 + r() * 75) : logNormal(r, theme.hours * (level === 3 ? 3.5 : level === 2 ? 2 : 1) * (org.id === '9002' ? 1.6 : 1));
  const firstTouch = created + Math.min(hours * HOUR * 0.3, (5 + r() * 55) * MIN);
  const t2 = esc2 ? firstTouch + Math.min(hours * HOUR * 0.4, (0.5 + r() * 6) * HOUR) : null;
  const t3 = esc3 ? t2 + Math.min(hours * HOUR * 0.3, (1 + r() * 12) * HOUR) : null;
  const resolvedAt = Math.max(created + 2 * MIN, created + hours * HOUR, (t3 || t2 || firstTouch) + 10 * MIN);
  const agent1 = AGENTS[Math.floor(r() * 5)];
  const agent2 = AGENTS[5 + Math.floor(r() * 2)];
  const breached = r() < org.breach * (level > 1 ? 1.8 : 1) || hours > 72;
  const responseBreached = r() < org.breach / 3;
  const rated = r() < 0.35 ? Math.max(1, Math.min(5, Math.round(org.csat + (r() - 0.5) * 2.2 - (breached ? 1 : 0)))) : null;
  const handled = r() < 0.75 ? Math.round((10 + logNormal(r, 25) * (level === 1 ? 1 : 2.5)) * 60) : null;
  const fleetCount = theme.device ? org.fleet[theme.device] || 0 : 0;
  const deviceId = fleetCount && r() < 0.85 ? `${DEVICE_PREFIX[theme.device]}-${String(1 + Math.floor(r() * fleetCount)).padStart(3, '0')}` : null;
  return {
    id: String(10000000 + n), key: `SUP-${n}`, project: 'SUP', org, theme, site, summary,
    description: pick(r, DESCRIPTIONS),
    created, firstTouch, t2, t3, resolvedAt, waits: r() < 0.15,
    level, priority, agent1, agent2, breached, responseBreached, rated, handled, deviceId,
    channel: theme.group === 'pos' ? weighted(r, [['Phone', 0.7], ['Email', 0.2], ['Portal', 0.1]]) : weighted(r, CHANNELS),
    issueType: ['no-internet', 'card-reader', 'till', 'wifi', 'login-alert', 'phishing', 'no-power', 'app-crash'].includes(theme.key) ? 'Incident' : 'Service request',
  };
}

let cache = null;
/** Every sample ticket created up to `now`, newest first (cached per minute). */
export function sampleTickets(now = Date.now()) {
  const minute = Math.floor(now / MIN);
  if (cache?.minute === minute) return cache.tickets;
  const today = Math.floor(now / DAY);
  const tickets = [];
  for (let d = today - DAYS_BACK; d <= today; d += 1) {
    const date = d * DAY;
    const ago = today - d;
    SAMPLE_ORGS.forEach((org, o) => {
      const r = rng('day', org.id, d);
      const count = Math.min(40, poisson(r, dayVolume(org, date, ago)));
      const stories = STORIES[org.id] || {};
      const themes = THEMES.filter((t) => org.mix[t.group]).map((t) => [t, org.mix[t.group] * t.w * (stories[t.key] ? stories[t.key](ago) : 1)]);
      for (let i = 0; i < count; i += 1) {
        const theme = weighted(r, themes);
        const hour = weighted(r, HOURS.map((w, h) => [h, w]));
        const created = date + hour * HOUR + Math.floor(r() * 60) * MIN;
        const n = (d - 20200) * 300 + o * 40 + i; // stable per day, organisation and order
        if (created <= now) tickets.push(makeTicket(org, theme, created, r, n));
      }
    });
    // Internal IT (the provider's own staff): a few a day, no customer.
    const r = rng('int', d);
    for (let i = 0, c = poisson(r, [0.2, 1.4, 1.2, 1, 1, 0.8, 0.1][new Date(date).getUTCDay()]); i < c; i += 1) {
      const theme = weighted(r, THEMES.filter((t) => ['logins', 'laptops', 'software', 'email'].includes(t.group)).map((t) => [t, t.w]));
      const created = date + weighted(r, HOURS.map((w, h) => [h, w])) * HOUR + Math.floor(r() * 60) * MIN;
      const internalOrg = { id: '', name: '', sites: ['Head office'], app: 'PSA tool', breach: 0.05, csat: 4.5, stuck: 0.01, fleet: { Laptop: 25 } };
      const n = (d - 20200) * 10 + i;
      if (created <= now) tickets.push({ ...makeTicket(internalOrg, theme, created, r, n), id: String(20000000 + n), project: 'INT', key: `INT-${n}`, internal: true });
    }
  }
  // A live surge for Northgate Retail: card readers dropping off across stores right now.
  const north = SAMPLE_ORGS[2];
  const r = rng('surge', today);
  for (let k = 0; k < 9; k += 1) {
    const t = makeTicket(north, THEME.get('card-reader'), now - (3 + k * 5) * MIN, r, 900001 + k, { site: north.sites[k % 4] });
    tickets.push({ ...t, summary: ['Card reader not connecting', 'Card reader not connecting', 'card reader not connecting to till'][k % 3].replace('{site}', t.site), priority: 'High', resolvedAt: now + 3 * HOUR, firstTouch: now + 5 * MIN, t2: null, t3: null, level: 1 });
  }
  tickets.sort((a, b) => b.created - a.created);
  cache = { minute, tickets, byId: new Map(tickets.map((t) => [t.id, t])) };
  return tickets;
}
const ticketById = (id, now) => { sampleTickets(now); return cache.byId.get(String(id)); };

/** A ticket's state at `now`: status, resolution date and who has it. */
function stateOf(t, now) {
  if (t.resolvedAt <= now) return { status: now - t.resolvedAt > 7 * DAY ? STATUS.Closed : STATUS.Resolved, resolved: t.resolvedAt, assignee: t.level > 1 ? t.agent2 : t.agent1 };
  if (t.firstTouch > now) return { status: STATUS.Open, resolved: null, assignee: null };
  const reached = t.t3 && t.t3 <= now ? 3 : t.t2 && t.t2 <= now ? 2 : 1;
  const status = t.waits && reached === 1 ? STATUS['Waiting for customer'] : [STATUS['In Progress 1st Line'], STATUS['Escalated to 2nd Line'], STATUS['With 3rd Line']][reached - 1];
  return { status, resolved: null, assignee: reached === 3 ? AGENTS[7] : reached === 2 ? t.agent2 : t.agent1 };
}

const iso = (ms) => (ms ? new Date(ms).toISOString().replace('Z', '+0000') : null);
const opt = (value) => (value ? { value } : null);
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const sla = (name, breached, done) => (done ? { name, completedCycles: [{ breached }] } : { name, completedCycles: [], ongoingCycle: { breached } });

/** A ticket as Jira's search returns it. */
function issueOf(t, now) {
  const s = stateOf(t, now);
  const done = Boolean(s.resolved);
  return {
    id: t.id,
    key: t.key,
    fields: {
      summary: t.summary,
      description: adf(t.description),
      created: iso(t.created),
      resolutiondate: iso(s.resolved),
      status: { id: s.status.id, name: s.status.name, statusCategory: s.status.statusCategory },
      timespent: done || t.firstTouch <= now ? t.handled : null,
      project: { key: t.project },
      issuetype: { name: t.issueType },
      priority: { name: t.priority },
      assignee: s.assignee ? { accountId: s.assignee.accountId, displayName: s.assignee.displayName } : null,
      [F.site]: opt(t.site),
      [F.category]: opt(t.theme.category),
      [F.channel]: opt(t.channel),
      [F.deviceId]: t.deviceId,
      [F.deviceType]: opt(t.deviceId ? t.theme.device : null),
      [F.client]: opt(t.org.name || null),
      [F.ttr]: sla('Time to resolution', t.breached && (done || now - t.created > 24 * HOUR), done),
      [F.tfr]: { name: 'Time to first response', completedCycles: t.firstTouch <= now ? [{ breached: t.responseBreached }] : [] },
      [F.csat]: done && t.rated ? { rating: t.rated } : null,
      [F.orgs]: t.org.id ? [{ id: Number(t.org.id), name: t.org.name }] : [],
    },
  };
}

/** Status and assignee changes, as Jira's bulk changelog returns them (created in epoch ms). */
function historyOf(t, now) {
  const out = [];
  let n = 0;
  const change = (at, items) => { if (at <= now) out.push({ id: `${t.id}-${n += 1}`, created: Math.round(at), author: { accountId: AGENTS[0].accountId, displayName: AGENTS[0].displayName }, items }); };
  const status = (from, to) => ({ fieldId: 'status', field: 'status', from: STATUS[from].id, fromString: from, to: STATUS[to].id, toString: to });
  const assignee = (from, to) => ({ fieldId: 'assignee', field: 'assignee', from: from?.accountId || null, fromString: from?.displayName || null, to: to.accountId, toString: to.displayName });
  // Agents work a ticket for minutes at each level; the rest of the time it waits
  // (for support, or for the customer), so handling time (AHT) looks like real work.
  const work = Math.max(5 * MIN, (t.handled || 1200) * 1000);
  const levels = [['In Progress 1st Line', t.firstTouch], ...(t.t2 ? [['Escalated to 2nd Line', t.t2]] : []), ...(t.t3 ? [['With 3rd Line', t.t3]] : [])];
  const owners = [t.agent1, t.agent2, AGENTS[7]];
  let current = 'Open';
  levels.forEach(([name, start], i) => {
    const end = levels[i + 1]?.[1] ?? t.resolvedAt;
    const share = work / levels.length;
    change(start, [assignee(i ? owners[i - 1] : null, owners[i]), status(current, name)]);
    current = name;
    if (end - start > share * 1.5) {
      const waiting = t.waits && i === levels.length - 1 ? 'Waiting for customer' : 'Waiting for support';
      change(start + share * 0.7, [status(name, waiting)]);
      change(end - share * 0.3, [status(waiting, name)]);
    }
  });
  change(t.resolvedAt, [status(current, 'Resolved')]);
  if (now - t.resolvedAt > 7 * DAY) change(t.resolvedAt + 7 * DAY, [status('Resolved', 'Closed')]);
  return out;
}

// ---- JQL (the subset the app writes) ---------------------------------------------------------
const TOKEN = /\s*(\(|\)|,|!=|>=|<=|=|>|<|~|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s(),=!<>~"']+)/y;
function tokens(jql) {
  const out = [];
  TOKEN.lastIndex = 0;
  let m;
  while (TOKEN.lastIndex < jql.length && (m = TOKEN.exec(jql))) out.push(m[1]);
  return out;
}
const unquote = (v) => (/^["']/.test(v) ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v);

function timeValue(v, now) {
  const rel = /^-(\d+)([mhdw])$/.exec(v);
  if (rel) return now - Number(rel[1]) * { m: MIN, h: HOUR, d: DAY, w: 7 * DAY }[rel[2]];
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : `${v.replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? null : t;
}

function fieldValue(issue, t, field) {
  const f = field.toLowerCase();
  const cf = /^cf\[(\d+)\]$/.exec(f);
  if (cf) { const v = issue.fields[`customfield_${cf[1]}`]; return Array.isArray(v) ? v.map((x) => x?.value ?? x?.name ?? x) : v?.value ?? v ?? null; }
  switch (f) {
    case 'organizations': case 'organization': return t.org.name || null;
    case 'project': return t.project;
    case 'created': return t.created;
    case 'resolved': case 'resolutiondate': return issue.fields.resolutiondate ? Date.parse(issue.fields.resolutiondate) : null;
    case 'statuscategory': return { new: 'To Do', indeterminate: 'In Progress', done: 'Done' }[issue.fields.status.statusCategory.key];
    case 'status': return issue.fields.status.name;
    case 'priority': return t.priority;
    case 'issuetype': case 'type': return t.issueType;
    case 'key': case 'issuekey': return t.key;
    case 'text': return `${t.summary} ${t.description}`;
    default: return null;
  }
}

function compile(jql) {
  const list = tokens(jql.replace(/\s+ORDER\s+BY[\s\S]*$/i, ''));
  let i = 0;
  const peek = () => list[i];
  const is = (word) => String(peek() || '').toUpperCase() === word;
  const next = () => list[i++];
  const expect = (v) => { if (next() !== v) throw new Error(`Sample data: unexpected JQL near ${list.slice(i - 1, i + 3).join(' ')}`); };
  function value() {
    const v = next();
    if (peek() === '(') { next(); const args = []; while (peek() !== ')') { args.push(unquote(next())); if (peek() === ',') next(); } next(); return { fn: v, args }; }
    return unquote(v);
  }
  function clause() {
    const field = next();
    if (is('IS')) { next(); const not = is('NOT'); if (not) next(); next(); return (iss, t) => { const v = fieldValue(iss, t, field); const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length); return not ? !empty : empty; }; }
    let op = next();
    if (op.toUpperCase() === 'NOT' && is('IN')) { next(); op = 'not in'; } else if (op.toUpperCase() === 'IN') op = 'in';
    if (op === 'in' || op === 'not in') {
      expect('(');
      const values = [];
      while (peek() !== ')') { values.push(String(unquote(next())).toLowerCase()); if (peek() === ',') next(); }
      next();
      return (iss, t) => { const v = fieldValue(iss, t, field); const have = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? '').toLowerCase()); const hit = have.some((x) => values.includes(x)); return op === 'in' ? hit : !hit; };
    }
    const raw = value();
    if (raw?.fn) return () => false; // cascadeOption(): no cascading fields in the sample
    const time = ['created', 'resolved', 'resolutiondate'].includes(field.toLowerCase());
    return (iss, t, now) => {
      const v = fieldValue(iss, t, field);
      if (op === '~') { const words = String(raw).toLowerCase().split(/\W+/).filter((w) => w.length > 1); const text = String(v || '').toLowerCase(); return words.every((w) => text.includes(w)); }
      if (time) {
        const target = timeValue(raw, now);
        if (v === null || target === null) return false;
        return { '>=': v >= target, '>': v > target, '<': v < target, '<=': v <= target, '=': v === target, '!=': v !== target }[op];
      }
      const have = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? '').toLowerCase());
      const hit = have.includes(String(raw).toLowerCase());
      return op === '!=' ? !hit : hit;
    };
  }
  function unary() {
    if (is('NOT')) { next(); const p = unary(); return (...a) => !p(...a); }
    if (peek() === '(') { next(); const p = or(); expect(')'); return p; }
    return clause();
  }
  function and() { let p = unary(); while (is('AND')) { next(); const a = p; const b = unary(); p = (...x) => a(...x) && b(...x); } return p; }
  function or() { let p = and(); while (is('OR')) { next(); const a = p; const b = and(); p = (...x) => a(...x) || b(...x); } return p; }
  const predicate = list.length ? or() : () => true;
  if (i < list.length) throw new Error(`Sample data: couldn’t read the JQL near ${list.slice(i, i + 4).join(' ')}`);
  return predicate;
}
const compiled = new Map();
function matching(jql, now) {
  if (!compiled.has(jql)) { if (compiled.size > 500) compiled.clear(); compiled.set(jql, compile(jql)); }
  const p = compiled.get(jql);
  // Tickets are cached per minute, so each one's Jira form is worked out once a minute too.
  return sampleTickets(now).filter((t) => p(t.issue || (t.issue = issueOf(t, now)), t, now));
}

// ---- Fields and the REST answers ----------------------------------------------------------------
const option = { type: 'option' };
export const SAMPLE_FIELD_LIST = [
  { id: 'summary', name: 'Summary', schema: { type: 'string', system: 'summary' } },
  { id: 'priority', name: 'Priority', schema: { type: 'priority', system: 'priority' } },
  { id: 'issuetype', name: 'Issue Type', schema: { type: 'issuetype', system: 'issuetype' } },
  { id: 'labels', name: 'Labels', schema: { type: 'array', items: 'string', system: 'labels' } },
  { id: F.site, name: 'Site', schema: { ...option, custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' } },
  { id: F.category, name: 'Category', schema: { ...option, custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' } },
  { id: F.channel, name: 'Contact channel', schema: { ...option, custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' } },
  { id: F.deviceId, name: 'Device ID', schema: { type: 'string', custom: 'com.atlassian.jira.plugin.system.customfieldtypes:textfield' } },
  { id: F.deviceType, name: 'Device type', schema: { ...option, custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' } },
  { id: F.client, name: 'Client', schema: { ...option, custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select' } },
  { id: F.ttr, name: 'Time to resolution', schema: { type: 'sd-servicelevelagreement', custom: 'com.atlassian.servicedesk:sd-sla-field' } },
  { id: F.tfr, name: 'Time to first response', schema: { type: 'sd-servicelevelagreement', custom: 'com.atlassian.servicedesk:sd-sla-field' } },
  { id: F.csat, name: 'Satisfaction', schema: { type: 'sd-feedback', custom: 'com.atlassian.servicedesk:sd-request-feedback' } },
  { id: F.orgs, name: 'Organizations', schema: { type: 'array', items: 'sd-customerorganization', custom: 'com.atlassian.servicedesk:sd-customer-organizations' } },
];
const KB_TITLES = {
  password: 'How to reset your password', starter: 'New starter checklist', leaver: 'Leaver process', 'shared-mailbox': 'Getting access to a shared mailbox',
  'mailbox-full': 'Archiving email when your mailbox is full', 'slow-laptop': 'Speeding up a slow laptop', 'printer-offline': 'Printer shows offline',
  'paper-jam': 'Clearing a paper jam', vpn: 'Connecting to the VPN from home', till: 'Restarting a frozen till', receipt: 'Receipt printer troubleshooting',
  'app-install': 'Requesting new software', phishing: 'What to do with a suspicious email', voicemail: 'Setting up voicemail',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const pathOf = (route) => (typeof route === 'string' ? route : route?.value ?? String(route));

/**
 * The sample answer to a Jira request, or null to send it to Jira. `path` is
 * the route; `init` the fetch options.
 */
export async function fakeJira(route, init = {}, now = Date.now()) {
  const path = pathOf(route);
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const method = String(init.method || 'GET').toUpperCase();
  const body = init.body ? JSON.parse(init.body) : {};

  if (base === '/rest/api/3/search/jql' && method === 'POST') {
    const found = matching(body.jql || '', now);
    const start = Number(body.nextPageToken || 0);
    const size = Math.min(Number(body.maxResults) || 50, 100);
    const page = found.slice(start, start + size).map((t) => t.issue);
    return json({ issues: page, ...(start + size < found.length ? { nextPageToken: String(start + size) } : {}) });
  }
  if (base === '/rest/api/3/search/approximate-count' && method === 'POST') return json({ count: matching(body.jql || '', now).length });
  if (base === '/rest/api/3/changelog/bulkfetch' && method === 'POST') {
    const wanted = new Set(body.fieldIds || ['status', 'assignee']);
    const logs = (body.issueIdsOrKeys || []).map((id) => ticketById(id, now)).filter(Boolean).map((t) => ({
      issueId: t.id,
      changeHistories: historyOf(t, now).map((h) => ({ ...h, items: h.items.filter((item) => wanted.has(item.fieldId)) })).filter((h) => h.items.length),
    }));
    return json({ issueChangeLogs: logs });
  }
  if (base === '/rest/api/3/field') return json(SAMPLE_FIELD_LIST);
  if (base === '/rest/api/3/status') return json(STATUSES);
  if (base === '/rest/servicedeskapi/organization') {
    if (params.get('accountId')) return null; // portal membership: never sample
    return json({ values: SAMPLE_ORGS.map(({ id, name }) => ({ id, name })), isLastPage: true });
  }
  const org = /^\/rest\/servicedeskapi\/organization\/(\d+)$/.exec(base);
  if (org) { const o = SAMPLE_ORGS.find((x) => x.id === org[1]); return o ? json({ id: o.id, name: o.name }) : json({ errorMessage: 'Not found' }, 404); }
  if (base === '/rest/servicedeskapi/servicedesk') return json({ values: [{ id: '1', projectKey: 'SUP', projectName: 'Client Support' }], isLastPage: true });
  if (base === '/rest/api/3/project/search') return json({ values: SAMPLE_PROJECTS, isLast: true });
  if (base === '/rest/api/3/jql/autocompletedata/suggestions') {
    const text = String(params.get('fieldValue') || '').toLowerCase();
    return json({ results: SAMPLE_ORGS.filter((o) => o.name.toLowerCase().includes(text)).map((o) => ({ value: `"${o.name}"`, displayName: o.name })) });
  }
  if (base === '/rest/servicedeskapi/knowledgebase/article') {
    const words = String(params.get('query') || '').toLowerCase().split(/\s+/).filter(Boolean);
    const hits = THEMES.filter((t) => KB_TITLES[t.key] && t.summaries.some((s) => words.filter((w) => s.toLowerCase().includes(w)).length >= Math.min(2, words.length)));
    return json({ values: hits.slice(0, 3).map((t, n) => ({ title: KB_TITLES[t.key], source: { type: 'confluence', pageId: String(5000 + THEMES.indexOf(t)), spaceKey: 'KB' } })) });
  }
  if (method !== 'GET' && /^\/rest\/api\/3\/(issue|issueLink)/.test(base)) {
    return json({ errorMessages: ['Not available with sample data: turn sample data off in Customer Insights settings to create tickets.'] }, 403);
  }
  if (/^\/rest\/api\/3\/issue\/createmeta\//.test(base)) return json({ issueTypes: [{ id: '1', name: 'Problem' }, { id: '2', name: 'Incident' }, { id: '3', name: 'Task' }] });
  if (base === '/rest/api/3/issueLinkType') return json({ issueLinkTypes: [{ id: '1', name: 'Relates', inward: 'relates to', outward: 'relates to' }] });
  return null;
}

/** Settings for sample mode: every feature set up for the sample fields and customers. */
export function sampleSettingsInput() {
  const all = SAMPLE_ORGS.map(({ id, name }) => ({ id, name }));
  return {
    breakdowns: [{ id: F.site, label: 'Site', portal: true }, { id: F.category, label: 'Category', portal: true }, { id: 'priority', label: 'Priority' }],
    internalBreakdowns: [{ id: F.category, label: 'Category' }, { id: 'priority', label: 'Priority' }],
    projectProfiles: [{
      id: 'p-sup-sample', name: 'Client Support', projects: ['SUP'],
      breakdowns: [{ id: F.category, label: 'Category' }, { id: 'priority', label: 'Priority' }],
      clientFields: [{ id: F.client }], slaFields: [{ id: F.ttr }, { id: F.tfr }],
      escalation: { enabled: true },
    }],
    handlingStatuses: [],
    channelField: { id: F.channel },
    devices: {
      idFieldId: F.deviceId, typeFieldId: F.deviceType,
      types: ['Laptop', 'Desktop', 'Printer', 'POS terminal', 'Card reader'].map((label) => ({ label, values: [label.toLowerCase()] })),
      fleets: SAMPLE_ORGS.map((o) => ({ organization: { id: o.id, name: o.name }, counts: o.fleet })),
      p1Percent: 15, p2Percent: 5,
    },
    slaFields: [{ id: F.ttr }, { id: F.tfr }],
    clientFields: [{ id: F.client }],
    portalEnabled: true,
    minPatternSize: 3,
    synonyms: [['card reader', 'pinpad', 'pin pad', 'card terminal', 'payment terminal'], ['wi-fi', 'wifi', 'wireless'], ['login', 'log in', 'sign in', 'signin'], ['pc', 'desktop', 'computer']],
    alerts: { enabled: true, organizations: all, thresholdPercent: 50, minTickets: 5, createIssue: false },
    surge: { enabled: true, organizations: [all[2], all[3]], windowMinutes: 60, minTickets: 6, multiple: 3, minBases: 2, baseFieldId: F.site, createIssue: false },
    health: { enabled: true, organizations: all },
  };
}
