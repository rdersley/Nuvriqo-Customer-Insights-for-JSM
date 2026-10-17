// Sample data mode end to end: the resolvers and background jobs run against
// src/sample.js instead of Jira, and every report section has something in it.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const queued = [];
const toJira = [];
mock.module('@forge/kvs', {
  namedExports: {
    kvs: {
      get: async (k) => store.get(k),
      set: async (k, v) => { store.set(k, v); },
      delete: async (k) => { store.delete(k); },
      query: () => {
        const q = { prefix: '', where(_, c) { q.prefix = c.prefix; return q; }, limit() { return q; }, cursor() { return q; },
          getMany: async () => ({ results: [...store.entries()].filter(([k]) => k.startsWith(q.prefix)).map(([key, value]) => ({ key, value })) }) };
        return q;
      },
    },
    WhereConditions: { beginsWith: (prefix) => ({ prefix }) },
  },
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const realJira = () => ({
  requestJira: async (path) => {
    toJira.push(String(path));
    if (String(path).startsWith('/rest/api/3/mypermissions')) return json({ permissions: { ADMINISTER: { havePermission: true }, ADMINISTER_PROJECTS: { havePermission: true } } });
    if (String(path) === '/rest/api/3/serverInfo') return json({ baseUrl: 'https://example.atlassian.net' });
    if (String(path).startsWith('/rest/servicedeskapi/organization?')) return json({ values: [{ id: '1', name: 'Real customer' }], isLastPage: true });
    return json({}, 404);
  },
});
mock.module('@forge/api', {
  namedExports: {
    route: (strings, ...values) => strings.reduce((out, s, i) => out + s + (i < values.length ? encodeURIComponent(values[i]) : ''), ''),
    asUser: realJira,
    asApp: realJira,
    fetch: async () => json({}, 404),
  },
});
mock.module('@forge/events', { namedExports: { Queue: class { async push(event) { queued.push(event.body); } } } });

const call = async (handler, functionKey, payload = {}) => handler({ call: { functionKey, payload }, context: { accountType: 'licensed', environmentType: 'DEVELOPMENT' } });
const day = (ago) => new Date(Date.now() - ago * 86400000).toISOString().slice(0, 10);
const period = { startDate: day(30), endDate: day(1) };

test('sample data answers the agent page, settings and background jobs', async () => {
  const { handler } = await import('../src/index.js');
  const { SAMPLE_ORGS } = await import('../src/sample.js');

  // Off: the organisation list comes from Jira.
  assert.equal((await call(handler, 'getOrganizations')).sample, false);
  await call(handler, 'setSampleData', { enabled: true });
  assert.equal(store.get('sample-data').enabled, true);
  // Turning it on queues the health scores and spike checks.
  assert.equal(queued.filter((q) => q.type === 'health').length, 7);

  const orgs = await call(handler, 'getOrganizations');
  assert.equal(orgs.sample, true);
  assert.deepEqual(orgs.organizations.map((o) => o.name), SAMPLE_ORGS.map((o) => o.name));

  const settings = await call(handler, 'getSettings');
  assert.equal(settings.sample.enabled, true);
  assert.equal(settings.settings.breakdowns.length, 3);
  assert.equal(settings.settings.health.organizations.length, 7);
  assert.ok(settings.settings.devices.fleets.length === 7);

  // A customer report: patterns, breakdowns, SLAs, channels, devices, satisfaction.
  const harbour = { id: '9002', name: 'Harbour & Finch Solicitors' };
  const report = await call(handler, 'analyze', { organization: harbour, organizations: [harbour], ...period, timeZone: 'Europe/London' });
  assert.ok(report.currentCount > 50, `tickets ${report.currentCount}`);
  assert.ok(report.groups.length >= 5, `groups ${report.groups.length}`);
  assert.match(report.groups.map((g) => g.theme).join(' | '), /outlook/i);
  assert.equal(report.breakdowns.length, 3);
  assert.equal(report.sla.length, 2);
  assert.ok(report.satisfaction.rated > 5);
  assert.ok(Object.keys(report.timeOfDay.byChannel || {}).length >= 3);
  assert.ok(report.devices.any > 0);
  assert.ok(report.deviceFleet.Laptop === 130);

  const flow = await call(handler, 'analyzeFlow', { organization: harbour, organizations: [harbour], ...period });
  assert.equal(flow.complete, true);
  assert.ok(flow.backlog.open > 0);
  const { healthOf } = await import('../src/health.js');
  const health = healthOf(report, flow.backlog);
  assert.equal(health.signals.length, 5);
  assert.ok(health.score < 75, `Harbour should not look healthy: ${health.score}`);

  const gaps = await call(handler, 'knowledgeGaps', { topics: report.groups.slice(0, 8).map((g) => ({ key: g.id, title: g.theme })) });
  assert.ok(gaps.results.some((r) => r.articles.length) && gaps.results.some((r) => !r.articles.length));

  // Internal tab: the Client Support project settings, team performance and escalation.
  const internal = { scope: 'internal', projects: ['SUP'], clients: [], ...period };
  const intReport = await call(handler, 'analyze', internal);
  assert.equal(intReport.settingsUsed.profile.name, 'Client Support');
  const team = await call(handler, 'agentPerformance', internal);
  assert.ok(team.agents.length >= 6, `agents ${team.agents?.length}`);
  assert.ok(team.team.resolved > 100);
  const escalation = await call(handler, 'escalation', internal);
  assert.ok(escalation.byLevel.find((l) => l.level === 2).tickets > 0);
  const projects = await call(handler, 'getProjects');
  assert.deepEqual(projects.projects.map((p) => p.key), ['SUP', 'INT']);
  assert.ok((await call(handler, 'suggestClients', { text: 'north' })).includes('Northgate Retail'));

  // Creating a problem is refused with sample data.
  await assert.rejects(call(handler, 'createProblem', { projectKey: 'SUP', issueTypeName: 'Problem', summary: 'Outlook', keys: [] }), /sample data/i);

  // Background jobs: health scores, spike alerts and the live surge at Northgate.
  const { checkHealth } = await import('../src/healthJobs.js');
  for (const o of SAMPLE_ORGS) await checkHealth(o.id);
  const board = await call(handler, 'getHealthBoard');
  assert.equal(board.rows.length, 7);
  assert.ok(board.rows.every((r) => r.history.length === 30 && r.change !== null), 'sample scores start with a month of history');
  assert.ok(board.rows.every((r) => r.score !== null), JSON.stringify(board.rows.map((r) => [r.organization.name, r.score, r.lastError])));
  if (process.env.SHOW_HEALTH) for (const r of board.rows) console.log(r.organization.name, r.score, r.signals.map((s) => `${s.key} ${s.score} (${s.detail})`).join(' | '));
  const ranked = [...board.rows].sort((a, b) => a.score - b.score);
  assert.equal(ranked[0].organization.name, 'Harbour & Finch Solicitors');

  const surgeJobs = await import('../src/surgeJobs.js');
  await surgeJobs.scheduler();
  const alerts = await call(handler, 'getAlerts');
  assert.ok(alerts.alerts.some((a) => a.kind === 'surge' && a.organization.name === 'Northgate Retail'), JSON.stringify(alerts.alerts.map((a) => [a.kind, a.organization.name, a.theme])));

  // Emails are never sent with sample data.
  await assert.rejects(call(handler, 'sendScheduleNow', { id: 'x' }), /paused|wasn’t found/);

  // Off again: the sample records go, and the real organisations come back.
  await call(handler, 'setSampleData', { enabled: false });
  assert.equal([...store.keys()].filter((k) => /^(health|alert|surge-state):/.test(k)).length, 0);
  assert.equal(store.has('app-settings-sample'), false);
  assert.equal((await call(handler, 'getOrganizations')).sample, false);
  assert.ok(!toJira.some((p) => /search|changelog/.test(p)), 'no ticket reads went to Jira while sample data was on');
});
