export interface NavItem {
  title: string;
  href: string;
  items?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const docsNavigation: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Overview', href: '/docs' },
      { title: 'Architecture', href: '/docs#architecture' },
      { title: 'Quick Start', href: '/docs#quick-start' }
    ]
  },
  {
    title: 'Core Features',
    items: [
      { title: 'Gmail Integration', href: '/docs/features/gmail-integration' },
      { title: 'LLM Classification', href: '/docs/features/llm-classification' },
      { title: 'Knowledge Base', href: '/docs/features/knowledge-base' },
      { title: 'Draft Generation', href: '/docs/features/draft-generation' },
      { title: 'Thread State Machine', href: '/docs/features/thread-state-machine' },
      { title: 'Vehicle Detection', href: '/docs/features/vehicle-detection' }
    ]
  },
  {
    title: 'Automation',
    items: [
      { title: 'Auto-Send', href: '/docs/features/auto-send' },
      { title: 'Order Management', href: '/docs/features/order-management' },
      { title: 'Vendor Coordination', href: '/docs/features/vendor-coordination' }
    ]
  },
  {
    title: 'Collaboration',
    items: [
      { title: 'Human Collaboration', href: '/docs/features/human-collaboration' },
      { title: 'Dynamic Instructions', href: '/docs/features/dynamic-instructions' }
    ]
  },
  {
    title: 'Safety & Compliance',
    items: [
      { title: 'Policy Gate', href: '/docs/features/policy-gate' },
      { title: 'Promise Tracking', href: '/docs/features/promise-tracking' }
    ]
  },
  {
    title: 'Integrations',
    items: [
      { title: 'Overview', href: '/docs/integrations' },
      { title: 'Shopify', href: '/docs/integrations/shopify' },
      { title: 'HubSpot', href: '/docs/integrations/hubspot' },
      { title: 'YouTube', href: '/docs/integrations/youtube' }
    ]
  },
  {
    title: 'Support',
    items: [
      { title: 'Troubleshooting', href: '/docs/troubleshooting' }
    ]
  }
];

export const headerNavigation: NavItem[] = [
  { title: 'Features', href: '/docs/features' },
  { title: 'Integrations', href: '/docs/integrations' },
  { title: 'Documentation', href: '/docs' }
];
