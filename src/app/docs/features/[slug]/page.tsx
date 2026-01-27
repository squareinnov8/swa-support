import { notFound } from 'next/navigation';
import { DocsLayout } from '@/components/docs/DocsLayout';
import { Breadcrumbs } from '@/components/docs/Breadcrumbs';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { Callout } from '@/components/docs/Callout';
import { features, getFeatureBySlug } from '@/data/features';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return features.map((feature) => ({
    slug: feature.slug
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);
  if (!feature) return { title: 'Feature Not Found' };

  return {
    title: `${feature.title} - Lina Documentation`,
    description: feature.shortDescription
  };
}

export default async function FeaturePage({ params }: PageProps) {
  const { slug } = await params;
  const feature = getFeatureBySlug(slug);

  if (!feature) {
    notFound();
  }

  const categoryLabels = {
    core: 'Core Feature',
    automation: 'Automation',
    collaboration: 'Collaboration',
    safety: 'Safety & Compliance'
  };

  // Find prev/next features for navigation
  const currentIndex = features.findIndex((f) => f.slug === slug);
  const prevFeature = currentIndex > 0 ? features[currentIndex - 1] : null;
  const nextFeature = currentIndex < features.length - 1 ? features[currentIndex + 1] : null;

  return (
    <DocsLayout>
      <div className="docs-content">
        <Breadcrumbs
          items={[
            { label: 'Docs', href: '/docs' },
            { label: 'Features', href: '/docs/features' },
            { label: feature.title }
          ]}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <span style={{ fontSize: '48px' }}>{feature.icon}</span>
          <div>
            <span className="badge badge-info">{categoryLabels[feature.category]}</span>
            <h1 style={{ marginTop: '8px', marginBottom: 0 }}>{feature.title}</h1>
          </div>
        </div>

        <p className="docs-lead">{feature.shortDescription}</p>

        <h2 id="overview">Overview</h2>
        <p>{feature.content.overview}</p>

        <h2 id="how-it-works">How It Works</h2>
        <ol>
          {feature.content.howItWorks.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>

        {feature.content.dataFlow && (
          <>
            <h3>Data Flow</h3>
            <CodeBlock language="text" code={feature.content.dataFlow} />
          </>
        )}

        <h2 id="key-capabilities">Key Capabilities</h2>
        <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
          {feature.content.keyCapabilities.map((capability, index) => (
            <div
              key={index}
              className="card"
              style={{ padding: '16px 20px' }}
            >
              <h4 style={{ margin: '0 0 8px 0' }}>{capability.title}</h4>
              <p style={{ margin: 0, color: 'var(--hs-text-medium)' }}>
                {capability.description}
              </p>
            </div>
          ))}
        </div>

        {feature.content.configuration && feature.content.configuration.length > 0 && (
          <>
            <h2 id="configuration">Configuration</h2>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Description</th>
                  {feature.content.configuration.some((c) => c.default) && <th>Default</th>}
                </tr>
              </thead>
              <tbody>
                {feature.content.configuration.map((config) => (
                  <tr key={config.setting}>
                    <td><code>{config.setting}</code></td>
                    <td>{config.description}</td>
                    {feature.content.configuration?.some((c) => c.default) && (
                      <td>{config.default || '-'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 id="key-files">Key Files</h2>
        <Callout type="info" title="Source Code">
          These files contain the implementation for this feature.
        </Callout>
        <table className="docs-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {feature.content.keyFiles.map((file) => (
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
          {prevFeature ? (
            <Link
              href={`/docs/features/${prevFeature.slug}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
            >
              <span style={{ fontSize: '12px', color: 'var(--hs-text-muted)' }}>Previous</span>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{prevFeature.title}</span>
            </Link>
          ) : (
            <div />
          )}
          {nextFeature ? (
            <Link
              href={`/docs/features/${nextFeature.slug}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
            >
              <span style={{ fontSize: '12px', color: 'var(--hs-text-muted)' }}>Next</span>
              <span style={{ fontSize: '14px', fontWeight: 500 }}>{nextFeature.title}</span>
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </DocsLayout>
  );
}
