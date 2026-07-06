export type MailboxLoadingStatus = 'idle' | 'loading' | 'error';
export type MessageReadStatus = 'Unread' | 'Read';
export type MessageStatus = 'Open' | 'Pending' | 'Resolved' | 'Archived';
export type MessagePriority = 'Critical' | 'Important' | 'Success' | 'Info' | 'Promotion';
export type MessageCategory =
  | 'Broker'
  | 'Trading'
  | 'Account'
  | 'Payments'
  | 'Prop Firm'
  | 'Support'
  | 'Promotions'
  | 'KYC'
  | 'Security'
  | 'System'
  | 'Risk';
export type SenderType =
  | 'Admin'
  | 'Support'
  | 'System'
  | 'Risk'
  | 'Payments'
  | 'KYC'
  | 'Broker'
  | 'Compliance'
  | 'Security'
  | 'Promotions';
export type ActiveBottomSheet = 'messageDetail' | 'filters' | 'messageActions' | null;
export type ActiveModal = 'deleteMessage' | 'archiveAll' | 'markAllRead' | null;
export type ActionStatus = 'idle' | 'updating' | 'error';
export type PaginationStatus = 'idle' | 'loading' | 'end' | 'error';

export type UserMailboxState = {
  user_id: string;
  user_avatar?: string;
  user_status: 'online' | 'offline' | 'syncing';
  notification_count: number;
  total_messages: number;
  unread_messages: number;
  high_priority_messages: number;
  support_replies: number;
  pending_action_messages: number;
  selected_category: string;
  selected_priority_filter: string;
  search_query: string;
  loading_status: MailboxLoadingStatus;
  offline_status: boolean;
};

export type MessageCategoryItem = {
  category_id: string;
  category_name: string;
  unread_count: number;
  total_count: number;
  is_selected: boolean;
};

export type PriorityFilterItem = {
  filter_id: string;
  filter_name: string;
  count: number;
  is_selected: boolean;
};

export type ImportantAnnouncement = {
  announcement_id: string;
  title: string;
  summary: string;
  sender: string;
  sender_type: SenderType;
  category: MessageCategory;
  priority: MessagePriority;
  published_at: string;
  action_required: boolean;
  action_label?: string;
  read_status: MessageReadStatus;
  dismissible: boolean;
};

export type MessageAttachment = {
  attachment_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  download_url: string;
};

export type MailboxMessage = {
  message_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: SenderType;
  title: string;
  preview: string;
  full_body: string;
  category: MessageCategory;
  priority: MessagePriority;
  status: MessageStatus;
  read_status: MessageReadStatus;
  starred_status: boolean;
  pinned_status: boolean;
  archived_status: boolean;
  action_required: boolean;
  action_label?: string;
  created_at: string;
  updated_at: string;
  attachments: MessageAttachment[];
  related_account_id?: string;
  related_ticket_id?: string;
  related_order_id?: string;
  related_challenge_id?: string;
  related_symbol?: string;
  deeplink_url?: string;
};

export type SupportState = {
  open_ticket_count: number;
  latest_support_reply_time: string | null;
  support_status: 'Available' | 'Delayed' | 'Offline';
  contact_support_enabled: boolean;
};

export type UiActionState = {
  selected_message_id?: string;
  active_bottom_sheet: ActiveBottomSheet;
  active_modal: ActiveModal;
  swipe_action_status: ActionStatus;
  pagination_status: PaginationStatus;
  refreshing_status: boolean;
};

export type MailboxScreenData = {
  mailboxState: UserMailboxState;
  categories: MessageCategoryItem[];
  priorityFilters: PriorityFilterItem[];
  importantAnnouncement: ImportantAnnouncement | null;
  messages: MailboxMessage[];
  supportState: SupportState;
  uiActionState: UiActionState;
};

const MAILBOX_PREVIEW_NOW = Date.now();
const getMailboxPreviewTimestamp = (minutesAgo: number) =>
  new Date(MAILBOX_PREVIEW_NOW - minutesAgo * 60 * 1000).toISOString();

const MAILBOX_PREVIEW_MESSAGES: MailboxMessage[] = [
  {
    message_id: 'msg-risk-daily-loss',
    sender_id: 'risk-team',
    sender_name: 'Risk Team',
    sender_type: 'Risk',
    title: 'Daily Loss Warning',
    preview: 'Your account is close to the daily loss limit. Review your risk dashboard.',
    full_body:
      'Your account is currently close to the daily loss limit. Please review open positions and manage risk carefully before placing additional trades.',
    category: 'Prop Firm',
    priority: 'Critical',
    status: 'Open',
    read_status: 'Unread',
    starred_status: true,
    pinned_status: true,
    archived_status: false,
    action_required: true,
    action_label: 'View Risk Dashboard',
    created_at: getMailboxPreviewTimestamp(10),
    updated_at: getMailboxPreviewTimestamp(10),
    attachments: [],
    related_account_id: '**** 4891',
    related_challenge_id: 'Core Challenge',
    deeplink_url: '/risk',
  },
  {
    message_id: 'msg-payment-withdrawal',
    sender_id: 'payments',
    sender_name: 'Payments',
    sender_type: 'Payments',
    title: 'Invoice Generated',
    preview: 'Your withdrawal payment invoice is ready for review in the secure billing area.',
    full_body:
      'Your payment invoice for the challenge purchase is ready. Review billing details inside the secure payment workflow before continuing.',
    category: 'Payments',
    priority: 'Important',
    status: 'Pending',
    read_status: 'Unread',
    starred_status: false,
    pinned_status: false,
    archived_status: false,
    action_required: false,
    action_label: 'View Invoice',
    created_at: getMailboxPreviewTimestamp(26),
    updated_at: getMailboxPreviewTimestamp(26),
    attachments: [],
    deeplink_url: '/payouts',
  },
  {
    message_id: 'msg-support-ticket',
    sender_id: 'support-team',
    sender_name: 'Support',
    sender_type: 'Support',
    title: 'New Reply on Ticket #YP-2048',
    preview: 'Our support team has responded to your account verification query.',
    full_body:
      'Support has replied to your account verification query. Review the secure ticket thread and respond if more information is requested.',
    category: 'Support',
    priority: 'Info',
    status: 'Pending',
    read_status: 'Read',
    starred_status: false,
    pinned_status: false,
    archived_status: false,
    action_required: false,
    action_label: 'View Ticket',
    created_at: getMailboxPreviewTimestamp(360),
    updated_at: getMailboxPreviewTimestamp(357),
    attachments: [
      {
        attachment_id: 'att-support-summary',
        file_name: 'ticket-summary.pdf',
        file_type: 'PDF',
        file_size: '84 KB',
        download_url: '/support/attachments/ticket-summary',
      },
    ],
    related_ticket_id: 'YP-2048',
    deeplink_url: '/support/tickets/YP-2048',
  },
  {
    message_id: 'msg-challenge-passed',
    sender_id: 'platform',
    sender_name: 'YoPips',
    sender_type: 'Broker',
    title: 'Phase 1 Challenge Passed',
    preview: 'Congratulations. You have successfully completed the first phase.',
    full_body:
      'Your challenge status has moved to the completed phase. Open challenge details for next steps and account rules before continuing.',
    category: 'Prop Firm',
    priority: 'Success',
    status: 'Resolved',
    read_status: 'Read',
    starred_status: true,
    pinned_status: false,
    archived_status: false,
    action_required: false,
    created_at: getMailboxPreviewTimestamp(1500),
    updated_at: getMailboxPreviewTimestamp(1500),
    attachments: [],
    related_challenge_id: 'Core Challenge',
    deeplink_url: '/challenges',
  },
  {
    message_id: 'msg-security-login',
    sender_id: 'security',
    sender_name: 'Security',
    sender_type: 'Security',
    title: 'New Login Detected',
    preview: 'A new login was detected from a recognized device and browser.',
    full_body:
      'A new login was detected for your account. If this was not you, review account security and contact support immediately.',
    category: 'Security',
    priority: 'Important',
    status: 'Open',
    read_status: 'Read',
    starred_status: false,
    pinned_status: false,
    archived_status: false,
    action_required: false,
    created_at: getMailboxPreviewTimestamp(3000),
    updated_at: getMailboxPreviewTimestamp(3000),
    attachments: [],
    related_account_id: '**** 4891',
    deeplink_url: '/security',
  },
  {
    message_id: 'msg-kyc-document-review',
    sender_id: 'kyc-team',
    sender_name: 'KYC Team',
    sender_type: 'KYC',
    title: 'Document Review Required',
    preview: 'Please upload a clearer identity document to continue verification.',
    full_body:
      'The identity document on file is not clear enough for verification. Upload a sharper image from the secure KYC area to continue account review.',
    category: 'KYC',
    priority: 'Info',
    status: 'Open',
    read_status: 'Read',
    starred_status: false,
    pinned_status: false,
    archived_status: false,
    action_required: true,
    action_label: 'Upload Document',
    created_at: getMailboxPreviewTimestamp(4500),
    updated_at: getMailboxPreviewTimestamp(4500),
    attachments: [],
    deeplink_url: '/kyc',
  },
];

export const MAILBOX_PREVIEW_DATA: MailboxScreenData = {
  mailboxState: {
    user_id: 'preview-user',
    user_avatar: 'YP',
    user_status: 'online',
    notification_count: 2,
    total_messages: MAILBOX_PREVIEW_MESSAGES.length,
    unread_messages: 2,
    high_priority_messages: 3,
    support_replies: 1,
    pending_action_messages: 2,
    selected_category: 'all',
    selected_priority_filter: 'last-7-days',
    search_query: '',
    loading_status: 'idle',
    offline_status: false,
  },
  categories: [
    { category_id: 'all', category_name: 'All', unread_count: 2, total_count: 6, is_selected: true },
    { category_id: 'alerts', category_name: 'Alerts', unread_count: 1, total_count: 3, is_selected: false },
    { category_id: 'tickets', category_name: 'Tickets', unread_count: 0, total_count: 1, is_selected: false },
    { category_id: 'payments', category_name: 'Payments', unread_count: 1, total_count: 1, is_selected: false },
    { category_id: 'kyc', category_name: 'KYC', unread_count: 0, total_count: 1, is_selected: false },
    { category_id: 'trading', category_name: 'Trading', unread_count: 0, total_count: 0, is_selected: false },
    { category_id: 'promotions', category_name: 'Promotions', unread_count: 0, total_count: 0, is_selected: false },
  ],
  priorityFilters: [
    { filter_id: 'unread', filter_name: 'Unread', count: 2, is_selected: false },
    { filter_id: 'critical', filter_name: 'Critical', count: 1, is_selected: false },
    { filter_id: 'action-needed', filter_name: 'Action Required', count: 2, is_selected: false },
    { filter_id: 'attachments', filter_name: 'Attachments', count: 1, is_selected: false },
    { filter_id: 'last-7-days', filter_name: 'Last 7 Days', count: 6, is_selected: true },
  ],
  importantAnnouncement: {
    announcement_id: 'ann-risk-daily-loss',
    title: 'Daily Loss Warning',
    summary: 'Your account is close to the daily loss limit. Review your risk dashboard.',
    sender: 'Risk Team',
    sender_type: 'Risk',
    category: 'Prop Firm',
    priority: 'Critical',
    published_at: getMailboxPreviewTimestamp(10),
    action_required: true,
    action_label: 'View Risk Dashboard',
    read_status: 'Unread',
    dismissible: true,
  },
  messages: MAILBOX_PREVIEW_MESSAGES,
  supportState: {
    open_ticket_count: 1,
    latest_support_reply_time: getMailboxPreviewTimestamp(357),
    support_status: 'Available',
    contact_support_enabled: true,
  },
  uiActionState: {
    selected_message_id: undefined,
    active_bottom_sheet: null,
    active_modal: null,
    swipe_action_status: 'idle',
    pagination_status: 'idle',
    refreshing_status: false,
  },
};

export function selectMailboxCategories(
  categories: MessageCategoryItem[],
  selectedCategoryId: string,
): MessageCategoryItem[] {
  return categories.map((category) => ({
    ...category,
    is_selected: category.category_id === selectedCategoryId,
  }));
}

export function selectPriorityFilters(
  filters: PriorityFilterItem[],
  selectedFilterId: string,
): PriorityFilterItem[] {
  return filters.map((filter) => ({
    ...filter,
    is_selected: filter.filter_id === selectedFilterId,
  }));
}

export function filterMailboxMessages(
  messages: readonly MailboxMessage[],
  selectedCategoryId: string,
  selectedPriorityFilterId: string,
  query: string,
): MailboxMessage[] {
  const normalizedQuery = query.trim().toLowerCase();

  const filteredMessages = messages.filter((message) => {
    const categoryMatch = matchesCategoryFilter(message, selectedCategoryId);
    const priorityMatch = matchesPriorityFilter(message, selectedPriorityFilterId);

    return categoryMatch && priorityMatch;
  });

  if (!normalizedQuery) return filteredMessages;

  return filteredMessages.filter((message) => {
    const searchableText = [
      message.sender_name,
      message.sender_type,
      message.title,
      message.preview,
      message.category,
      message.priority,
      message.status,
      message.read_status,
      message.related_account_id ?? '',
      message.related_ticket_id ?? '',
      message.related_order_id ?? '',
      message.related_challenge_id ?? '',
      message.related_symbol ?? '',
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getImportantAnnouncement(
  announcement: ImportantAnnouncement | null,
  messages: readonly MailboxMessage[],
): ImportantAnnouncement | null {
  if (announcement) return announcement;

  const importantMessage = [...messages].sort((left, right) => getPriorityRank(right.priority) - getPriorityRank(left.priority))[0];
  if (!importantMessage) return null;

  return {
    announcement_id: importantMessage.message_id,
    title: importantMessage.title,
    summary: importantMessage.preview,
    sender: importantMessage.sender_name,
    sender_type: importantMessage.sender_type,
    category: importantMessage.category,
    priority: importantMessage.priority,
    published_at: importantMessage.created_at,
    action_required: importantMessage.action_required,
    action_label: importantMessage.action_label,
    read_status: importantMessage.read_status,
    dismissible: false,
  };
}

export function getSelectedMessage(
  messages: readonly MailboxMessage[],
  selectedMessageId?: string,
): MailboxMessage | null {
  if (!selectedMessageId) return null;
  return messages.find((message) => message.message_id === selectedMessageId) ?? null;
}

export function deriveMailboxStateFromMessages(
  baseState: UserMailboxState,
  messages: readonly MailboxMessage[],
): UserMailboxState {
  return {
    ...baseState,
    total_messages: messages.length,
    unread_messages: messages.filter((message) => message.read_status === 'Unread').length,
    high_priority_messages: messages.filter((message) => message.priority === 'Critical' || message.priority === 'Important').length,
    support_replies: messages.filter((message) => message.category === 'Support').length,
    pending_action_messages: messages.filter((message) => message.action_required).length,
  };
}

function matchesCategoryFilter(message: MailboxMessage, selectedCategoryId: string): boolean {
  switch (selectedCategoryId) {
    case 'all':
      return true;
    case 'broker':
      return message.category === 'Broker' || message.sender_type === 'Broker';
    case 'prop-firm':
      return message.category === 'Prop Firm';
    case 'alerts':
      return ['Risk', 'Security', 'Account', 'Prop Firm'].includes(message.category) || ['Risk', 'Security', 'Compliance'].includes(message.sender_type);
    case 'tickets':
      return message.category === 'Support' || Boolean(message.related_ticket_id);
    case 'security':
      return message.category === 'Security' || message.sender_type === 'Security';
    default:
      return normalizeFilterValue(message.category) === selectedCategoryId;
  }
}

function matchesPriorityFilter(message: MailboxMessage, selectedPriorityFilterId: string): boolean {
  switch (selectedPriorityFilterId) {
    case 'unread':
      return message.read_status === 'Unread';
    case 'critical':
      return message.priority === 'Critical';
    case 'attachments':
      return message.attachments.length > 0;
    case 'last-7-days':
      return isWithinLastSevenDays(message.created_at);
    case 'action-needed':
      return message.action_required;
    default:
      return true;
  }
}

function normalizeFilterValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '-');
}

function isWithinLastSevenDays(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - date.getTime() <= sevenDaysInMs;
}

function getPriorityRank(priority: MessagePriority): number {
  switch (priority) {
    case 'Critical':
      return 5;
    case 'Important':
      return 4;
    case 'Success':
      return 3;
    case 'Info':
      return 2;
    case 'Promotion':
    default:
      return 1;
  }
}
