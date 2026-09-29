// Marketplace licence enforcement.
//
// Forge only supplies `context.license` to UI resolvers, and only for paid apps
// in the PRODUCTION environment. It is undefined in DEVELOPMENT/STAGING and for
// apps that are not (yet) listed on the Marketplace.
// See https://developer.atlassian.com/platform/marketplace/listing-forge-apps/
//
// Policy (same as Follow-Up Manager):
// - Production fails closed: a missing or inactive licence is unlicensed.
// - Non-production environments allow a missing licence so the app can be
//   tested. A simulated licence (`forge install --license inactive`) or the
//   LICENSE_OVERRIDE variable (`active` / `inactive`) is still honoured there.
// The app has no triggers, so the resolvers are the only thing to gate.

const PRODUCTION = 'PRODUCTION';

function environmentType(context) {
  const value = context?.environmentType ?? context?.environment?.type ?? null;
  return value ? String(value).toUpperCase() : null;
}

export function isProductionContext(context) {
  // An unknown environment is treated as production so enforcement fails closed.
  const type = environmentType(context);
  return type == null || type === PRODUCTION;
}

function licenseOverride(env) {
  const value = String(env?.LICENSE_OVERRIDE ?? '').trim().toLowerCase();
  if (value === 'active' || value === 'trial') return true;
  if (value === 'inactive') return false;
  return null;
}

export function licenseAllows(context, env = process.env) {
  const license = context?.license;
  if (isProductionContext(context)) return license?.active === true;

  const override = licenseOverride(env);
  if (override != null) return override;
  return license == null || license.active === true;
}

export const UNLICENSED_MESSAGE = 'Customer Insights needs an active Marketplace licence. Ask a Jira admin to check the app’s licence in Manage apps.';
