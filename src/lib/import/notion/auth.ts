/**
 * Notion Authentication
 *
 * Supports two authentication methods:
 * 1. Internal Integration - Simple API token (NOTION_TOKEN)
 * 2. OAuth - For public integrations (NOTION_CLIENT_ID, etc.)
 *
 * For one-time imports, internal integration is recommended.
 */

import { Client } from "@notionhq/client";

/**
 * Notion OAuth configuration (for public integrations)
 */
export type NotionOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Notion OAuth token response
 */
export type NotionTokenResponse = {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner?: {
    type: string;
    user?: {
      id: string;
      name: string;
      avatar_url?: string;
    };
  };
};

/**
 * Get internal integration token from environment
 */
export function getInternalToken(): string | null {
  return process.env.NOTION_TOKEN ?? null;
}

/**
 * Check if Notion is configured (either internal token or OAuth)
 */
export function isNotionConfigured(): boolean {
  // Internal integration token takes priority
  if (process.env.NOTION_TOKEN) {
    return true;
  }
  // Fall back to OAuth config check
  return Boolean(
    process.env.NOTION_CLIENT_ID &&
      process.env.NOTION_CLIENT_SECRET &&
      process.env.NOTION_REDIRECT_URI
  );
}

/**
 * Check if using internal integration (vs OAuth)
 */
export function isInternalIntegration(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

/**
 * Get OAuth configuration from environment
 */
export function getOAuthConfig(): NotionOAuthConfig {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Notion OAuth configuration. Required: NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(state?: string): string {
  const config = getOAuthConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    owner: "user", // Request user-level access
  });

  if (state) {
    params.set("state", state);
  }

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<NotionTokenResponse> {
  const config = getOAuthConfig();

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  return response.json();
}

/**
 * Create authenticated Notion client
 * If no token provided, uses internal integration token from env
 */
export function createNotionClient(accessToken?: string): Client {
  const token = accessToken ?? getInternalToken();
  if (!token) {
    throw new Error("No Notion token provided and NOTION_TOKEN not set");
  }
  return new Client({
    auth: token,
  });
}

/**
 * Verify access token is valid by fetching user info
 */
export async function verifyToken(accessToken: string): Promise<boolean> {
  try {
    const client = createNotionClient(accessToken);
    await client.users.me({});
    return true;
  } catch {
    return false;
  }
}

/**
 * Get workspace info from token
 */
export async function getWorkspaceInfo(
  accessToken: string
): Promise<{ workspaceId: string; workspaceName: string } | null> {
  try {
    const client = createNotionClient(accessToken);
    const user = await client.users.me({});

    // The workspace info comes from the OAuth response, but we can
    // also get some info from the user endpoint
    return {
      workspaceId: user.id, // Bot ID in this context
      workspaceName: user.name ?? "Unknown Workspace",
    };
  } catch {
    return null;
  }
}
