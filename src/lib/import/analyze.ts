/**
 * LLM Document Analysis
 *
 * Uses OpenAI GPT to analyze documents for categorization,
 * intent tagging, and quality assessment.
 */

import { generate, isLLMConfigured } from "@/lib/llm/client";
import { getAllCategories } from "@/lib/kb/categories";
import { INTENTS, type Intent } from "@/lib/intents/taxonomy";
import { COMMON_VEHICLE_TAGS, COMMON_PRODUCT_TAGS } from "@/lib/kb/types";
import type { LLMAnalysisResult, GmailExtractionResult } from "./types";
import { calculateConfidence } from "./confidence";

/**
 * Analyze a document for KB categorization
 */
export async function analyzeDocument(
  title: string,
  content: string
): Promise<{ analysis: LLMAnalysisResult; confidence: number }> {
  if (!isLLMConfigured()) {
    throw new Error("LLM not configured - OPENAI_API_KEY required");
  }

  // Get available categories for the prompt
  const categories = await getAllCategories();
  const categoriesList = categories
    .map((c) => `- ${c.slug}: ${c.name}${c.description ? ` - ${c.description}` : ""}`)
    .join("\n");

  // Build intent list
  const intentsList = INTENTS.map((i) => `- ${i}`).join("\n");

  // Build vehicle/product lists
  const vehiclesList = COMMON_VEHICLE_TAGS.join(", ");
  const productsList = COMMON_PRODUCT_TAGS.join(", ");

  const prompt = buildAnalysisPrompt({
    title,
    content,
    categoriesList,
    intentsList,
    vehiclesList,
    productsList,
  });

  const result = await generate(prompt, {
    systemPrompt: ANALYSIS_SYSTEM_PROMPT,
    temperature: 0.3, // Lower temperature for more consistent analysis
    maxTokens: 1000,
  });

  // Parse JSON response
  const analysis = parseAnalysisResponse(result.content);

  // Calculate confidence
  const confidence = calculateConfidence(analysis);

  return { analysis, confidence };
}

/**
 * Extract resolution from a Gmail thread
 */
export async function extractGmailResolution(
  threadMessages: string
): Promise<GmailExtractionResult> {
  if (!isLLMConfigured()) {
    throw new Error("LLM not configured - OPENAI_API_KEY required");
  }

  const prompt = buildExtractionPrompt(threadMessages);

  const result = await generate(prompt, {
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    temperature: 0.3,
    maxTokens: 1500,
  });

  return parseExtractionResponse(result.content);
}

/**
 * System prompt for document analysis
 */
const ANALYSIS_SYSTEM_PROMPT = `You are a knowledge base curator for a hardware company (SquareWheels) that makes automotive tuning products like APEX.

Your task is to analyze documents and determine:
1. What category they belong to
2. What customer intents they address
3. What vehicles/products they apply to
4. Whether the content is high-quality KB material

Be conservative with confidence scores - only give high scores when you're certain.
Quality criteria: Is it actionable? Does it answer customer questions? Is it complete?

Always respond with valid JSON only, no markdown or explanation.`;

/**
 * System prompt for Gmail extraction
 */
const EXTRACTION_SYSTEM_PROMPT = `You are extracting knowledge base articles from resolved support email threads.

Your task is to:
1. Identify what the customer was asking about
2. Extract the resolution/answer that was provided
3. Create a clean KB article from the resolution

IMPORTANT RULES:
- Remove ALL personal information (names, emails, order numbers, addresses)
- Remove email signatures and footers
- Remove pleasantries and small talk
- Keep only the actionable, technical information
- If the thread isn't resolved, mark is_resolved as false

Always respond with valid JSON only, no markdown or explanation.`;

/**
 * Build analysis prompt
 */
function buildAnalysisPrompt(params: {
  title: string;
  content: string;
  categoriesList: string;
  intentsList: string;
  vehiclesList: string;
  productsList: string;
}): string {
  const { title, content, categoriesList, intentsList, vehiclesList, productsList } = params;

  // Truncate content if too long
  const maxContentLength = 4000;
  const truncatedContent =
    content.length > maxContentLength
      ? content.slice(0, maxContentLength) + "\n\n[Content truncated...]"
      : content;

  return `Analyze this document for our support knowledge base.

## Document:
Title: ${title}
Content:
${truncatedContent}

## Available Categories (use slug value):
${categoriesList}

## Available Intent Tags:
${intentsList}

## Common Vehicle Tags: ${vehiclesList}
## Common Product Tags: ${productsList}

## Task:
Return JSON with your analysis:
{
  "suggested_category": "category_slug or null if uncertain",
  "category_confidence": 0.0-1.0,
  "intent_tags": ["INTENT1", "INTENT2"],
  "vehicle_tags": ["Vehicle Name"] or [],
  "product_tags": ["Product Name"] or [],
  "content_quality": 0.0-1.0,
  "quality_issues": ["issue1", "issue2"] or [],
  "summary": "One sentence summary"
}

## Quality Criteria:
- Is it actionable support content? (not internal notes, drafts, meeting notes)
- Does it answer a customer question or provide useful information?
- Is it complete enough to be useful standalone?
- Would it help resolve a support ticket?
- Is it written clearly and professionally?`;
}

/**
 * Build Gmail extraction prompt
 */
function buildExtractionPrompt(threadMessages: string): string {
  // Truncate if too long
  const maxLength = 6000;
  const truncated =
    threadMessages.length > maxLength
      ? threadMessages.slice(0, maxLength) + "\n\n[Thread truncated...]"
      : threadMessages;

  return `Extract the resolution from this support email thread.

## Thread:
${truncated}

## Task:
1. Identify the customer's question/issue
2. Find the resolution/answer provided by support
3. Create a clean KB article from the resolution

Return JSON:
{
  "customer_issue": "Brief description of the problem (1-2 sentences)",
  "resolution": "The answer/solution provided (can be longer)",
  "is_resolved": true/false,
  "kb_title": "Suggested KB article title (clear and searchable)",
  "kb_body": "Clean KB article content (no PII, no signatures, just the helpful info)",
  "confidence": 0.0-1.0
}

## Rules:
- Remove ALL personal information (names, emails, order numbers)
- Remove email signatures and footers
- Remove "Hi [name]" greetings and "Thanks" closings
- Keep only the actionable resolution
- If thread is not resolved or unclear, set is_resolved: false
- confidence should be lower if the resolution is ambiguous or incomplete`;
}

/**
 * Parse analysis response from LLM
 */
function parseAnalysisResponse(response: string): LLMAnalysisResult {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize
    return {
      suggested_category: parsed.suggested_category || null,
      category_confidence: clamp(parsed.category_confidence ?? 0, 0, 1),
      intent_tags: validateIntentTags(parsed.intent_tags || []),
      vehicle_tags: Array.isArray(parsed.vehicle_tags) ? parsed.vehicle_tags : [],
      product_tags: Array.isArray(parsed.product_tags) ? parsed.product_tags : [],
      content_quality: clamp(parsed.content_quality ?? 0, 0, 1),
      quality_issues: Array.isArray(parsed.quality_issues) ? parsed.quality_issues : [],
      summary: parsed.summary || "No summary provided",
    };
  } catch (err) {
    console.error("Failed to parse LLM analysis response:", err);
    // Return default low-confidence result
    return {
      suggested_category: null,
      category_confidence: 0,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0.5,
      quality_issues: ["Failed to parse LLM response"],
      summary: "Analysis failed",
    };
  }
}

/**
 * Parse extraction response from LLM
 */
function parseExtractionResponse(response: string): GmailExtractionResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      customer_issue: parsed.customer_issue || "Unknown issue",
      resolution: parsed.resolution || "",
      is_resolved: Boolean(parsed.is_resolved),
      kb_title: parsed.kb_title || "Untitled",
      kb_body: parsed.kb_body || "",
      confidence: clamp(parsed.confidence ?? 0, 0, 1),
    };
  } catch (err) {
    console.error("Failed to parse extraction response:", err);
    return {
      customer_issue: "Failed to extract",
      resolution: "",
      is_resolved: false,
      kb_title: "Extraction Failed",
      kb_body: "",
      confidence: 0,
    };
  }
}

/**
 * Validate intent tags against known static intents
 */
function validateIntentTags(tags: unknown[]): Intent[] {
  if (!Array.isArray(tags)) return [];

  return tags.filter((tag): tag is Intent =>
    typeof tag === "string" && (INTENTS as readonly string[]).includes(tag)
  );
}

/**
 * Clamp value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Batch analyze multiple documents
 * With rate limiting to avoid API throttling
 */
export async function batchAnalyze(
  documents: Array<{ title: string; content: string }>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<Array<{ analysis: LLMAnalysisResult; confidence: number; error?: string }>> {
  const { concurrency = 2, delayMs = 500 } = options;
  const results: Array<{ analysis: LLMAnalysisResult; confidence: number; error?: string }> = [];

  // Process in batches
  for (let i = 0; i < documents.length; i += concurrency) {
    const batch = documents.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (doc) => {
        try {
          return await analyzeDocument(doc.title, doc.content);
        } catch (err) {
          const error = err instanceof Error ? err.message : "Unknown error";
          return {
            analysis: {
              suggested_category: null,
              category_confidence: 0,
              intent_tags: [] as Intent[],
              vehicle_tags: [] as string[],
              product_tags: [] as string[],
              content_quality: 0,
              quality_issues: [error],
              summary: "Analysis failed",
            },
            confidence: 0,
            error,
          };
        }
      })
    );

    results.push(...batchResults);

    // Delay between batches
    if (i + concurrency < documents.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
