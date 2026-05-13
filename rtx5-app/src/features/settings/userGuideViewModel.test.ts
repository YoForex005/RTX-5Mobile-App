import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GUIDE_CHECKLIST,
  GUIDE_FILTERS,
  GUIDE_WORKFLOWS,
  buildGuideSummary,
  filterGuideWorkflows,
  getGuideWorkflowCountByCategory,
} from './userGuideViewModel';

test('user guide filters expose the core workflow library sections', () => {
  assert.deepEqual(GUIDE_FILTERS, ['All', 'Protected', 'Trading', 'Charting', 'Account', 'Safety']);
});

test('user guide workflows have deterministic IDs, categories, and steps', () => {
  const ids = GUIDE_WORKFLOWS.map((workflow) => workflow.id);
  const supportedCategories = new Set(GUIDE_FILTERS.filter((filter) => filter !== 'All' && filter !== 'Protected'));

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(GUIDE_WORKFLOWS.every((workflow) => supportedCategories.has(workflow.category)), true);
  assert.equal(GUIDE_WORKFLOWS.every((workflow) => workflow.steps.length >= 3), true);
});

test('user guide summary derives workflow and safety metrics', () => {
  const summary = buildGuideSummary(GUIDE_WORKFLOWS);

  assert.equal(summary.workflowCount, 5);
  assert.equal(summary.protectedCount, 2);
  assert.equal(summary.stepCount, 15);
  assert.equal(summary.localStateLabel, 'Device');
});

test('user guide filter and search functions narrow workflows', () => {
  const protectedWorkflows = filterGuideWorkflows(GUIDE_WORKFLOWS, 'Protected', '');
  const chartWorkflows = filterGuideWorkflows(GUIDE_WORKFLOWS, 'All', 'drawings');

  assert.equal(protectedWorkflows.every((workflow) => workflow.status === 'Protected'), true);
  assert.deepEqual(chartWorkflows.map((workflow) => workflow.id), ['chart-analysis']);
});

test('user guide category counts derive from workflow data', () => {
  assert.equal(getGuideWorkflowCountByCategory('Trading'), 2);
  assert.equal(getGuideWorkflowCountByCategory('Charting'), 1);
  assert.equal(getGuideWorkflowCountByCategory('Account'), 1);
  assert.equal(getGuideWorkflowCountByCategory('Safety'), 1);
});

test('user guide checklist reinforces account, event, and local preference safety', () => {
  assert.match(GUIDE_CHECKLIST[0].value, /active account/i);
  assert.match(GUIDE_CHECKLIST[1].value, /Economic Calendar/i);
  assert.match(GUIDE_CHECKLIST[2].value, /stored on this device/i);
});
