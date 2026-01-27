export interface Feature {
  slug: string;
  title: string;
  shortDescription: string;
  icon: string;
  category: 'core' | 'automation' | 'collaboration' | 'safety';
  content: {
    overview: string;
    howItWorks: string[];
    keyCapabilities: Array<{
      title: string;
      description: string;
    }>;
    configuration?: Array<{
      setting: string;
      description: string;
      default?: string;
    }>;
    keyFiles: Array<{
      file: string;
      purpose: string;
    }>;
    dataFlow?: string;
  };
}

export const features: Feature[] = [
  {
    slug: 'gmail-integration',
    title: 'Gmail Integration',
    shortDescription: 'Real-time email monitoring with OAuth authentication and push notifications.',
    icon: '📧',
    category: 'core',
    content: {
      overview: 'Lina monitors the SquareWheels Auto support inbox in real-time using Gmail API integration. OAuth authentication ensures secure access, while Google Cloud Pub/Sub push notifications enable instant processing of incoming emails.',
      howItWorks: [
        'Admin authorizes Gmail access via the OAuth setup wizard at /admin/gmail-setup',
        'System registers for push notifications via Google Cloud Pub/Sub',
        'Incoming emails trigger the webhook at /api/webhooks/gmail',
        'Messages are processed through the ingestion pipeline immediately',
        'A daily fallback poll at 8am UTC ensures no emails are missed'
      ],
      keyCapabilities: [
        {
          title: 'OAuth Authentication',
          description: 'Secure Gmail access using OAuth 2.0 with scopes for reading, sending, and modifying emails.'
        },
        {
          title: 'Push Notifications',
          description: 'Real-time email processing via Google Cloud Pub/Sub - no polling delays.'
        },
        {
          title: 'Watch Management',
          description: 'Automatic renewal of Gmail watch every 6 days to maintain push notifications.'
        },
        {
          title: 'Draft Sending',
          description: 'Send approved or auto-approved drafts directly via Gmail API.'
        }
      ],
      configuration: [
        { setting: 'GOOGLE_CLIENT_ID', description: 'Gmail OAuth client ID' },
        { setting: 'GOOGLE_CLIENT_SECRET', description: 'Gmail OAuth client secret' },
        { setting: 'GOOGLE_REDIRECT_URI', description: 'OAuth callback URL' },
        { setting: 'GMAIL_PUBSUB_TOPIC', description: 'Pub/Sub topic for push notifications' }
      ],
      keyFiles: [
        { file: 'src/lib/gmail/monitor.ts', purpose: 'Polling and message sync' },
        { file: 'src/lib/gmail/watch.ts', purpose: 'Push notification management' },
        { file: 'src/lib/gmail/sendDraft.ts', purpose: 'Send approved drafts' },
        { file: 'src/app/api/webhooks/gmail/route.ts', purpose: 'Webhook handler' }
      ],
      dataFlow: 'Gmail → Pub/Sub → Webhook → processIngestRequest() → Thread Created'
    }
  },
  {
    slug: 'llm-classification',
    title: 'LLM Classification',
    shortDescription: 'AI-powered intent classification supporting 17 categories with missing info detection.',
    icon: '🧠',
    category: 'core',
    content: {
      overview: 'Every incoming email is analyzed by an LLM to determine customer intent, identify missing information, and decide if verification or escalation is needed. This replaces 500+ regex patterns with a single flexible model.',
      howItWorks: [
        'Pre-filter checks for automated platform notifications (Shopify, etc.)',
        'LLM analyzes message content and conversation context',
        'Multiple intents may be detected with confidence scores',
        'Missing info fields are identified for clarification requests',
        'Verification and escalation flags are set based on intent type'
      ],
      keyCapabilities: [
        {
          title: '17 Intent Categories',
          description: 'Order status, returns, compatibility, firmware, escalations, and more.'
        },
        {
          title: 'Multi-Intent Detection',
          description: 'Single message can trigger multiple intents with individual confidence scores.'
        },
        {
          title: 'Missing Info Detection',
          description: 'LLM identifies what additional information is needed to help the customer.'
        },
        {
          title: 'Verification Routing',
          description: 'Automatically determines when customer identity verification is required.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/intents/llmClassify.ts', purpose: 'LLM-based classification' },
        { file: 'src/lib/intents/taxonomy.ts', purpose: 'Intent definitions' },
        { file: 'src/lib/intents/classify.ts', purpose: 'Automated email detection' },
        { file: 'src/lib/intents/missingInfoPrompt.ts', purpose: 'Clarification prompts' }
      ]
    }
  },
  {
    slug: 'knowledge-base',
    title: 'Knowledge Base',
    shortDescription: 'Hybrid search combining vector embeddings and keyword matching for accurate retrieval.',
    icon: '📚',
    category: 'core',
    content: {
      overview: 'The knowledge base stores product information, installation guides, troubleshooting articles, and FAQ content. Hybrid search combines vector similarity with keyword matching to find the most relevant content for each query.',
      howItWorks: [
        'Documents are stored in the kb_docs table with metadata',
        'Long documents are chunked for better retrieval granularity',
        'OpenAI text-embedding-3-small generates vector embeddings',
        'Search queries use both cosine similarity and keyword matching',
        'Results are re-ranked and the top K are returned'
      ],
      keyCapabilities: [
        {
          title: 'Hybrid Search',
          description: 'Combines vector similarity with keyword matching for better accuracy.'
        },
        {
          title: 'Multiple Sources',
          description: 'Import from Gmail, Notion, websites, and YouTube comments.'
        },
        {
          title: 'Automatic Chunking',
          description: 'Long documents split into optimal-size chunks for retrieval.'
        },
        {
          title: 'Dynamic Updates',
          description: 'KB can be updated via admin chat with Lina.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/kb/documents.ts', purpose: 'CRUD operations' },
        { file: 'src/lib/kb/embedDocs.ts', purpose: 'Embedding generation' },
        { file: 'src/lib/retrieval/index.ts', purpose: 'Hybrid search' }
      ],
      dataFlow: 'Query → Embed → Vector Search ∪ Keyword Search → Re-rank → Top K Results'
    }
  },
  {
    slug: 'draft-generation',
    title: 'Draft Generation',
    shortDescription: 'Claude-powered response generation with context from KB, orders, and conversation history.',
    icon: '✍️',
    category: 'core',
    content: {
      overview: 'Lina generates draft responses using Claude, incorporating relevant KB articles, customer information, order history, and conversation context. Drafts follow dynamic instructions stored in the database.',
      howItWorks: [
        'Context assembly gathers KB results, customer info, and order history',
        'Dynamic instructions are loaded from the database',
        'Prompt is constructed with all context and instructions',
        'Claude generates a draft response',
        'Post-processing applies policy gate and promise detection'
      ],
      keyCapabilities: [
        {
          title: 'Context-Aware',
          description: 'Incorporates KB articles, order history, and full conversation thread.'
        },
        {
          title: 'Dynamic Instructions',
          description: 'Behavior rules loaded from database, updatable without code changes.'
        },
        {
          title: 'Product Recommendations',
          description: 'Automatically includes compatible products when vehicle is detected.'
        },
        {
          title: 'Consistent Tone',
          description: 'Follows persona and style guidelines, always signs off as "– Lina".'
        }
      ],
      keyFiles: [
        { file: 'src/lib/llm/draftGenerator.ts', purpose: 'Main draft generation' },
        { file: 'src/lib/llm/prompts.ts', purpose: 'System prompts' },
        { file: 'src/lib/llm/contextualEmailGenerator.ts', purpose: 'Specialized emails' },
        { file: 'src/lib/instructions/index.ts', purpose: 'Instruction loading' }
      ]
    }
  },
  {
    slug: 'auto-send',
    title: 'Auto-Send',
    shortDescription: 'Automatic draft sending based on confidence thresholds and verification status.',
    icon: '🚀',
    category: 'automation',
    content: {
      overview: 'When Lina is confident in a response and all safety checks pass, drafts can be sent automatically without human review. Different intent types have different confidence thresholds.',
      howItWorks: [
        'Compare classification confidence against intent-specific threshold',
        'Check customer verification status for order-related intents',
        'Run policy gate to confirm no banned content',
        'If all checks pass, send draft automatically',
        'Log auto-send event for auditing'
      ],
      keyCapabilities: [
        {
          title: 'Intent-Specific Thresholds',
          description: 'Order intents require 85%+ confidence, general questions only 60%.'
        },
        {
          title: 'Verification Gating',
          description: 'Order-related auto-sends require verified customer identity.'
        },
        {
          title: 'Safety Checks',
          description: 'Policy gate prevents auto-sending any banned or risky content.'
        },
        {
          title: 'Master Toggle',
          description: 'Auto-send can be enabled/disabled via admin settings.'
        }
      ],
      configuration: [
        { setting: 'auto_send_enabled', description: 'Master toggle for auto-send', default: 'false' },
        { setting: 'auto_send_confidence_threshold', description: 'Base confidence threshold', default: '0.85' },
        { setting: 'require_verification_for_send', description: 'Require verification for order intents', default: 'true' }
      ],
      keyFiles: [
        { file: 'src/lib/ingest/processRequest.ts', purpose: 'Auto-send logic' },
        { file: 'src/app/api/admin/settings/route.ts', purpose: 'Settings API' }
      ]
    }
  },
  {
    slug: 'order-management',
    title: 'Order Management',
    shortDescription: 'Automated order processing from Shopify with vendor routing and tracking.',
    icon: '📦',
    category: 'automation',
    content: {
      overview: 'Lina automatically processes Shopify order confirmation emails, checks customer blacklists, matches products to vendors, and forwards orders for fulfillment. Multi-vendor orders are split and routed appropriately.',
      howItWorks: [
        'Detect Shopify order confirmation emails by subject pattern',
        'Parse order details: customer info, shipping address, products',
        'Check if customer email is on the blacklist',
        'Flag high-value orders (>$3,000) for manual review',
        'Match products to vendors via pattern matching',
        'Forward order to vendor(s) via Gmail API'
      ],
      keyCapabilities: [
        {
          title: 'Automatic Detection',
          description: 'Recognizes Shopify order emails by subject pattern.'
        },
        {
          title: 'Blacklist Checking',
          description: 'Blocks orders from known problematic customers.'
        },
        {
          title: 'Vendor Routing',
          description: 'Matches products to vendors using configurable patterns.'
        },
        {
          title: 'Multi-Vendor Support',
          description: 'Orders with items from multiple vendors are split and forwarded separately.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/orders/processOrder.ts', purpose: 'Main processing pipeline' },
        { file: 'src/lib/orders/ingest.ts', purpose: 'Order email parsing' },
        { file: 'src/lib/vendors/lookup.ts', purpose: 'Vendor matching' }
      ]
    }
  },
  {
    slug: 'vendor-coordination',
    title: 'Vendor Coordination',
    shortDescription: 'Bi-directional communication between vendors and customers for order fulfillment.',
    icon: '🤝',
    category: 'automation',
    content: {
      overview: 'When vendors need additional information from customers (dashboard photos, color confirmations, etc.), Lina automatically handles the communication. Customer responses are validated and forwarded back to vendors.',
      howItWorks: [
        'Monitor for replies from known vendor email addresses',
        'LLM parses vendor requests (photos, confirmations, etc.)',
        'Send automatic outreach email to customer',
        'When customer replies, download and validate attachments',
        'Photos validated via GPT-4o Vision for quality',
        'Forward validated responses to vendor with attachments'
      ],
      keyCapabilities: [
        {
          title: 'Request Parsing',
          description: 'LLM extracts request types: dashboard_photo, color_confirmation, etc.'
        },
        {
          title: 'Photo Validation',
          description: 'GPT-4o Vision verifies dashboard photos show required details.'
        },
        {
          title: 'Attachment Handling',
          description: 'Customer photos and documents forwarded to vendors intact.'
        },
        {
          title: 'Lifecycle Tracking',
          description: 'Each request tracked through: pending → received → validated → forwarded.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/orders/vendorCoordination.ts', purpose: 'Main coordination logic' },
        { file: 'src/lib/llm/contextualEmailGenerator.ts', purpose: 'Email generation' }
      ]
    }
  },
  {
    slug: 'human-collaboration',
    title: 'Human Collaboration',
    shortDescription: 'Observation mode enabling Lina to learn from human-handled tickets.',
    icon: '👥',
    category: 'collaboration',
    content: {
      overview: 'When a human takes over a ticket, Lina observes the resolution process and generates learning proposals. These can be reviewed and approved to improve KB articles or agent instructions.',
      howItWorks: [
        'Admin clicks "Take Over" to switch thread to HUMAN_HANDLING mode',
        'Lina observes but does not generate drafts',
        'When resolved, system analyzes the human\'s approach',
        'Learning proposals generated for KB/instruction improvements',
        'Admin reviews and approves proposals at /admin/learning'
      ],
      keyCapabilities: [
        {
          title: 'Observation Mode',
          description: 'Lina watches and learns without interfering.'
        },
        {
          title: 'Resolution Analysis',
          description: 'Analyzes what information and approach led to resolution.'
        },
        {
          title: 'Learning Proposals',
          description: 'Generates specific KB article or instruction suggestions.'
        },
        {
          title: 'Stale Timeout',
          description: 'Threads stuck 48+ hours automatically return to Lina with apology.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/collaboration/observationMode.ts', purpose: 'Mode switching' },
        { file: 'src/lib/collaboration/learningGenerator.ts', purpose: 'Learning proposals' },
        { file: 'src/lib/learning/resolutionAnalyzer.ts', purpose: 'Resolution analysis' },
        { file: 'src/lib/threads/staleHumanHandling.ts', purpose: 'Timeout handling' }
      ]
    }
  },
  {
    slug: 'dynamic-instructions',
    title: 'Dynamic Instructions',
    shortDescription: 'Live behavior updates via admin chat without code changes.',
    icon: '⚙️',
    category: 'collaboration',
    content: {
      overview: 'Agent behavior rules are stored in the database and can be updated in real-time through admin chat. Lina uses tools to make actual changes that take effect immediately across all future responses.',
      howItWorks: [
        'Admin chats with Lina in the thread detail view',
        'Lina interprets feedback and determines appropriate action',
        'Tools are invoked to create KB articles or update instructions',
        'Changes are persisted to database immediately',
        'All subsequent responses use the updated instructions'
      ],
      keyCapabilities: [
        {
          title: 'Real-Time Updates',
          description: 'Changes take effect immediately without deployment.'
        },
        {
          title: 'Tool-Based Actions',
          description: 'Lina uses tools to make actual changes, not just acknowledge.'
        },
        {
          title: 'Audit Trail',
          description: 'All tool actions logged to lina_tool_actions table.'
        },
        {
          title: 'Honesty Requirements',
          description: 'Lina never claims actions unless tools succeeded.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/llm/linaTools.ts', purpose: 'Tool definitions' },
        { file: 'src/lib/llm/linaToolExecutor.ts', purpose: 'Tool execution' },
        { file: 'src/lib/instructions/index.ts', purpose: 'Instruction loading' }
      ]
    }
  },
  {
    slug: 'policy-gate',
    title: 'Policy Gate',
    shortDescription: 'Deterministic safety rules ensuring drafts comply with company policy.',
    icon: '🛡️',
    category: 'safety',
    content: {
      overview: 'Before any draft is sent, it passes through a policy gate that checks for banned content and policy violations. This is deterministic (not LLM-based) to ensure consistent enforcement.',
      howItWorks: [
        'Draft content is scanned against banned patterns',
        'Rules check for unauthorized promises, legal advice, etc.',
        'Any violations block the draft or flag for review',
        'Clear violation reasons are logged'
      ],
      keyCapabilities: [
        {
          title: 'Banned Content Detection',
          description: 'Catches unauthorized discounts, competitor mentions, personal info.'
        },
        {
          title: 'Promise Prevention',
          description: 'Blocks unauthorized refund, shipping, or timeline promises.'
        },
        {
          title: 'Deterministic Rules',
          description: 'Not LLM-based, ensuring consistent enforcement.'
        },
        {
          title: 'Clear Logging',
          description: 'Violations logged with specific reasons for review.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/responders/policyGate.ts', purpose: 'Policy enforcement' }
      ]
    }
  },
  {
    slug: 'promise-tracking',
    title: 'Promise Tracking',
    shortDescription: 'LLM-based detection of commitments made in draft responses.',
    icon: '📝',
    category: 'safety',
    content: {
      overview: 'Drafts are analyzed to detect any commitments or promises made to customers. These are categorized and logged for auditing and follow-up.',
      howItWorks: [
        'After draft generation, content is analyzed by LLM',
        'Promises and commitments are identified and extracted',
        'Each promise is categorized by type',
        'Events logged to events table for auditing'
      ],
      keyCapabilities: [
        {
          title: 'LLM Detection',
          description: 'Understands natural language promises, not just keywords.'
        },
        {
          title: 'Categorization',
          description: 'Classifies as refund, shipping, replacement, follow_up, etc.'
        },
        {
          title: 'Audit Logging',
          description: 'All detected promises logged for review and follow-up.'
        },
        {
          title: 'Fallback Mode',
          description: 'Keyword-based detection when LLM unavailable.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/responders/promisedActions.ts', purpose: 'Detection and logging' }
      ]
    }
  },
  {
    slug: 'thread-state-machine',
    title: 'Thread State Machine',
    shortDescription: 'Status management with automatic state transitions based on events.',
    icon: '🔄',
    category: 'core',
    content: {
      overview: 'Every support thread has a state that reflects its current status. State transitions happen automatically based on events like customer replies, resolution, or escalation.',
      howItWorks: [
        'New threads start in NEW state',
        'Classification may move to AWAITING_INFO if info needed',
        'Processing moves to IN_PROGRESS',
        'Resolution moves to RESOLVED',
        'Escalation flags move to ESCALATED or HUMAN_HANDLING'
      ],
      keyCapabilities: [
        {
          title: 'Automatic Transitions',
          description: 'State changes based on events without manual intervention.'
        },
        {
          title: 'Archive Support',
          description: 'Resolved threads can be archived and unarchived on reply.'
        },
        {
          title: 'Human Handling',
          description: 'Separate state for when humans take over tickets.'
        },
        {
          title: 'Clear History',
          description: 'State transitions logged in events table.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/threads/stateMachine.ts', purpose: 'State transitions' },
        { file: 'src/lib/threads/archiveThread.ts', purpose: 'Archive logic' }
      ]
    }
  },
  {
    slug: 'vehicle-detection',
    title: 'Vehicle Detection',
    shortDescription: 'LLM-based extraction of year/make/model from natural language.',
    icon: '🚗',
    category: 'core',
    content: {
      overview: 'When customers mention their vehicle, Lina extracts structured year/make/model information using LLM. This enables automatic product compatibility lookups and relevant installation guides.',
      howItWorks: [
        'Message content is scanned for vehicle mentions',
        'LLM extracts structured vehicle data',
        'Confidence score indicates extraction reliability',
        'High-confidence detections trigger product lookup',
        'Compatible products and installation guides included in context'
      ],
      keyCapabilities: [
        {
          title: 'Natural Language Parsing',
          description: 'Understands "2019 Q50 Red Sport", "07 Silverado", "my f150".'
        },
        {
          title: 'Confidence Scoring',
          description: 'Rates extraction confidence for reliable matching.'
        },
        {
          title: 'Product Lookup',
          description: 'Automatically finds compatible products for detected vehicle.'
        },
        {
          title: 'Installation Guides',
          description: 'Includes relevant install guides in draft context.'
        }
      ],
      keyFiles: [
        { file: 'src/lib/catalog/vehicleDetector.ts', purpose: 'Vehicle extraction' },
        { file: 'src/lib/catalog/lookup.ts', purpose: 'Product fitment lookup' }
      ]
    }
  }
];

export const featuresByCategory = {
  core: features.filter(f => f.category === 'core'),
  automation: features.filter(f => f.category === 'automation'),
  collaboration: features.filter(f => f.category === 'collaboration'),
  safety: features.filter(f => f.category === 'safety')
};

export function getFeatureBySlug(slug: string): Feature | undefined {
  return features.find(f => f.slug === slug);
}
