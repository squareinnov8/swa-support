/**
 * Sitemap Parser
 *
 * Fetch and parse sitemap.xml to discover URLs for import.
 * Handles both regular sitemaps and sitemap indexes.
 */

import axios from "axios";
import * as cheerio from "cheerio";

const FETCH_TIMEOUT = 15000; // 15 seconds

/**
 * Parse a sitemap URL and return all page URLs
 * Handles sitemap indexes (nested sitemaps) recursively
 */
export async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const response = await axios.get(sitemapUrl, {
      timeout: FETCH_TIMEOUT,
      headers: {
        "User-Agent": "SWA-Support-KB-Import/1.0",
      },
    });

    const $ = cheerio.load(response.data, { xmlMode: true });

    // Check if this is a sitemap index (contains <sitemap> elements)
    const sitemapElements = $("sitemap loc");
    if (sitemapElements.length > 0) {
      // This is a sitemap index - recursively fetch each sitemap
      const nestedUrls: string[] = [];
      const sitemapUrls: string[] = [];

      sitemapElements.each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) sitemapUrls.push(loc);
      });

      // Fetch nested sitemaps (limit to 10 to prevent runaway recursion)
      for (const url of sitemapUrls.slice(0, 10)) {
        try {
          const urls = await parseSitemap(url);
          nestedUrls.push(...urls);
        } catch (err) {
          console.error(`Failed to parse nested sitemap ${url}:`, err);
        }
      }

      return nestedUrls;
    }

    // Regular sitemap - extract <url><loc> elements
    const urls: string[] = [];
    $("url loc").each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });

    return urls;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to fetch sitemap from ${sitemapUrl}: ${message}`);
  }
}

/**
 * Filter URLs based on exclude patterns
 */
export function filterUrls(
  urls: string[],
  excludePatterns: string[] = []
): string[] {
  if (excludePatterns.length === 0) return urls;

  return urls.filter((url) => {
    // Check if URL matches any exclude pattern
    for (const pattern of excludePatterns) {
      if (url.includes(pattern)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Default exclude patterns for e-commerce/marketing sites
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  "/cart",
  "/checkout",
  "/account",
  "/login",
  "/register",
  "/password",
  "/wishlist",
  "/search",
  "/collections/",
  "/products?",
  "?variant=",
  "?utm_",
  "/cdn-cgi/",
];
