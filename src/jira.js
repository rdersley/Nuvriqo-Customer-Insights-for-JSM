// Jira access for the agent page, settings and background jobs: @forge/api's
// asUser/asApp, except that while sample data is on (settings → General) the
// data calls are answered from src/sample.js instead. The portal resolver
// (portal.js) uses @forge/api directly and never sees sample data.
import { asApp as realAsApp, asUser as realAsUser } from '@forge/api';

export { route } from '@forge/api';

const SAMPLE_KEY = 'sample-data';
const CACHE_MS = 15000;
let cached = { at: 0, enabled: false };

/** Whether sample data is on (cached briefly per function instance). */
export async function sampleEnabled() {
  if (Date.now() - cached.at < CACHE_MS) return cached.enabled;
  let enabled = false;
  try {
    const { kvs } = await import('@forge/kvs');
    enabled = (await kvs.get(SAMPLE_KEY))?.enabled === true;
  } catch { /* storage unavailable (tests): off */ }
  cached = { at: Date.now(), enabled };
  return enabled;
}

/** Sample data state: { enabled, since }. */
export async function loadSampleState() {
  const { kvs } = await import('@forge/kvs');
  return (await kvs.get(SAMPLE_KEY)) || { enabled: false };
}

export async function saveSampleState(state) {
  const { kvs } = await import('@forge/kvs');
  await kvs.set(SAMPLE_KEY, state);
  cached = { at: Date.now(), enabled: state.enabled === true };
}

function wrap(real) {
  return () => ({
    async requestJira(path, init) {
      if (await sampleEnabled()) {
        const { fakeJira } = await import('./sample.js');
        const answer = await fakeJira(path, init);
        if (answer) return answer;
      }
      return real().requestJira(path, init);
    },
  });
}

export const asUser = wrap(realAsUser);
export const asApp = wrap(realAsApp);
