export interface Integration {
  slug: string;
  name: string;
  shortDescription: string;
  logo: string;
  category: 'ecommerce' | 'crm' | 'content';
  content: {
    overview: string;
    capabilities: string[];
    configuration: Array<{
      setting: string;
      description: string;
    }>;
    dataFlow?: Array<{
      direction: 'in' | 'out' | 'both';
      data: string;
      description: string;
    }>;
    keyFiles: Array<{
      file: string;
      purpose: string;
    }>;
  };
}

export const integrations: Integration[] = [
  {
    slug: 'shopify',
    name: 'Shopify',
    shortDescription: 'Sync customers, orders, and product catalog for verification and fulfillment.',
    logo: '/integrations/shopify.svg',
    category: 'ecommerce',
    content: {
      overview: 'The Shopify integration enables customer verification, order lookup, and product catalog synchronization. When customers contact support, Lina can verify their identity by checking their order history.',
      capabilities: [
        'Customer identity verification via order lookup',
        'Access to complete order history and details',
        'Product catalog sync with fitment data',
        'Real-time order notification webhooks',
        'Tracking number updates'
      ],
      configuration: [
        { setting: 'SHOPIFY_STORE_DOMAIN', description: 'Your Shopify store domain (e.g., store.myshopify.com)' },
        { setting: 'SHOPIFY_ACCESS_TOKEN', description: 'Private app access token with read_orders, read_customers scopes' }
      ],
      dataFlow: [
        {
          direction: 'in',
          data: 'Customer Data',
          description: 'Customer profiles synced for verification'
        },
        {
          direction: 'in',
          data: 'Order History',
          description: 'Orders with line items, shipping, tracking'
        },
        {
          direction: 'in',
          data: 'Product Catalog',
          description: 'Products with variants and fitment data'
        },
        {
          direction: 'in',
          data: 'Webhooks',
          description: 'Real-time order creation notifications'
        }
      ],
      keyFiles: [
        { file: 'src/lib/shopify/client.ts', purpose: 'Shopify API client' },
        { file: 'src/lib/verification/index.ts', purpose: 'Customer verification' },
        { file: 'src/app/api/webhooks/shopify/route.ts', purpose: 'Order webhooks' }
      ]
    }
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    shortDescription: 'Sync support tickets and customer data to your CRM for unified relationship management.',
    logo: '/integrations/hubspot.svg',
    category: 'crm',
    content: {
      overview: 'The HubSpot integration syncs support thread data to your CRM, creating contacts and tickets with custom properties for AI-powered metrics. This enables unified customer relationship management across sales and support.',
      capabilities: [
        'Automatic contact creation/update from threads',
        'Support ticket creation with thread summaries',
        'Timeline events for thread activity',
        'Custom properties for AI metrics (intent, confidence)',
        'Bi-directional contact sync'
      ],
      configuration: [
        { setting: 'HUBSPOT_ACCESS_TOKEN', description: 'HubSpot private app access token' },
        { setting: 'HUBSPOT_PORTAL_ID', description: 'Your HubSpot portal ID' }
      ],
      dataFlow: [
        {
          direction: 'out',
          data: 'Contacts',
          description: 'Customer profiles created from support threads'
        },
        {
          direction: 'out',
          data: 'Tickets',
          description: 'Support tickets with summaries and metadata'
        },
        {
          direction: 'out',
          data: 'Timeline Events',
          description: 'Thread activity and state changes'
        },
        {
          direction: 'both',
          data: 'Custom Properties',
          description: 'AI metrics like intent, confidence, response time'
        }
      ],
      keyFiles: [
        { file: 'src/lib/hubspot/client.ts', purpose: 'HubSpot API client' },
        { file: 'src/lib/hubspot/sync.ts', purpose: 'Data synchronization' },
        { file: 'src/app/api/admin/crm/route.ts', purpose: 'CRM sync endpoint' }
      ]
    }
  },
  {
    slug: 'youtube',
    name: 'YouTube',
    shortDescription: 'Extract Q&A pairs from video comments to enrich your knowledge base.',
    logo: '/integrations/youtube.svg',
    category: 'content',
    content: {
      overview: 'The YouTube integration extracts question-and-answer pairs from video comments to populate the knowledge base. This captures real customer questions and expert answers from product videos.',
      capabilities: [
        'Comment extraction via YouTube Data API',
        'Q&A pair identification and parsing',
        'Automatic KB article creation',
        'Embedding generation for search',
        'Duplicate detection'
      ],
      configuration: [
        { setting: 'YOUTUBE_API_KEY', description: 'YouTube Data API key' }
      ],
      dataFlow: [
        {
          direction: 'in',
          data: 'Comments',
          description: 'Video comments fetched via YouTube API'
        },
        {
          direction: 'in',
          data: 'Q&A Pairs',
          description: 'Question-answer pairs extracted and formatted'
        },
        {
          direction: 'in',
          data: 'KB Articles',
          description: 'Articles created and embedded for search'
        }
      ],
      keyFiles: [
        { file: 'scripts/ingest-youtube-comments-api.ts', purpose: 'Comment extraction script' }
      ]
    }
  }
];

export const integrationsByCategory = {
  ecommerce: integrations.filter(i => i.category === 'ecommerce'),
  crm: integrations.filter(i => i.category === 'crm'),
  content: integrations.filter(i => i.category === 'content')
};

export function getIntegrationBySlug(slug: string): Integration | undefined {
  return integrations.find(i => i.slug === slug);
}
