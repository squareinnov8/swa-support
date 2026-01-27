import { DocsLayout } from '@/components/docs/DocsLayout';
import { Breadcrumbs } from '@/components/docs/Breadcrumbs';
import { integrations, integrationsByCategory } from '@/data/integrations';
import Link from 'next/link';

export const metadata = {
  title: 'Integrations - Lina Documentation',
  description: 'Explore integrations available for Lina, including Shopify, HubSpot, and YouTube.'
};

export default function IntegrationsPage() {
  const categoryLabels = {
    ecommerce: 'E-Commerce',
    crm: 'CRM',
    content: 'Content'
  };

  const categoryIcons = {
    ecommerce: '🛒',
    crm: '🔶',
    content: '📺'
  };

  return (
    <DocsLayout>
      <div className="docs-content">
        <Breadcrumbs
          items={[
            { label: 'Docs', href: '/docs' },
            { label: 'Integrations' }
          ]}
        />

        <h1>Integrations</h1>
        <p className="docs-lead">
          Lina integrates with several external services to provide comprehensive
          customer support capabilities. These integrations enable customer verification,
          order management, CRM synchronization, and knowledge base enrichment.
        </p>

        {Object.entries(integrationsByCategory).map(([category, categoryIntegrations]) => (
          categoryIntegrations.length > 0 && (
            <section key={category}>
              <h2 id={category}>
                {categoryIcons[category as keyof typeof categoryIcons]}{' '}
                {categoryLabels[category as keyof typeof categoryLabels]}
              </h2>
              <div className="integration-grid">
                {categoryIntegrations.map((integration) => (
                  <Link
                    key={integration.slug}
                    href={`/docs/integrations/${integration.slug}`}
                    className="integration-card"
                    style={{ textDecoration: 'none' }}
                  >
                    <div
                      className="integration-logo"
                      style={{
                        fontSize: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {integration.name === 'Shopify' && '🛒'}
                      {integration.name === 'HubSpot' && '🔶'}
                      {integration.name === 'YouTube' && '📺'}
                    </div>
                    <h3 className="integration-name">{integration.name}</h3>
                    <p className="integration-description">{integration.shortDescription}</p>
                  </Link>
                ))}
              </div>
            </section>
          )
        ))}

        <h2 id="coming-soon">Coming Soon</h2>
        <p>
          We&apos;re working on additional integrations to expand Lina&apos;s capabilities:
        </p>
        <ul>
          <li><strong>Slack</strong> - Real-time notifications and escalation alerts</li>
          <li><strong>Zendesk</strong> - Two-way ticket synchronization</li>
          <li><strong>Intercom</strong> - Live chat integration</li>
        </ul>
      </div>
    </DocsLayout>
  );
}
