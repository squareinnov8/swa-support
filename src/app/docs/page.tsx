import { DocsLayout } from '@/components/docs/DocsLayout';
import { FeatureGrid } from '@/components/docs/FeatureCard';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { Callout } from '@/components/docs/Callout';
import { features, featuresByCategory } from '@/data/features';
import Link from 'next/link';

export const metadata = {
  title: 'Documentation - Lina',
  description: 'Comprehensive documentation for Lina, the AI-powered customer support agent for SquareWheels Auto.'
};

export default function DocsPage() {
  return (
    <DocsLayout>
      <div className="docs-content">
        <h1>Lina Documentation</h1>
        <p className="docs-lead">
          Lina is an AI-powered customer support agent for SquareWheels Auto, handling support
          inquiries, order management, and vendor coordination with minimal human intervention.
        </p>

        <Callout type="info" title="Production URL">
          Lina is live at{' '}
          <a href="https://support-agent-v2.vercel.app">support-agent-v2.vercel.app</a>.
          Access the admin dashboard at{' '}
          <a href="/admin">/admin</a>.
        </Callout>

        <h2 id="overview">Overview</h2>
        <p>
          Lina monitors the SquareWheels Auto support inbox in real-time, automatically classifying
          incoming emails, retrieving relevant knowledge base articles, and drafting responses for
          human review or automatic sending.
        </p>

        <h3>Key Capabilities</h3>
        <ul>
          <li><strong>Real-time email monitoring</strong> via Gmail push notifications</li>
          <li><strong>Intent classification</strong> using LLM (17 intent categories)</li>
          <li><strong>Knowledge retrieval</strong> via hybrid vector + keyword search</li>
          <li><strong>Draft generation</strong> powered by Claude</li>
          <li><strong>Automatic sending</strong> for high-confidence responses</li>
          <li><strong>Order processing</strong> with vendor routing</li>
          <li><strong>Bi-directional vendor coordination</strong> for fulfillment</li>
        </ul>

        <h2 id="quick-start">Quick Start</h2>

        <h3>Running Locally</h3>
        <CodeBlock
          language="bash"
          code={`# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev

# Visit http://localhost:3000/admin`}
        />

        <h3>Common Commands</h3>
        <CodeBlock
          language="bash"
          code={`npm run dev          # Start development server
npm run build        # Production build
npm run test:run     # Run tests (215 tests)

# Database
npx supabase db push --linked    # Push migrations

# Data scripts
npm run seed:kb      # Seed knowledge base
npm run embed:kb     # Generate embeddings
npm run sync:catalog # Sync Shopify products`}
        />

        <h2 id="architecture">Architecture</h2>

        <h3>Tech Stack</h3>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Technology</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Framework</td>
              <td>Next.js 15 (App Router)</td>
            </tr>
            <tr>
              <td>Database</td>
              <td>Supabase (PostgreSQL + pgvector)</td>
            </tr>
            <tr>
              <td>LLM (Classification)</td>
              <td>OpenAI GPT-4o-mini</td>
            </tr>
            <tr>
              <td>LLM (Generation)</td>
              <td>Anthropic Claude</td>
            </tr>
            <tr>
              <td>Embeddings</td>
              <td>OpenAI text-embedding-3-small</td>
            </tr>
            <tr>
              <td>Deployment</td>
              <td>Vercel</td>
            </tr>
          </tbody>
        </table>

        <h3>Data Flow</h3>
        <CodeBlock
          language="text"
          code={`Gmail → Pub/Sub → Webhook → Ingest Pipeline
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
         Classify              Verify               Retrieve
          Intent              Customer                 KB
              └─────────────────────┼─────────────────────┘
                                    ↓
                              Generate Draft
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
          Policy               Promise                State
           Gate                Tracker               Machine
              └─────────────────────┼─────────────────────┘
                                    ↓
                            Auto-Send Decision`}
        />

        <h2 id="features">Features</h2>
        <p>
          Lina includes {features.length} core features organized into four categories.
        </p>

        <h3>Core Features</h3>
        <FeatureGrid features={featuresByCategory.core} />

        <h3>Automation</h3>
        <FeatureGrid features={featuresByCategory.automation} />

        <h3>Collaboration</h3>
        <FeatureGrid features={featuresByCategory.collaboration} />

        <h3>Safety & Compliance</h3>
        <FeatureGrid features={featuresByCategory.safety} />

        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <Link href="/docs/features" className="btn-primary" style={{ padding: '12px 24px' }}>
            View All Features
          </Link>
        </div>

        <h2 id="integrations">Integrations</h2>
        <p>
          Lina integrates with several external services to provide comprehensive support capabilities.
        </p>
        <ul>
          <li>
            <Link href="/docs/integrations/shopify"><strong>Shopify</strong></Link> -
            Customer verification, order lookup, product catalog
          </li>
          <li>
            <Link href="/docs/integrations/hubspot"><strong>HubSpot</strong></Link> -
            CRM sync, ticket creation, contact management
          </li>
          <li>
            <Link href="/docs/integrations/youtube"><strong>YouTube</strong></Link> -
            Q&A extraction from video comments
          </li>
        </ul>

        <h2 id="admin-ui">Admin UI</h2>
        <p>
          The admin dashboard provides access to all Lina functionality:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Path</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Inbox</td>
              <td><code>/admin</code></td>
              <td>View and manage support threads</td>
            </tr>
            <tr>
              <td>Thread Detail</td>
              <td><code>/admin/thread/[id]</code></td>
              <td>View thread, review drafts, chat with Lina</td>
            </tr>
            <tr>
              <td>Orders</td>
              <td><code>/admin/orders</code></td>
              <td>View and manage orders</td>
            </tr>
            <tr>
              <td>Vendors</td>
              <td><code>/admin/vendors</code></td>
              <td>Manage vendor contacts and patterns</td>
            </tr>
            <tr>
              <td>Learning</td>
              <td><code>/admin/learning</code></td>
              <td>Review learning proposals</td>
            </tr>
            <tr>
              <td>Knowledge Base</td>
              <td><code>/admin/kb</code></td>
              <td>Browse and import KB articles</td>
            </tr>
            <tr>
              <td>Instructions</td>
              <td><code>/admin/instructions</code></td>
              <td>Edit agent behavior rules</td>
            </tr>
          </tbody>
        </table>

        <h2 id="troubleshooting">Need Help?</h2>
        <p>
          Check out the <Link href="/docs/troubleshooting">troubleshooting guide</Link> for
          common issues and solutions.
        </p>
      </div>
    </DocsLayout>
  );
}
