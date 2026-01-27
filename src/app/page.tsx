import Link from 'next/link';
import { MetricCard } from '@/components/docs/MetricCard';
import { FeatureGrid } from '@/components/docs/FeatureCard';
import { heroMetrics, featureHighlights } from '@/data/metrics';
import { features } from '@/data/features';
import { integrations } from '@/data/integrations';

export default function Home() {
  const featuredFeatures = features.slice(0, 6);

  return (
    <div>
      {/* Header */}
      <header className="docs-header">
        <Link href="/" className="docs-header-logo">
          <span className="docs-header-logo-mark">L</span>
          <span>Lina</span>
        </Link>

        <nav className="docs-header-nav">
          <Link href="/docs/features" className="docs-header-link">
            Features
          </Link>
          <Link href="/docs/integrations" className="docs-header-link">
            Integrations
          </Link>
          <Link href="/docs" className="docs-header-link">
            Documentation
          </Link>
          <Link href="/admin" className="docs-header-cta">
            Admin Dashboard
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero" style={{ marginTop: 'var(--docs-header-height)' }}>
        <h1 className="hero-title">
          AI-Powered Customer Support<br />for SquareWheels Auto
        </h1>
        <p className="hero-subtitle">
          Lina monitors your inbox, classifies customer intents, retrieves knowledge,
          and drafts responses - all in real-time with minimal human intervention.
        </p>
        <div className="hero-cta">
          <Link href="/docs" className="hero-btn-primary">
            Read the Docs
          </Link>
          <Link href="/admin" className="hero-btn-secondary">
            Go to Dashboard
          </Link>
        </div>
      </section>

      {/* Metrics Section */}
      <section className="landing-section" style={{ background: 'var(--hs-bg-white)' }}>
        <h2 className="landing-section-title">Performance at a Glance</h2>
        <p className="landing-section-subtitle">
          Real-time metrics showing Lina&apos;s impact on customer support operations
        </p>
        <div className="metric-grid">
          {heroMetrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="landing-section">
        <h2 className="landing-section-title">Why Lina?</h2>
        <p className="landing-section-subtitle">
          Key capabilities that make Lina an effective support agent
        </p>
        <div className="feature-grid">
          {featureHighlights.map((highlight, index) => (
            <div key={index} className="feature-card" style={{ cursor: 'default' }}>
              <div
                className="feature-card-icon"
                style={{
                  fontSize: '16px',
                  fontWeight: '700',
                  color: 'var(--hs-accent)'
                }}
              >
                {highlight.metric}
              </div>
              <h3 className="feature-card-title">{highlight.title}</h3>
              <p className="feature-card-description">{highlight.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-section" style={{ background: 'var(--hs-bg-white)' }}>
        <h2 className="landing-section-title">Core Features</h2>
        <p className="landing-section-subtitle">
          Comprehensive capabilities for automated customer support
        </p>
        <FeatureGrid features={featuredFeatures} />
        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <Link href="/docs/features" className="btn-secondary" style={{ padding: '12px 24px' }}>
            View All Features
          </Link>
        </div>
      </section>

      {/* Integrations Section */}
      <section className="landing-section">
        <h2 className="landing-section-title">Integrations</h2>
        <p className="landing-section-subtitle">
          Connect with your existing tools and workflows
        </p>
        <div className="integration-grid">
          {integrations.map((integration) => (
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

      {/* CTA Section */}
      <section
        className="landing-section"
        style={{
          background: 'var(--hs-bg-dark)',
          color: 'white',
          textAlign: 'center',
          maxWidth: '100%',
          margin: 0,
          padding: '80px 24px'
        }}
      >
        <h2 style={{ color: 'white', marginBottom: '16px', fontSize: '32px' }}>
          Ready to get started?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '32px', maxWidth: '500px', margin: '0 auto 32px' }}>
          Explore the documentation to learn how Lina can transform your customer support operations.
        </p>
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
          <Link href="/docs" className="hero-btn-primary">
            Read Documentation
          </Link>
          <Link href="/admin" className="hero-btn-secondary">
            Access Dashboard
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: 'var(--hs-bg-darker)',
          color: 'rgba(255,255,255,0.6)',
          padding: '32px 24px',
          textAlign: 'center',
          fontSize: '14px'
        }}
      >
        <p>
          Lina - AI Support Agent for SquareWheels Auto
        </p>
        <p style={{ marginTop: '8px' }}>
          <Link href="/docs" style={{ color: 'rgba(255,255,255,0.6)' }}>Documentation</Link>
          {' · '}
          <Link href="/admin" style={{ color: 'rgba(255,255,255,0.6)' }}>Admin Dashboard</Link>
        </p>
      </footer>
    </div>
  );
}
