'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { docsNavigation } from '@/data/navigation';

export function DocsNavigation() {
  const pathname = usePathname();

  return (
    <aside className="docs-sidebar">
      <nav className="docs-sidebar-nav">
        {docsNavigation.map((section) => (
          <div key={section.title} className="docs-sidebar-section">
            <div className="docs-sidebar-title">{section.title}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`docs-sidebar-link ${
                  pathname === item.href ||
                  (item.href !== '/docs' && pathname.startsWith(item.href))
                    ? 'active'
                    : ''
                }`}
              >
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
