/**
 * Notion to Markdown Conversion
 *
 * Converts Notion page blocks to clean markdown
 * for KB document storage.
 */

import { NotionToMarkdown } from "notion-to-md";
import { createNotionClient } from "./auth";
import type { NotionPage } from "./fetcher";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";

/**
 * Converted markdown document
 */
export type MarkdownDocument = {
  pageId: string;
  title: string;
  markdown: string;
  sourceUrl: string;
  metadata: {
    createdTime: string;
    lastEditedTime: string;
    parentType: string;
    wordCount: number;
  };
};

/**
 * Convert a Notion page to markdown
 */
export async function pageToMarkdown(
  accessToken: string,
  pageId: string
): Promise<MarkdownDocument | null> {
  const client = createNotionClient(accessToken);
  const n2m = new NotionToMarkdown({ notionClient: client });

  try {
    // Fetch page metadata
    const page = await client.pages.retrieve({ page_id: pageId });
    if (!("properties" in page)) {
      return null;
    }

    // Convert blocks to markdown
    const mdBlocks = await n2m.pageToMarkdown(pageId);
    const markdown = n2m.toMarkdownString(mdBlocks).parent;

    // Extract title
    const title = extractTitle(page.properties);

    return {
      pageId,
      title,
      markdown: cleanMarkdown(markdown),
      sourceUrl: page.url,
      metadata: {
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        parentType: getParentType(page.parent),
        wordCount: countWords(markdown),
      },
    };
  } catch (err) {
    console.error(`Failed to convert page ${pageId} to markdown:`, err);
    return null;
  }
}

/**
 * Convert multiple pages to markdown (with rate limiting)
 */
export async function pagesToMarkdown(
  accessToken: string,
  pageIds: string[],
  options: { delayMs?: number; onProgress?: (current: number, total: number) => void } = {}
): Promise<MarkdownDocument[]> {
  const { delayMs = 200, onProgress } = options;
  const results: MarkdownDocument[] = [];

  for (let i = 0; i < pageIds.length; i++) {
    const result = await pageToMarkdown(accessToken, pageIds[i]);
    if (result) {
      results.push(result);
    }

    onProgress?.(i + 1, pageIds.length);

    // Rate limiting delay
    if (i < pageIds.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Convert NotionPage (with pre-fetched blocks) to markdown
 * More efficient for batch operations where blocks are already fetched
 */
export function notionPageToMarkdown(page: NotionPage): MarkdownDocument {
  const markdown = blocksToMarkdown(page.blocks as BlockObjectResponse[]);

  return {
    pageId: page.id,
    title: page.title,
    markdown: cleanMarkdown(markdown),
    sourceUrl: page.url,
    metadata: {
      createdTime: page.createdTime,
      lastEditedTime: page.lastEditedTime,
      parentType: page.parentType,
      wordCount: countWords(markdown),
    },
  };
}

/**
 * Convert Notion blocks to markdown string
 * Simpler conversion when blocks are already fetched
 */
function blocksToMarkdown(blocks: BlockObjectResponse[], depth: number = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);

  for (const block of blocks) {
    const line = blockToMarkdown(block, depth);
    if (line !== null) {
      lines.push(line);
    }

    // Handle nested children
    const children = (block as BlockObjectResponse & { children?: BlockObjectResponse[] }).children;
    if (children && children.length > 0) {
      lines.push(blocksToMarkdown(children, depth + 1));
    }
  }

  return lines.join("\n");
}

/**
 * Convert a single block to markdown
 */
function blockToMarkdown(block: BlockObjectResponse, depth: number = 0): string | null {
  const indent = "  ".repeat(depth);

  switch (block.type) {
    case "paragraph":
      return indent + richTextToMarkdown(block.paragraph.rich_text);

    case "heading_1":
      return `# ${richTextToMarkdown(block.heading_1.rich_text)}`;

    case "heading_2":
      return `## ${richTextToMarkdown(block.heading_2.rich_text)}`;

    case "heading_3":
      return `### ${richTextToMarkdown(block.heading_3.rich_text)}`;

    case "bulleted_list_item":
      return `${indent}- ${richTextToMarkdown(block.bulleted_list_item.rich_text)}`;

    case "numbered_list_item":
      return `${indent}1. ${richTextToMarkdown(block.numbered_list_item.rich_text)}`;

    case "to_do":
      const checkbox = block.to_do.checked ? "[x]" : "[ ]";
      return `${indent}- ${checkbox} ${richTextToMarkdown(block.to_do.rich_text)}`;

    case "toggle":
      return `${indent}<details>\n${indent}<summary>${richTextToMarkdown(block.toggle.rich_text)}</summary>\n${indent}</details>`;

    case "code":
      const lang = block.code.language || "";
      const code = richTextToMarkdown(block.code.rich_text);
      return `\`\`\`${lang}\n${code}\n\`\`\``;

    case "quote":
      return `> ${richTextToMarkdown(block.quote.rich_text)}`;

    case "callout":
      const icon = block.callout.icon?.type === "emoji" ? block.callout.icon.emoji + " " : "";
      return `> ${icon}${richTextToMarkdown(block.callout.rich_text)}`;

    case "divider":
      return "---";

    case "image":
      const imgUrl =
        block.image.type === "external" ? block.image.external.url : block.image.file.url;
      const caption = block.image.caption.length > 0 ? richTextToMarkdown(block.image.caption) : "";
      return `![${caption}](${imgUrl})`;

    case "video":
      const videoUrl =
        block.video.type === "external" ? block.video.external.url : block.video.file.url;
      return `[Video](${videoUrl})`;

    case "file":
      const fileUrl =
        block.file.type === "external" ? block.file.external.url : block.file.file.url;
      return `[File](${fileUrl})`;

    case "bookmark":
      return `[Bookmark](${block.bookmark.url})`;

    case "link_preview":
      return `[Link](${block.link_preview.url})`;

    case "table":
      // Tables need special handling with their rows
      return null; // Skip for now, handled by notion-to-md

    case "column_list":
    case "column":
      // Column layouts don't translate well to markdown
      return null;

    case "synced_block":
      // Synced blocks would need additional fetching
      return null;

    default:
      return null;
  }
}

/**
 * Convert Notion rich text array to markdown string
 */
function richTextToMarkdown(
  richText: Array<{
    type: string;
    plain_text: string;
    annotations?: {
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      underline?: boolean;
      code?: boolean;
    };
    href?: string | null;
  }>
): string {
  return richText
    .map((text) => {
      let result = text.plain_text;
      const annotations = text.annotations;

      if (annotations) {
        if (annotations.code) {
          result = `\`${result}\``;
        }
        if (annotations.bold) {
          result = `**${result}**`;
        }
        if (annotations.italic) {
          result = `*${result}*`;
        }
        if (annotations.strikethrough) {
          result = `~~${result}~~`;
        }
      }

      if (text.href) {
        result = `[${result}](${text.href})`;
      }

      return result;
    })
    .join("");
}

/**
 * Clean up markdown output
 */
function cleanMarkdown(markdown: string): string {
  return (
    markdown
      // Remove excessive blank lines
      .replace(/\n{3,}/g, "\n\n")
      // Trim whitespace
      .trim()
  );
}

/**
 * Count words in markdown
 */
function countWords(markdown: string): number {
  return markdown
    .replace(/[#*_`\[\]()]/g, "") // Remove markdown syntax
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Extract title from page properties
 */
function extractTitle(properties: Record<string, unknown>): string {
  const titleProps = ["title", "Title", "Name", "name"];

  for (const propName of titleProps) {
    const prop = properties[propName] as {
      type?: string;
      title?: Array<{ plain_text: string }>;
    };
    if (prop?.type === "title" && prop.title) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }

  // Fallback: find any title property
  for (const prop of Object.values(properties)) {
    const typedProp = prop as { type?: string; title?: Array<{ plain_text: string }> };
    if (typedProp?.type === "title" && typedProp.title) {
      return typedProp.title.map((t) => t.plain_text).join("");
    }
  }

  return "Untitled";
}

/**
 * Get parent type string
 */
function getParentType(parent: { type: string }): string {
  return parent.type;
}
