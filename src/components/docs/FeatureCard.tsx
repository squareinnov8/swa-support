import Link from 'next/link';
import type { Feature } from '@/data/features';

interface FeatureCardProps {
  feature: Feature;
}

export function FeatureCard({ feature }: FeatureCardProps) {
  return (
    <Link href={`/docs/features/${feature.slug}`} className="feature-card">
      <div className="feature-card-icon">{feature.icon}</div>
      <h3 className="feature-card-title">{feature.title}</h3>
      <p className="feature-card-description">{feature.shortDescription}</p>
      <span className="feature-card-link">
        Learn more
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 12L10 8L6 4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}

interface FeatureGridProps {
  features: Feature[];
}

export function FeatureGrid({ features }: FeatureGridProps) {
  return (
    <div className="feature-grid">
      {features.map((feature) => (
        <FeatureCard key={feature.slug} feature={feature} />
      ))}
    </div>
  );
}
