/**
 * Gmail OAuth Authentication
 *
 * Handles OAuth flow for connecting to Gmail.
 * One-time import flow - tokens stored temporarily.
 */

import { google } from "googleapis";

/**
 * Gmail OAuth configuration
 */
export type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Gmail OAuth tokens
 */
export type GmailTokens = {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date?: number;
};

/**
 * Gmail scopes needed for reading messages
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Get OAuth configuration from environment
 */
export function getGmailOAuthConfig(): GmailOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Gmail OAuth configuration. Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

/**
 * Check if Gmail OAuth is configured
 */
export function isGmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Create OAuth2 client
 */
export function createOAuth2Client() {
  const config = getGmailOAuthConfig();
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent", // Force consent to get refresh token
    state,
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GmailTokens> {
  const oauth2Client = createOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Failed to get access token");
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    scope: tokens.scope ?? GMAIL_SCOPES.join(" "),
    token_type: tokens.token_type ?? "Bearer",
    expiry_date: tokens.expiry_date ?? undefined,
  };
}

/**
 * Create authenticated Gmail API client
 */
export function createGmailClient(tokens: GmailTokens) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);

  return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Refresh access token if expired
 */
export async function refreshTokenIfNeeded(tokens: GmailTokens): Promise<GmailTokens> {
  if (!tokens.expiry_date) {
    return tokens;
  }

  // Refresh 5 minutes before expiry
  const shouldRefresh = Date.now() > tokens.expiry_date - 5 * 60 * 1000;

  if (!shouldRefresh || !tokens.refresh_token) {
    return tokens;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);

  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    access_token: credentials.access_token ?? tokens.access_token,
    refresh_token: credentials.refresh_token ?? tokens.refresh_token,
    scope: credentials.scope ?? tokens.scope,
    token_type: credentials.token_type ?? tokens.token_type,
    expiry_date: credentials.expiry_date ?? tokens.expiry_date,
  };
}

/**
 * Verify tokens are valid by making a test API call
 */
export async function verifyTokens(tokens: GmailTokens): Promise<boolean> {
  try {
    const gmail = createGmailClient(tokens);
    await gmail.users.getProfile({ userId: "me" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get user's email address from tokens
 */
export async function getUserEmail(tokens: GmailTokens): Promise<string | null> {
  try {
    const gmail = createGmailClient(tokens);
    const profile = await gmail.users.getProfile({ userId: "me" });
    return profile.data.emailAddress ?? null;
  } catch {
    return null;
  }
}
