import type { Ionicons } from '@expo/vector-icons';

export type GuideFilter = 'All' | 'Protected' | 'Trading' | 'Charting' | 'Account' | 'Safety';
export type GuideWorkflowCategory = Exclude<GuideFilter, 'All' | 'Protected'>;
export type GuideWorkflowStatus = 'Ready' | 'Protected' | 'Review';
export type GuideWorkflowPriority = 'Core' | 'Safety' | 'Reference';

export type GuideWorkflow = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: GuideWorkflowCategory;
  status: GuideWorkflowStatus;
  priority: GuideWorkflowPriority;
  audience: string;
  duration: string;
  icon: keyof typeof Ionicons.glyphMap;
  steps: string[];
};

export type GuideSummary = {
  workflowCount: number;
  protectedCount: number;
  stepCount: number;
  localStateLabel: string;
};

export type GuideChecklistItem = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const GUIDE_FILTERS: GuideFilter[] = ['All', 'Protected', 'Trading', 'Charting', 'Account', 'Safety'];

export const GUIDE_WORKFLOWS: GuideWorkflow[] = [
  {
    id: 'quotes-watchlist',
    title: 'Build a focused watchlist',
    summary: 'Create a focused symbol surface for bid/ask scanning and fast chart handoff.',
    body: 'Use Quotes as the starting point for symbol selection, bid/ask scanning, and quick chart access.',
    category: 'Trading',
    status: 'Ready',
    priority: 'Core',
    audience: 'Active traders',
    duration: '2 min',
    icon: 'list-outline',
    steps: ['Open Quotes', 'Search or add symbols', 'Long-press for chart, details, or statistics'],
  },
  {
    id: 'chart-analysis',
    title: 'Analyze a chart setup',
    summary: 'Keep symbol, timeframe, drawings, and visibility preferences aligned on this device.',
    body: 'Keep symbol, timeframe, drawings, and visibility preferences aligned with your device-local chart state.',
    category: 'Charting',
    status: 'Ready',
    priority: 'Core',
    audience: 'Technical analysts',
    duration: '4 min',
    icon: 'analytics-outline',
    steps: ['Choose symbol and timeframe', 'Use drawing tools for levels', 'Review live price and order context'],
  },
  {
    id: 'order-management',
    title: 'Manage open positions',
    summary: 'Review active exposure, modify risk, and keep one-click actions behind local acceptance.',
    body: 'Review active positions, modify risk, and use one-click trading only after accepting the local terms gate.',
    category: 'Trading',
    status: 'Protected',
    priority: 'Safety',
    audience: 'Live account users',
    duration: '3 min',
    icon: 'flash-outline',
    steps: ['Open Trade', 'Inspect position rows', 'Use context actions for modify or close flows'],
  },
  {
    id: 'account-setup',
    title: 'Connect account details',
    summary: 'Review account, broker, and demo surfaces while preserving frontend-only boundaries.',
    body: 'Account, broker, and demo registration surfaces stay frontend-only while consuming typed API contracts.',
    category: 'Account',
    status: 'Review',
    priority: 'Reference',
    audience: 'Account operators',
    duration: '5 min',
    icon: 'person-circle-outline',
    steps: ['Open Settings', 'Review account card', 'Use account or broker entry points as needed'],
  },
  {
    id: 'release-safety',
    title: 'Understand release safety',
    summary: 'Track preview, staging, and production updates through runtime compatibility gates.',
    body: 'Preview, staging, and production update channels are gated by runtime compatibility checks.',
    category: 'Safety',
    status: 'Protected',
    priority: 'Safety',
    audience: 'All users',
    duration: '2 min',
    icon: 'shield-checkmark-outline',
    steps: ['Confirm app channel', 'Keep runtime compatible', 'Avoid bypassing security gates'],
  },
];

export const GUIDE_CHECKLIST: GuideChecklistItem[] = [
  {
    label: 'Use live account context',
    value: 'Confirm the active account before placing or modifying trades.',
    icon: 'person-outline',
  },
  {
    label: 'Review event risk',
    value: 'Check News and Economic Calendar before trading volatile sessions.',
    icon: 'calendar-outline',
  },
  {
    label: 'Preserve personalization',
    value: 'Theme, watchlist, chart, and history filters remain stored on this device.',
    icon: 'save-outline',
  },
];

export function buildGuideSummary(workflows: GuideWorkflow[] = GUIDE_WORKFLOWS): GuideSummary {
  return {
    workflowCount: workflows.length,
    protectedCount: workflows.filter((workflow) => workflow.status === 'Protected').length,
    stepCount: workflows.reduce((total, workflow) => total + workflow.steps.length, 0),
    localStateLabel: 'Device',
  };
}

export function filterGuideWorkflows(
  workflows: GuideWorkflow[],
  filter: GuideFilter,
  query: string,
): GuideWorkflow[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filteredWorkflows = workflows.filter((workflow) => {
    if (filter === 'All') return true;
    if (filter === 'Protected') return workflow.status === 'Protected';
    return workflow.category === filter;
  });

  if (!normalizedQuery) return filteredWorkflows;

  return filteredWorkflows.filter((workflow) => {
    const searchableText = [
      workflow.title,
      workflow.summary,
      workflow.body,
      workflow.category,
      workflow.status,
      workflow.priority,
      workflow.audience,
      workflow.duration,
      ...workflow.steps,
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

export function getGuideWorkflowCountByCategory(category: GuideWorkflowCategory): number {
  return GUIDE_WORKFLOWS.filter((workflow) => workflow.category === category).length;
}
