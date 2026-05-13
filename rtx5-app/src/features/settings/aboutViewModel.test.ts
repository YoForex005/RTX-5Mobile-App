import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABOUT_CAPABILITIES,
  ABOUT_FILTERS,
  RELEASE_GUARDRAILS,
  buildAboutMetrics,
  buildAboutSummary,
  filterAboutCapabilities,
  getAboutCapabilityCountByCategory,
} from './aboutViewModel';

test('about metrics include the supplied app version and release model labels', () => {
  const metrics = buildAboutMetrics('2.4.1');

  assert.deepEqual(metrics, [
    { label: 'Version', value: '2.4.1' },
    { label: 'Runtime', value: 'Gated' },
    { label: 'Updates', value: 'EAS' },
    { label: 'Scope', value: 'Frontend' },
  ]);
});

test('about capabilities use deterministic IDs and supported categories', () => {
  const ids = ABOUT_CAPABILITIES.map((capability) => capability.id);
  const supportedCategories = new Set(ABOUT_FILTERS.filter((filter) => filter !== 'All'));

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ABOUT_CAPABILITIES.every((capability) => supportedCategories.has(capability.category)), true);
});

test('about summary derives capability posture metrics', () => {
  const summary = buildAboutSummary(ABOUT_CAPABILITIES);

  assert.equal(summary.capabilityCount, 4);
  assert.equal(summary.guardedCount, 2);
  assert.equal(summary.localCount, 1);
  assert.equal(summary.releaseLabel, 'EAS');
});

test('about filter and search functions narrow platform capabilities', () => {
  const releaseCapabilities = filterAboutCapabilities(ABOUT_CAPABILITIES, 'Release', '');
  const localCapabilities = filterAboutCapabilities(ABOUT_CAPABILITIES, 'All', 'device-local');

  assert.deepEqual(releaseCapabilities.map((capability) => capability.id), ['ota-release']);
  assert.deepEqual(localCapabilities.map((capability) => capability.id), ['local-preferences']);
});

test('about capability counts derive from capability data', () => {
  assert.equal(getAboutCapabilityCountByCategory('Platform'), 1);
  assert.equal(getAboutCapabilityCountByCategory('Trading'), 1);
  assert.equal(getAboutCapabilityCountByCategory('Personalization'), 1);
  assert.equal(getAboutCapabilityCountByCategory('Release'), 1);
});

test('about guardrails preserve frontend-only and OTA safety constraints', () => {
  assert.match(RELEASE_GUARDRAILS[0].value, /do not add or replace server-side/i);
  assert.match(RELEASE_GUARDRAILS[2].value, /preview, staging, and production/i);
});
