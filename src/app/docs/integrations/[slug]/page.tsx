import { notFound } from 'next/navigation';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { Breadcrumbs } from '@/components/docs/Breadcrumbs';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { Callout } from '@/components/docs/Callout';
import { integrations, getIntegrationBySlug } from '@/data/integrations';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return integrations.map((integration) => ({
    slug: integration.slug
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const integration = getIntegrationBySlug(slug);
  if (!integration) return { title: 'Integration Not Found' };

  return {
    title: `${integration.name} Integration - Lina Documentation`,
    description: integration.shortDescription
  };
}

export default async function IntegrationPage({ params }: PageProps) {
  const { slug } = await params;
  const integration = getIntegrationBySlug(slug);

  if (!integration) {
    notFound();
  }

  const categoryLabels = {
    ecommerce: 'E-Commerce',
    crm: 'CRM',
    content: 'Content'
  };

  const integrationIcon = {
    shopify: '🛒',
    hubspot: '🔶',
    youtube: '📺'
  };

  // Find prev/next integrations for navigation
  const currentIndex = integrations.findIndex((i) => i.slug === slug);
  const prevIntegration = currentIndex > 0 ? integrations[currentIndex - 1] : null;
  const nextIntegration = currentIndex < integrations.length - 1 ? integrations[currentIndex + 1] : null;

  return (
    <DocsLayout>
      <div className="docs-content">
        <Breadcrumbs
          items={[
            { label: 'Docs', href: '/docs' },
            { label: 'Integrations', href: '/docs/integrations' },
            { label: integration.name }
          ]}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <span style={{ fontSize: '48px' }}>
            {integrationIcon[slug as keyof typeof integrationIcon] || '🔗'}
          </span>
          <div>
            <span className="badge badge-info">{categoryLabels[integration.category]}</span>
            <h1 style={{ marginTop: '8px', marginBottom: 0 }}>{integration.name} Integration</h1>
          </div>
        </div>

        <p className="docs-lead">{integration.shortDescription}</p>

        <h2 id="overview">Overview</h2>
        <p>{integration.content.overview}</p>

        <h2 id="capabilities">Capabilities</h2>
        <ul>
          {integration.content.capabilities.map((capability, index) => (
            <li key={index}>{capability}</li>
          ))}
        </ul>

        <h2 id="configuration">Configuration</h2>
        <Callout type="warning" title="Environment Variables">
          These environment variables must be set in your <code>.env</code> file and on Vercel.
        </Callout>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {integration.content.configuration.map((config) => (
              <tr key={config.setting}>
                <td><code>{config.setting}</code></td>
                <td>{config.description}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {integration.content.dataFlow && integration.content.dataFlow.length > 0 && (
          <>
            <h2 id="data-flow">Data Flow</h2>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Data</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {integration.content.dataFlow.map((flow, index) => (
                  <tr key={index}>
                    <td>
                      <span
                        className={`badge ${
                          flow.direction === 'in'
                            ? 'badge-success'
                            : flow.direction === 'out'
                            ? 'badge-warning'
                            : 'badge-info'
                        }`}
                      >
                        {flow.direction === 'in' ? 'Inbound' : flow.direction === 'out' ? 'Outbound' : 'Bi-directional'}
                      </span>
                    </td>
                    <td>{flow.data}</td>
                    <td>{flow.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 id="key-files">Key Files</h2>
        <table className="docs-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {integration.content.keyFiles.map((file) => (
              <tr key={file.file}>
                <td><code>{file.file}</code></td>
                <td>{file.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Navigation */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '48px',
            paddingTop: '24px',
            borderTop: '1px solid var(--hs-border-light)'
          }}
        >
          {prevIntegration ? (
            <Link
              href={`/docs/integrations/${prevIntegration.slug}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <span style={{ fontSize: '12px', color: 'var(--hs-text-muted)' }}>Previous</span>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{prevIntegration.name}</span>
            </Link>
          ) : (
            <div />
          )}
          {nextIntegration ? (
            <Link
              href={`/docs/integrations/${nextIntegration.slug}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
            >
              <span style={{ fontSize: '12px', color: 'var(--hs-text-muted)' }}>Next</span>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{nextIntegration.name}</span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </DocsLayout>
  );
}
