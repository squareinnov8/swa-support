/**
 * HubSpot Email Insights Module
 *
 * Provides email import, instruction extraction, KB gap analysis,
 * and eval test case generation from HubSpot emails.
 */

export * from "./types";
export { importHubSpotEmails, getImportStats } from "./importer";
export {
  extractInstructions,
  identifyKBGaps,
  extractEscalationPatterns,
  runAllExtractors,
} from "./extractors";
export {
  generateEvalTestCases,
  getEvalTestCases,
  getEvalStats,
} from "./evalGenerator";
