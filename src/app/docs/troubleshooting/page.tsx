import { DocsLayout } from '@/components/docs/DocsLayout';
import { Breadcrumbs } from '@/components/docs/Breadcrumbs';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { Callout } from '@/components/docs/Callout';

export const metadata = {
  title: 'Troubleshooting - Lina Documentation',
  description: 'Common issues and solutions for Lina, the AI-powered customer support agent.'
};

export default function TroubleshootingPage() {
  return (
    <DocsLayout>
      <div className="docs-content">
        <Breadcrumbs
          items={[
            { label: 'Docs', href: '/docs' },
            { label: 'Troubleshooting' }
          ]}
        />

        <h1>Troubleshooting</h1>
        <p className="docs-lead">
          Common issues and their solutions. If you encounter a problem not listed here,
          check the Vercel logs for detailed error messages.
        </p>

        <h2 id="gmail-sync">Gmail Not Syncing</h2>

        <h3>Symptoms</h3>
        <ul>
          <li>New emails not appearing in the inbox</li>
          <li>Threads not updating when customers reply</li>
          <li>&quot;Last synced&quot; timestamp is stale</li>
        </ul>

        <h3>Solutions</h3>

        <Callout type="info" title="Check OAuth Status">
          Visit <code>/admin/gmail-setup</code> to verify the OAuth connection is active.
        </Callout>

        <ol>
          <li>
            <strong>Verify OAuth tokens</strong>
            <p>
              Go to <code>/admin/gmail-setup</code> and check if the connection shows as active.
              If not, re-authorize the Gmail connection.
            </p>
          </li>
          <li>
            <strong>Check watch status</strong>
            <p>
              The Gmail watch may have expired. Check the <code>gmail_sync_state</code> table
              for the <code>watch_expiration</code> field. If expired, the watch will be
              renewed automatically on the next cron run.
            </p>
          </li>
          <li>
            <strong>Review webhook logs</strong>
            <p>
              Check Vercel function logs for <code>/api/webhooks/gmail</code> to see if
              webhooks are being received and processed.
            </p>
          </li>
          <li>
            <strong>Force manual poll</strong>
            <CodeBlock
              language="bash"
              code={`curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true"

# Fetch recent emails (last 3 days):
curl -X POST "https://support-agent-v2.vercel.app/api/agent/poll?force=true&fetchRecent=true&fetchDays=3"`}
            />
          </li>
        </ol>

        <h2 id="drafts-not-generating">Drafts Not Generating</h2>

        <h3>Symptoms</h3>
        <ul>
          <li>Thread shows &quot;Processing...&quot; but no draft appears</li>
          <li>Draft field is empty in thread detail</li>
          <li>Events show errors during draft generation</li>
        </ul>

        <h3>Solutions</h3>

        <ol>
          <li>
            <strong>Check intent classification</strong>
            <p>
              View the thread detail page and check the classified intent. If intent is
              <code>UNKNOWN</code> or confidence is very low, Lina may be struggling to
              understand the message.
            </p>
          </li>
          <li>
            <strong>Verify KB has relevant articles</strong>
            <p>
              Go to <code>/admin/kb</code> and search for terms related to the customer&apos;s
              question. If no relevant articles exist, add them to the KB.
            </p>
          </li>
          <li>
            <strong>Check API keys</strong>
            <p>
              Verify <code>ANTHROPIC_API_KEY</code> is valid and has sufficient credits.
            </p>
          </li>
          <li>
            <strong>Review thread events</strong>
            <p>
              Check the events log in the thread detail for specific error messages.
            </p>
          </li>
        </ol>

        <h2 id="orders-not-forwarding">Orders Not Forwarding to Vendors</h2>

        <h3>Symptoms</h3>
        <ul>
          <li>Order appears in <code>/admin/orders</code> but status is stuck on &quot;new&quot;</li>
          <li>Vendor hasn&apos;t received the order email</li>
          <li>Order shows in &quot;pending_review&quot; status</li>
        </ul>

        <h3>Solutions</h3>

        <ol>
          <li>
            <strong>Check vendor patterns</strong>
            <p>
              Go to <code>/admin/vendors</code> and verify the product patterns match the
              products in the order. Patterns are case-insensitive substrings.
            </p>
          </li>
          <li>
            <strong>Verify vendor email addresses</strong>
            <p>
              Ensure the vendor&apos;s contact email is correct and can receive emails.
            </p>
          </li>
          <li>
            <strong>Check for pending review</strong>
            <p>
              Orders may be flagged for manual review if:
            </p>
            <ul>
              <li>Customer is on the blacklist</li>
              <li>Order value exceeds $3,000</li>
              <li>No vendor matches the products</li>
            </ul>
          </li>
          <li>
            <strong>Review order events</strong>
            <p>
              Check the order detail page for event history and error messages.
            </p>
          </li>
        </ol>

        <h2 id="high-escalation-rate">High Escalation Rate</h2>

        <h3>Symptoms</h3>
        <ul>
          <li>Many threads going to ESCALATED state</li>
          <li>Low auto-send rate</li>
          <li>Frequent &quot;requires human review&quot; messages</li>
        </ul>

        <h3>Solutions</h3>

        <ol>
          <li>
            <strong>Review escalated threads</strong>
            <p>
              Look for patterns in escalated threads. Are they all about the same topic?
              Missing KB coverage? Unclear customer messages?
            </p>
          </li>
          <li>
            <strong>Update knowledge base</strong>
            <p>
              Add articles covering common questions that are being escalated.
            </p>
          </li>
          <li>
            <strong>Review agent instructions</strong>
            <p>
              Check <code>/admin/instructions</code> to ensure escalation rules aren&apos;t
              too aggressive.
            </p>
          </li>
          <li>
            <strong>Check learning proposals</strong>
            <p>
              Review and approve pending learning proposals at <code>/admin/learning</code>
              to help Lina learn from human-handled tickets.
            </p>
          </li>
        </ol>

        <h2 id="auto-send-not-working">Auto-Send Not Working</h2>

        <h3>Symptoms</h3>
        <ul>
          <li>Drafts generated but not sent automatically</li>
          <li>All drafts requiring manual approval</li>
        </ul>

        <h3>Solutions</h3>

        <ol>
          <li>
            <strong>Check auto-send settings</strong>
            <p>
              Verify <code>auto_send_enabled</code> is true in agent settings.
            </p>
          </li>
          <li>
            <strong>Review confidence thresholds</strong>
            <p>
              Classification confidence may be below the threshold. Default thresholds:
            </p>
            <ul>
              <li>Order intents: 0.85+</li>
              <li>Product questions: 0.60+</li>
              <li>Greetings: 0.40+</li>
            </ul>
          </li>
          <li>
            <strong>Check verification requirements</strong>
            <p>
              Order-related intents require customer verification. Ensure customers are
              verified before auto-send can work.
            </p>
          </li>
          <li>
            <strong>Review policy gate</strong>
            <p>
              Check thread events for policy gate blocks. Certain content will prevent
              auto-sending regardless of confidence.
            </p>
          </li>
        </ol>

        <h2 id="vendor-coordination">Vendor Coordination Issues</h2>

        <h3>Symptoms</h3>
        <ul>
          <li>Vendor requests stuck in &quot;pending&quot; status</li>
          <li>Customer responses not being forwarded</li>
          <li>Photo validation failing incorrectly</li>
        </ul>

        <h3>Solutions</h3>

        <ol>
          <li>
            <strong>Check vendor_requests table</strong>
            <p>
              Query the database to see request status and any error messages.
            </p>
          </li>
          <li>
            <strong>Verify vendor email patterns</strong>
            <p>
              Vendor replies are detected by email address. Ensure the sender matches
              a known vendor in the system.
            </p>
          </li>
          <li>
            <strong>Review photo validation</strong>
            <p>
              Photo validation uses GPT-4o Vision. If photos are being rejected incorrectly,
              check the validation criteria in the vendorCoordination module.
            </p>
          </li>
          <li>
            <strong>Check customer outreach thread ID</strong>
            <p>
              Customer responses are matched by Gmail thread ID. Verify the
              <code>customer_outreach_thread_id</code> in the orders table.
            </p>
          </li>
        </ol>

        <h2 id="database-issues">Database Issues</h2>

        <h3>Common Commands</h3>

        <CodeBlock
          language="bash"
          code={`# Push migrations to production
npx supabase db push --linked

# Generate types from database
npx supabase gen types typescript --linked > src/types/database.ts

# Check connection
npx supabase status`}
        />

        <h3>Common Queries</h3>

        <CodeBlock
          language="sql"
          code={`-- Check Gmail sync state
SELECT * FROM gmail_sync_state;

-- Recent thread events
SELECT * FROM events
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- Pending vendor requests
SELECT * FROM vendor_requests
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Orders awaiting review
SELECT * FROM orders
WHERE status = 'pending_review'
ORDER BY created_at DESC;`}
        />

        <h2 id="getting-help">Getting Help</h2>

        <Callout type="info" title="Need more help?">
          Contact Rob at rob@squarewheelsauto.com for issues not covered here.
        </Callout>

        <p>
          When reporting issues, please include:
        </p>
        <ul>
          <li>Thread ID or order ID (if applicable)</li>
          <li>Timestamp of when the issue occurred</li>
          <li>Screenshots of error messages</li>
          <li>Relevant Vercel function logs</li>
        </ul>
      </div>
    </DocsLayout>
  );
}
