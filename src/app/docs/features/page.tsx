import { DocsLayout } from '@/components/docs/DocsLayout';
import { FeatureGrid } from '@/components/docs/FeatureCard';
import { Breadcrumbs } from '@/components/docs/Breadcrumbs';
import { features, featuresByCategory } from '@/data/features';

export const metadata = {
  title: 'Features - Lina Documentation',
  description: 'Explore all features of Lina, the AI-powered customer support agent.'
};

export default function FeaturesPage() {
  return (
    <DocsLayout>
      <div className="docs-content">
        <Breadcrumbs
          items={[
            { label: 'Docs', href: '/docs' },
            { label: 'Features' }
          ]}
        />

        <h1>Features</h1>
        <p className="docs-lead">
          Lina includes {features.length} features organized into four categories:
          core functionality, automation, collaboration, and safety.
        </p>

        <h2 id="core-features">Core Features</h2>
        <p>
          Essential capabilities that power Lina&apos;s support operations.
        </p>
        <FeatureGrid features={featuresByCategory.core} />

        <h2 id="automation">Automation</h2>
        <p>
          Features that reduce manual work and speed up support operations.
        </p>
        <FeatureGrid features={featuresByCategory.automation} />

        <h2 id="collaboration">Collaboration</h2>
        <p>
          Tools for human-AI collaboration and continuous improvement.
        </p>
        <FeatureGrid features={featuresByCategory.collaboration} />

        <h2 id="safety">Safety & Compliance</h2>
        <p>
          Guardrails ensuring safe and compliant responses.
        </p>
        <FeatureGrid features={featuresByCategory.safety} />
      </div>
    </DocsLayout>
  );
}
