import test from 'node:test';
import assert from 'node:assert/strict';
import { isProductionContext, licenseAllows } from '../src/license.js';

const prod = (license) => ({ environmentType: 'PRODUCTION', license });
const dev = (license) => ({ environmentType: 'DEVELOPMENT', license });

test('production fails closed without an active licence', () => {
  assert.equal(licenseAllows(prod({ active: true }), {}), true);
  assert.equal(licenseAllows(prod({ active: false }), {}), false);
  assert.equal(licenseAllows(prod(undefined), {}), false);
});

test('an unknown environment is treated as production', () => {
  assert.equal(isProductionContext({}), true);
  assert.equal(licenseAllows({}, {}), false);
  assert.equal(licenseAllows({ environment: { type: 'staging' } }, {}), true);
});

test('production ignores LICENSE_OVERRIDE', () => {
  assert.equal(licenseAllows(prod(undefined), { LICENSE_OVERRIDE: 'active' }), false);
});

test('non-production allows a missing licence but honours simulated ones', () => {
  assert.equal(licenseAllows(dev(undefined), {}), true);
  assert.equal(licenseAllows(dev({ active: false }), {}), false);
  assert.equal(licenseAllows(dev(undefined), { LICENSE_OVERRIDE: 'inactive' }), false);
  assert.equal(licenseAllows(dev({ active: false }), { LICENSE_OVERRIDE: 'active' }), true);
});
