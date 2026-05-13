import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAILBOX_PREVIEW_DATA,
  deriveMailboxStateFromMessages,
  filterMailboxMessages,
  getImportantAnnouncement,
  getSelectedMessage,
  selectMailboxCategories,
  selectPriorityFilters,
} from './mailboxViewModel';

test('mailbox preview data exposes the requested dynamic screen objects', () => {
  assert.ok(MAILBOX_PREVIEW_DATA.mailboxState);
  assert.ok(MAILBOX_PREVIEW_DATA.importantAnnouncement);
  assert.ok(MAILBOX_PREVIEW_DATA.supportState);
  assert.equal(MAILBOX_PREVIEW_DATA.categories.length > 0, true);
  assert.equal(MAILBOX_PREVIEW_DATA.priorityFilters.length > 0, true);
  assert.equal(MAILBOX_PREVIEW_DATA.messages.length > 0, true);
});

test('mailbox state derives unread, high priority, support, and action counts from messages', () => {
  const state = deriveMailboxStateFromMessages(MAILBOX_PREVIEW_DATA.mailboxState, MAILBOX_PREVIEW_DATA.messages);

  assert.equal(state.total_messages, MAILBOX_PREVIEW_DATA.messages.length);
  assert.equal(state.unread_messages, 2);
  assert.equal(state.high_priority_messages, 3);
  assert.equal(state.support_replies, 1);
  assert.equal(state.pending_action_messages, 2);
});

test('mailbox category and priority selection are data driven', () => {
  const categories = selectMailboxCategories(MAILBOX_PREVIEW_DATA.categories, 'payments');
  const filters = selectPriorityFilters(MAILBOX_PREVIEW_DATA.priorityFilters, 'attachments');

  assert.equal(categories.find((category) => category.category_id === 'payments')?.is_selected, true);
  assert.equal(categories.filter((category) => category.is_selected).length, 1);
  assert.equal(filters.find((filter) => filter.filter_id === 'attachments')?.is_selected, true);
  assert.equal(filters.filter((filter) => filter.is_selected).length, 1);
});

test('mailbox messages filter by category, priority, attachment state, and query', () => {
  const supportMessages = filterMailboxMessages(MAILBOX_PREVIEW_DATA.messages, 'support', 'last-7-days', '');
  const criticalMessages = filterMailboxMessages(MAILBOX_PREVIEW_DATA.messages, 'all', 'critical', '');
  const attachmentMessages = filterMailboxMessages(MAILBOX_PREVIEW_DATA.messages, 'all', 'attachments', '');
  const propFirmMessages = filterMailboxMessages(MAILBOX_PREVIEW_DATA.messages, 'prop-firm', 'last-7-days', '');
  const searchedMessages = filterMailboxMessages(MAILBOX_PREVIEW_DATA.messages, 'all', 'last-7-days', 'withdrawal');

  assert.equal(supportMessages.every((message) => message.category === 'Support'), true);
  assert.equal(criticalMessages.every((message) => message.priority === 'Critical'), true);
  assert.equal(attachmentMessages.every((message) => message.attachments.length > 0), true);
  assert.equal(propFirmMessages.every((message) => message.category === 'Prop Firm'), true);
  assert.deepEqual(searchedMessages.map((message) => message.message_id), ['msg-payment-withdrawal']);
});

test('mailbox helpers return important announcement and selected message safely', () => {
  const announcement = getImportantAnnouncement(null, MAILBOX_PREVIEW_DATA.messages);
  const selectedMessage = getSelectedMessage(MAILBOX_PREVIEW_DATA.messages, 'msg-support-ticket');

  assert.equal(announcement?.priority, 'Critical');
  assert.equal(selectedMessage?.sender_type, 'Support');
  assert.equal(getSelectedMessage(MAILBOX_PREVIEW_DATA.messages, undefined), null);
});
