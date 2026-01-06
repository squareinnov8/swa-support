/**
 * Website Page Fetcher
 *
 * Fetch HTML pages and extract clean content for KB import.
 */

import axios from "axios";
import * as cheerio from "cheerio";

const FETCH_TIMEOUT = 10000; // 10 seconds
const RATE_LIMIT_MS = 500; // 500ms between requests

/**
 * Extracted page content
 */
export type PageContent = {
  url: string;
  title: string;
  body: string;
  wordCount: number;
  error?: string;
};

/**
 * Default content selectors (tried in order)
 */
const DEFAULT_CONTENT_SELECTORS = [
  "main",
  "article",
  ".content",
  "#content",
  ".main-content",
  "#main-content",
  ".page-content",
  ".entry-content",
  '[role="main"]',
];

/**
 * Elements to remove from content
 */
const ELEMENTS_TO_REMOVE = [
  "nav",
  "header",
  "footer",
  ".nav",
  ".navigation",
  ".menu",
  ".sidebar",
  ".footer",
  ".header",
  "script",
  "style",
  "noscript",
  "iframe",
  ".social-share",
  ".share-buttons",
  ".comments",
  ".related-posts",
  ".advertisement",
  ".ad",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
];

/**
 * Fetch a single page and extract content
 */
export async function fetchPage(
  url: string,
  contentSelector?: string
): Promise<PageContent> {
  try {
    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        "User-Agent": "SWA-Support-KB-Import/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 3,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract title
    const title = extractTitle($);

    // Extract body content
    const body = extractContent($, contentSelector);

    // Count words
    const wordCount = countWords(body);

    return {
      url,
      title,
      body,
      wordCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      url,
      title: "",
      body: "",
      wordCount: 0,
      error: message,
    };
  }
}

/**
 * Extract page title from various sources
 */
function extractTitle($: cheerio.CheerioAPI): string {
  // Try h1 first (most specific)
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;

  // Try og:title meta tag
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  if (ogTitle) return ogTitle;

  // Fall back to <title> tag
  const title = $("title").text().trim();
  if (title) {
    // Remove site name suffix if present (e.g., "Page Title | Site Name")
    const parts = title.split(/\s*[|\-–]\s*/);
    return parts[0].trim();
  }

  return "Untitled";
}

/**
 * Extract main content from page
 */
function extractContent($: cheerio.CheerioAPI, customSelector?: string): string {
  // Remove unwanted elements first
  ELEMENTS_TO_REMOVE.forEach((selector) => {
    $(selector).remove();
  });

  // Try custom selector first if provided
  if (customSelector) {
    const customContent = $(customSelector).text();
    if (customContent.trim()) {
      return cleanText(customContent);
    }
  }

  // Try default selectors in order
  for (const selector of DEFAULT_CONTENT_SELECTORS) {
    const content = $(selector).text();
    if (content.trim().length > 100) {
      return cleanText(content);
    }
  }

  // Fall back to body content
  const bodyContent = $("body").text();
  return cleanText(bodyContent);
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return (
    text
      // Replace multiple whitespace/newlines with single space
      .replace(/\s+/g, " ")
      // Remove leading/trailing whitespace
      .trim()
      // Remove common boilerplate phrases
      .replace(/Skip to content/gi, "")
      .replace(/Back to top/gi, "")
      .replace(/Read more/gi, "")
      .replace(/Cookie (policy|consent|settings)/gi, "")
      .trim()
  );
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Fetch multiple pages with rate limiting
 */
export async function fetchPages(
  urls: string[],
  contentSelector?: string,
  onProgress?: (current: number, total: number, url: string) => void
): Promise<PageContent[]> {
  const results: PageContent[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    if (onProgress) {
      onProgress(i + 1, urls.length, url);
    }

    const content = await fetchPage(url, contentSelector);
    results.push(content);

    // Rate limiting - wait before next request
    if (i < urls.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return results;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Filter out pages with insufficient content
 */
export function filterValidPages(
  pages: PageContent[],
  minWordCount = 50
): PageContent[] {
  return pages.filter((page) => {
    if (page.error) return false;
    if (!page.title || page.title === "Untitled") return false;
    if (page.wordCount < minWordCount) return false;
    return true;
  });
}
