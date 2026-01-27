export interface Metric {
  id: string;
  label: string;
  value: string | number;
  suffix?: string;
  prefix?: string;
  change?: {
    value: number;
    period: string;
    positive: boolean;
  };
}

// Placeholder metrics - these would be populated from actual data
export const heroMetrics: Metric[] = [
  {
    id: 'response-time',
    label: 'Avg Response Time',
    value: '< 2',
    suffix: 'min',
    change: {
      value: 85,
      period: 'faster than manual',
      positive: true
    }
  },
  {
    id: 'auto-resolution',
    label: 'Auto-Resolved',
    value: 68,
    suffix: '%',
    change: {
      value: 12,
      period: 'vs last month',
      positive: true
    }
  },
  {
    id: 'customer-satisfaction',
    label: 'Customer Satisfaction',
    value: 4.8,
    suffix: '/5',
    change: {
      value: 0.3,
      period: 'vs last quarter',
      positive: true
    }
  },
  {
    id: 'tickets-handled',
    label: 'Tickets/Day',
    value: 150,
    suffix: '+',
    change: {
      value: 24,
      period: 'vs last month',
      positive: true
    }
  }
];

export const detailedMetrics: Metric[] = [
  {
    id: 'total-threads',
    label: 'Total Threads Processed',
    value: 15000,
    suffix: '+'
  },
  {
    id: 'kb-articles',
    label: 'Knowledge Base Articles',
    value: 850,
    suffix: ''
  },
  {
    id: 'intents-classified',
    label: 'Intent Accuracy',
    value: 94,
    suffix: '%'
  },
  {
    id: 'orders-processed',
    label: 'Orders Auto-Routed',
    value: 2500,
    suffix: '+'
  },
  {
    id: 'vendors-integrated',
    label: 'Active Vendors',
    value: 12,
    suffix: ''
  },
  {
    id: 'escalation-rate',
    label: 'Escalation Rate',
    value: 8,
    suffix: '%'
  }
];

export const featureHighlights = [
  {
    title: 'Real-Time Processing',
    description: 'Gmail push notifications enable instant email processing with < 2 minute response times.',
    metric: '< 2 min'
  },
  {
    title: 'Intelligent Classification',
    description: '17 intent categories with LLM-powered classification achieving 94% accuracy.',
    metric: '94%'
  },
  {
    title: 'Automated Vendor Routing',
    description: 'Orders automatically matched and forwarded to the right vendors.',
    metric: '100%'
  },
  {
    title: 'Continuous Learning',
    description: 'Learns from human-handled tickets to improve KB and responses.',
    metric: 'Always'
  }
];
