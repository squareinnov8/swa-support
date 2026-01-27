'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DocsNavigation } from './DocsNavigation';
import { headerNavigation } from '@/data/navigation';

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="docs-wrapper">
      {/* Header */}
      <header className="docs-header">
        <Link href="/" className="docs-header-logo">
          <span className="docs-header-logo-mark">L</span>
          <span>Lina</span>
        </Link>

        <nav className="docs-header-nav">
          {headerNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`docs-header-link ${pathname === item.href ? 'active' : ''}`}
            >
              {item.title}
            </Link>
          ))}
          <Link href="/admin" className="docs-header-cta">
            Admin Dashboard
          </Link>
        </nav>
      </header>

      {/* Main Layout */}
      <div className="docs-layout" style={{ paddingTop: 'var(--docs-header-height)' }}>
        {/* Sidebar */}
        <DocsNavigation />

        {/* Content */}
        <main className="docs-content">
          <div className="docs-content-inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
