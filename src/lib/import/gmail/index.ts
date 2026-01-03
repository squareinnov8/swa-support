/**
 * Gmail Import Module
 *
 * Exports for importing content from Gmail threads.
 */

// Authentication
export {
  getGmailOAuthConfig,
  isGmailConfigured,
  createOAuth2Client,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  createGmailClient,
  refreshTokenIfNeeded,
  verifyTokens,
  getUserEmail,
  GMAIL_SCOPES,
  type GmailOAuthConfig,
  type GmailTokens,
} from "./auth";

// Fetching
export {
  listThreads,
  fetchThread,
  fetchThreads,
  getLabels,
  formatThreadAsText,
  type GmailThreadSummary,
  type GmailMessage,
  type GmailThread,
  type GmailSearchOptions,
} from "./fetcher";

// Extraction
export {
  extractFromThread,
  extractFromThreads,
  rankExtractions,
  deduplicateExtractions,
  getExtractionStats,
  type ThreadExtractionResult,
} from "./extract";

// Processing
export {
  listGmailCandidates,
  processSelectedThreads,
  runGmailImport,
  previewGmailImport,
  type GmailImportProgress,
  type GmailImportResult,
} from "./process";
