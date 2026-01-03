/**
 * Notion Page Fetcher
 *
 * Fetches pages and databases from a connected Notion workspace.
 * Note: Uses SDK v5.x which has a different API structure than v2.x
 */

import { Client } from "@notionhq/client";
import type {
  PageObjectResponse,
  SearchResponse,
  BlockObjectResponse,
  PartialBlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { createNotionClient } from "./auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Notion page with content
 */
export type NotionPage = {
  id: string;
  url: string;
  title: string;
  createdTime: string;
  lastEditedTime: string;
  parentType: "database" | "page" | "workspace";
  parentId: string | null;
  properties: Record<string, unknown>;
  blocks: Array<BlockObjectResponse | PartialBlockObjectResponse>;
};

/**
 * Notion database info
 */
export type NotionDatabase = {
  id: string;
  url: string;
  title: string;
  description: string;
  createdTime: string;
  lastEditedTime: string;
  properties: Record<string, unknown>;
};

/**
 * Search results from Notion
 */
export type NotionSearchResult = {
  pages: NotionPage[];
  databases: NotionDatabase[];
  hasMore: boolean;
  nextCursor: string | null;
};

/**
 * Fetch all accessible pages from workspace
 */
export async function searchPages(
  accessToken: string,
  options: {
    query?: string;
    pageSize?: number;
    cursor?: string;
    filter?: "page" | "database";
  } = {}
): Promise<NotionSearchResult> {
  const client = createNotionClient(accessToken);
  const { query, pageSize = 100, cursor, filter } = options;

  // Build search parameters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchParams: any = {
    page_size: pageSize,
  };

  if (query) {
    searchParams.query = query;
  }
  if (cursor) {
    searchParams.start_cursor = cursor;
  }
  if (filter) {
    searchParams.filter = { property: "object", value: filter };
  }

  const response: SearchResponse = await client.search(searchParams);

  const pages: NotionPage[] = [];
  const databases: NotionDatabase[] = [];

  for (const result of response.results) {
    if (result.object === "page" && "properties" in result) {
      const page = result as PageObjectResponse;
      pages.push({
        id: page.id,
        url: page.url,
        title: extractPageTitle(page),
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        parentType: getParentType(page.parent),
        parentId: getParentId(page.parent),
        properties: page.properties,
        blocks: [], // Fetched separately
      });
    } else if ("title" in result && (result as any).object === "database") {
      const db = result as any;
      databases.push({
        id: db.id,
        url: db.url,
        title: db.title?.map((t: any) => t.plain_text).join("") ?? "",
        description: db.description?.map((d: any) => d.plain_text).join("") ?? "",
        createdTime: db.created_time,
        lastEditedTime: db.last_edited_time,
        properties: db.properties ?? {},
      });
    }
  }

  return {
    pages,
    databases,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}

/**
 * Fetch all pages from workspace (handles pagination)
 */
export async function fetchAllPages(
  accessToken: string,
  options: { maxPages?: number; includeContent?: boolean } = {}
): Promise<NotionPage[]> {
  const { maxPages = 1000, includeContent = true } = options;
  const allPages: NotionPage[] = [];
  let cursor: string | null = null;

  while (allPages.length < maxPages) {
    const result = await searchPages(accessToken, {
      filter: "page",
      cursor: cursor ?? undefined,
    });

    allPages.push(...result.pages);

    if (!result.hasMore || !result.nextCursor) {
      break;
    }
    cursor = result.nextCursor;
  }

  // Optionally fetch content for each page
  if (includeContent) {
    const client = createNotionClient(accessToken);
    for (const page of allPages.slice(0, maxPages)) {
      try {
        page.blocks = await fetchPageBlocks(client, page.id);
      } catch (err) {
        console.warn(`Failed to fetch blocks for page ${page.id}:`, err);
        page.blocks = [];
      }
    }
  }

  return allPages.slice(0, maxPages);
}

/**
 * Fetch pages from a specific database
 * Note: SDK v5.x uses dataSources.query() instead of databases.query()
 */
export async function fetchDatabasePages(
  accessToken: string,
  databaseId: string,
  options: { maxPages?: number; includeContent?: boolean } = {}
): Promise<NotionPage[]> {
  const { maxPages = 1000, includeContent = true } = options;
  const client = createNotionClient(accessToken);
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  while (pages.length < maxPages) {
    // SDK v5.x uses dataSources.query() instead of databases.query()
    const response = await client.dataSources.query({
      data_source_id: databaseId,
      page_size: 100,
      start_cursor: cursor,
    } as any);

    for (const result of response.results) {
      if ("properties" in result) {
        const page = result as PageObjectResponse;
        pages.push({
          id: page.id,
          url: page.url,
          title: extractPageTitle(page),
          createdTime: page.created_time,
          lastEditedTime: page.last_edited_time,
          parentType: "database",
          parentId: databaseId,
          properties: page.properties,
          blocks: [],
        });
      }
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }
    cursor = response.next_cursor;
  }

  // Fetch content for each page
  if (includeContent) {
    for (const page of pages.slice(0, maxPages)) {
      try {
        page.blocks = await fetchPageBlocks(client, page.id);
      } catch (err) {
        console.warn(`Failed to fetch blocks for page ${page.id}:`, err);
        page.blocks = [];
      }
    }
  }

  return pages.slice(0, maxPages);
}

/**
 * Fetch a single page with content
 */
export async function fetchPage(
  accessToken: string,
  pageId: string
): Promise<NotionPage | null> {
  const client = createNotionClient(accessToken);

  try {
    const page = (await client.pages.retrieve({
      page_id: pageId,
    })) as PageObjectResponse;

    const blocks = await fetchPageBlocks(client, pageId);

    return {
      id: page.id,
      url: page.url,
      title: extractPageTitle(page),
      createdTime: page.created_time,
      lastEditedTime: page.last_edited_time,
      parentType: getParentType(page.parent),
      parentId: getParentId(page.parent),
      properties: page.properties,
      blocks,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all blocks for a page (including nested children)
 */
async function fetchPageBlocks(
  client: Client,
  pageId: string
): Promise<Array<BlockObjectResponse | PartialBlockObjectResponse>> {
  const blocks: Array<BlockObjectResponse | PartialBlockObjectResponse> = [];
  let cursor: string | undefined;

  while (true) {
    const response = await client.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor,
    });

    blocks.push(...response.results);

    // Recursively fetch children for blocks that have them
    for (const block of response.results) {
      if ("has_children" in block && block.has_children) {
        const children = await fetchPageBlocks(client, block.id);
        // Attach children to parent block for later processing
        (block as BlockObjectResponse & { children?: typeof children }).children = children;
      }
    }

    if (!response.has_more || !response.next_cursor) {
      break;
    }
    cursor = response.next_cursor;
  }

  return blocks;
}

/**
 * Extract title from page properties
 */
function extractPageTitle(page: PageObjectResponse): string {
  // Try common title property names
  const titleProps = ["title", "Title", "Name", "name"];

  for (const propName of titleProps) {
    const prop = page.properties[propName];
    if (prop && prop.type === "title" && "title" in prop) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }

  // Fallback: find any title property
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title" && "title" in prop) {
      return prop.title.map((t) => t.plain_text).join("");
    }
  }

  return "Untitled";
}

/**
 * Get parent type from Notion parent object
 */
function getParentType(
  parent: PageObjectResponse["parent"]
): "database" | "page" | "workspace" {
  if ("database_id" in parent) return "database";
  if ("page_id" in parent) return "page";
  return "workspace";
}

/**
 * Get parent ID from Notion parent object
 */
function getParentId(parent: PageObjectResponse["parent"]): string | null {
  if ("database_id" in parent) return parent.database_id;
  if ("page_id" in parent) return parent.page_id;
  return null;
}
