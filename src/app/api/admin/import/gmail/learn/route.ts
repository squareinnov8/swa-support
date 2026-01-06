/**
 * Gmail Learning Loop API
 *
 * POST: Process inbox emails, classify, check KB, and backfill from threads
 * GET: Get processing status
 *
 * Learning Loop:
 * 1. Fetch unprocessed emails from inbox
 * 2. Classify intent → Check KB → Generate draft
 * 3. If confidence < threshold, fetch full thread
 * 4. Extract resolution from thread via LLM
 * 5. Create KB article from resolution (→ review queue)
 * 6. Mark email as processed
 */

import { NextRequest, NextResponse } from "next/server";
import { createGmailClient, type GmailTokens } from "@/lib/import/gmail";
import { supabase } from "@/lib/db";
import { hybridSearch } from "@/lib/retrieval/search";
import { gmail_v1 } from "googleapis";

const CONFIDENCE_THRESHOLD = 0.7;
const PROCESSED_LABEL = "SupportAgent/Processed";
const KB_EXTRACTED_LABEL = "SupportAgent/KBExtracted";

/**
 * Sanitize text for use in search queries
 * Removes HTML, special chars that break PostgREST queries
 */
function sanitizeForSearch(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ") // Remove HTML tags
    .replace(/[()%_'"\\]/g, " ") // Remove special chars that break ilike
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .slice(0, 200); // Limit length
}

type ExtractedQA = {
  question: string;
  kbTitle: string;
  kbMatchScore: number;
  alreadyInKB: boolean;
  kbArticleId?: string;
  action: "kb_exists" | "kb_extracted" | "skipped";
};

type ProcessResult = {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  threadMessageCount: number;
  threadSummary?: string;
  isResolved: boolean;
  // Q&A extraction results
  qaPairsFound: number;
  qaPairsExtracted: number;
  qaPairsSkipped: number;
  extractedQAs: ExtractedQA[];
  // Legacy fields for backward compatibility
  action: "kb_exists" | "kb_extracted" | "needs_review" | "skipped";
  error?: string;
  reason?: string;
};

/**
 * Get tokens from cookie
 */
function getTokensFromRequest(request: NextRequest): GmailTokens | null {
  const tokensCookie = request.cookies.get("gmail_tokens");
  if (!tokensCookie?.value) return null;

  try {
    return JSON.parse(tokensCookie.value);
  } catch {
    return null;
  }
}

/**
 * Get or create a label
 */
async function getOrCreateLabel(
  gmail: gmail_v1.Gmail,
  labelName: string
): Promise<string> {
  // Check if label exists
  const { data: labels } = await gmail.users.labels.list({ userId: "me" });
  const existing = labels.labels?.find((l) => l.name === labelName);

  if (existing?.id) {
    return existing.id;
  }

  // Create label
  const { data: newLabel } = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });

  return newLabel.id!;
}

/**
 * Parse email headers to get subject and from
 */
function parseHeaders(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined
): { subject: string; from: string; date: string } {
  const getHeader = (name: string) =>
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    subject: getHeader("subject"),
    from: getHeader("from"),
    date: getHeader("date"),
  };
}

/**
 * Get plain text body from message
 */
function getMessageBody(message: gmail_v1.Schema$Message): string {
  const payload = message.payload;

  // Simple plain text
  if (payload?.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Multipart - find text/plain
  const parts = payload?.parts ?? [];
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    // Nested multipart
    if (part.parts) {
      for (const subPart of part.parts) {
        if (subPart.mimeType === "text/plain" && subPart.body?.data) {
          return Buffer.from(subPart.body.data, "base64").toString("utf-8");
        }
      }
    }
  }

  // Fallback to snippet
  return message.snippet ?? "";
}

/**
 * Fetch full thread messages
 */
async function getThreadMessages(
  gmail: gmail_v1.Gmail,
  threadId: string
): Promise<Array<{ from: string; date: string; body: string }>> {
  const { data: thread } = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const messages: Array<{ from: string; date: string; body: string }> = [];

  for (const msg of thread.messages ?? []) {
    const headers = parseHeaders(msg.payload?.headers);
    const body = getMessageBody(msg);
    messages.push({
      from: headers.from,
      date: headers.date,
      body,
    });
  }

  return messages;
}

/**
 * A single Q&A pair extracted from a thread
 */
type QAPair = {
  question: string;
  answer: string;
  kbTitle: string;
  kbBody: string;
  confidence: number;
  alreadyInKB?: boolean;
  kbMatchScore?: number;
};

/**
 * Extract ALL Q&A pairs from thread using LLM
 */
async function extractQAPairsFromThread(
  subject: string,
  messages: Array<{ from: string; date: string; body: string }>
): Promise<{
  qaPairs: QAPair[];
  threadSummary: string;
  isResolved: boolean;
} | null> {
  const threadText = messages
    .map((m, i) => `--- Message ${i + 1} (${m.from}) ---\n${m.body}`)
    .join("\n\n");

  const prompt = `Analyze this support email thread and extract ALL question/answer pairs.

## Subject: ${subject}

## Thread:
${threadText}

## Task:
1. Identify ALL distinct questions or issues raised by the customer throughout the thread
2. For each question, find the corresponding answer from the support team
3. Create a separate KB article for each Q&A pair

Return JSON only (no markdown):
{
  "threadSummary": "Brief summary of the overall thread",
  "isResolved": true/false,
  "qaPairs": [
    {
      "question": "The customer's specific question or issue",
      "answer": "The support team's answer/resolution",
      "kbTitle": "KB article title (as a question customers might ask)",
      "kbBody": "Clean KB article content in markdown format",
      "confidence": 0.0-1.0
    }
  ]
}

## Rules:
- Extract EVERY distinct question that was answered, not just the main one
- A thread may have 1-5+ different Q&A pairs
- Remove all personal information (names, emails, order numbers, addresses)
- Remove email signatures, footers, and greetings
- Each kbBody should be standalone and helpful without context
- kbTitle should be phrased as a question a customer would search for
- Only include Q&A pairs where there's a clear answer (confidence > 0.5)
- If a question wasn't answered, don't include it
- Combine related follow-up questions into single comprehensive Q&A pairs`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You analyze support threads and extract all Q&A pairs to create KB articles. Return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("Failed to extract Q&A pairs:", err);
    return null;
  }
}

/**
 * Check if a Q&A pair is already covered by KB
 */
async function checkKBCoverage(qaPair: QAPair): Promise<{ covered: boolean; score: number }> {
  const searchQuery = sanitizeForSearch(`${qaPair.kbTitle} ${qaPair.question}`);

  try {
    const results = await hybridSearch(
      { query: searchQuery },
      { limit: 3 }
    );

    const topScore = results.length > 0 && typeof results[0].score === 'number'
      ? results[0].score
      : 0;

    return {
      covered: topScore >= CONFIDENCE_THRESHOLD,
      score: topScore,
    };
  } catch {
    // If search fails, assume not covered
    return { covered: false, score: 0 };
  }
}

/**
 * Create KB article in review queue
 */
async function createProposedKBArticle(
  extraction: {
    kbTitle: string;
    kbBody: string;
    customerIssue: string;
    confidence: number;
  },
  threadId: string,
  jobId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("kb_proposed_docs")
    .insert({
      import_job_id: jobId,
      source: "gmail",
      source_id: threadId,
      title: extraction.kbTitle,
      body: extraction.kbBody,
      categorization_confidence: extraction.confidence,
      content_quality_score: extraction.confidence,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create proposed KB article:", error);
    return null;
  }

  return data.id;
}

/**
 * POST: Process inbox emails through learning loop
 */
export async function POST(request: NextRequest) {
  const tokens = getTokensFromRequest(request);
  if (!tokens) {
    return NextResponse.json(
      { error: "Not authenticated. Please connect Gmail first." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const batchSize = body.batch_size ?? 10;
    const query = body.query ?? "in:inbox category:primary";
    const reprocess = body.reprocess ?? false; // Allow re-processing already processed emails

    console.log("[Gmail Learn] Starting with:", { batchSize, query, reprocess });

    const gmail = createGmailClient(tokens);
    console.log("[Gmail Learn] Gmail client created");

    // Get or create labels
    console.log("[Gmail Learn] Getting/creating labels...");
    const processedLabelId = await getOrCreateLabel(gmail, PROCESSED_LABEL);
    const kbExtractedLabelId = await getOrCreateLabel(gmail, KB_EXTRACTED_LABEL);
    console.log("[Gmail Learn] Labels ready:", { processedLabelId, kbExtractedLabelId });

    // Create import job for tracking
    const { data: job } = await supabase
      .from("kb_import_jobs")
      .insert({
        source: "gmail",
        status: "running",
        config: { query, batchSize, reprocess },
      })
      .select("id")
      .single();

    const jobId = job?.id;
    console.log("[Gmail Learn] Job created:", jobId);

    // Fetch messages (optionally excluding already processed)
    const searchQuery = reprocess ? query : `${query} -label:${PROCESSED_LABEL}`;
    console.log("[Gmail Learn] Searching with query:", searchQuery);

    const { data: messageList } = await gmail.users.messages.list({
      userId: "me",
      q: searchQuery,
      maxResults: batchSize,
    });
    console.log("[Gmail Learn] Messages found:", messageList?.messages?.length ?? 0);

    const messages = messageList?.messages ?? [];

    if (messages.length === 0) {
      return NextResponse.json({
        processed: 0,
        message: "No unprocessed messages found",
        jobId,
      });
    }

    const results: ProcessResult[] = [];
    const logs: string[] = [];
    const log = (msg: string) => {
      console.log(msg);
      logs.push(msg);
    };

    // Track which threads we've already processed (avoid duplicates)
    const processedThreads = new Set<string>();

    for (const msgRef of messages) {
      if (!msgRef.id || !msgRef.threadId) continue;

      // Skip if we've already processed this thread
      if (processedThreads.has(msgRef.threadId)) {
        log(`Skipping message ${msgRef.id} - thread ${msgRef.threadId} already processed`);
        continue;
      }
      processedThreads.add(msgRef.threadId);

      log(`Processing thread ${msgRef.threadId}...`);

      try {
        // Always fetch the FULL thread to analyze all Q&A pairs
        const threadMessages = await getThreadMessages(gmail, msgRef.threadId);
        log(`Thread has ${threadMessages.length} messages`);

        // Get headers from first message for display
        const { data: message } = await gmail.users.messages.get({
          userId: "me",
          id: msgRef.id,
          format: "metadata",
          metadataHeaders: ["Subject", "From"],
        });
        const headers = parseHeaders(message.payload?.headers);

        log(`Thread: "${headers.subject.slice(0, 60)}..." from ${headers.from.slice(0, 40)}`);

        // Skip single-message threads (no Q&A possible)
        if (threadMessages.length < 2) {
          log(`SKIPPED - single message thread (need at least 2 for Q&A)`);
          results.push({
            messageId: msgRef.id,
            threadId: msgRef.threadId,
            subject: headers.subject,
            from: headers.from,
            threadMessageCount: 1,
            isResolved: false,
            qaPairsFound: 0,
            qaPairsExtracted: 0,
            qaPairsSkipped: 0,
            extractedQAs: [],
            action: "skipped",
            reason: "Single message thread - no Q&A to extract",
          });

          // Still mark as processed
          await gmail.users.messages.modify({
            userId: "me",
            id: msgRef.id,
            requestBody: { addLabelIds: [processedLabelId] },
          });
          continue;
        }

        // Extract ALL Q&A pairs from the thread
        log(`Extracting Q&A pairs via LLM...`);
        const extraction = await extractQAPairsFromThread(headers.subject, threadMessages);

        if (!extraction || extraction.qaPairs.length === 0) {
          log(`No Q&A pairs extracted from thread`);
          results.push({
            messageId: msgRef.id,
            threadId: msgRef.threadId,
            subject: headers.subject,
            from: headers.from,
            threadMessageCount: threadMessages.length,
            threadSummary: extraction?.threadSummary,
            isResolved: extraction?.isResolved ?? false,
            qaPairsFound: 0,
            qaPairsExtracted: 0,
            qaPairsSkipped: 0,
            extractedQAs: [],
            action: "needs_review",
            reason: extraction ? "No Q&A pairs found in thread" : "LLM extraction failed",
          });

          await gmail.users.messages.modify({
            userId: "me",
            id: msgRef.id,
            requestBody: { addLabelIds: [processedLabelId] },
          });
          continue;
        }

        log(`Found ${extraction.qaPairs.length} Q&A pair(s), resolved=${extraction.isResolved}`);
        log(`Summary: ${extraction.threadSummary?.slice(0, 100)}...`);

        // Process each Q&A pair - check KB coverage and create articles for uncovered ones
        const extractedQAs: ExtractedQA[] = [];
        let kbExtractedCount = 0;
        let kbExistsCount = 0;

        for (let i = 0; i < extraction.qaPairs.length; i++) {
          const qa = extraction.qaPairs[i];
          log(`  Q&A ${i + 1}: "${qa.kbTitle?.slice(0, 50)}..." (conf: ${(qa.confidence * 100).toFixed(0)}%)`);

          // Skip low-confidence Q&A pairs
          if (qa.confidence < 0.5) {
            log(`    → Skipped (low confidence)`);
            extractedQAs.push({
              question: qa.question,
              kbTitle: qa.kbTitle,
              kbMatchScore: 0,
              alreadyInKB: false,
              action: "skipped",
            });
            continue;
          }

          // Check if KB already covers this specific Q&A
          const kbCoverage = await checkKBCoverage(qa);
          log(`    → KB coverage: ${(kbCoverage.score * 100).toFixed(0)}% (threshold: ${CONFIDENCE_THRESHOLD * 100}%)`);

          if (kbCoverage.covered) {
            log(`    → Already in KB, skipping`);
            extractedQAs.push({
              question: qa.question,
              kbTitle: qa.kbTitle,
              kbMatchScore: kbCoverage.score,
              alreadyInKB: true,
              action: "kb_exists",
            });
            kbExistsCount++;
            continue;
          }

          // Create KB article for this Q&A pair
          log(`    → Creating KB article...`);
          const articleId = await createProposedKBArticle(
            {
              kbTitle: qa.kbTitle,
              kbBody: qa.kbBody,
              customerIssue: qa.question,
              confidence: qa.confidence,
            },
            msgRef.threadId,
            jobId!
          );

          if (articleId) {
            log(`    → Created KB article: ${articleId}`);
            extractedQAs.push({
              question: qa.question,
              kbTitle: qa.kbTitle,
              kbMatchScore: kbCoverage.score,
              alreadyInKB: false,
              kbArticleId: articleId,
              action: "kb_extracted",
            });
            kbExtractedCount++;
          } else {
            log(`    → Failed to create KB article`);
            extractedQAs.push({
              question: qa.question,
              kbTitle: qa.kbTitle,
              kbMatchScore: kbCoverage.score,
              alreadyInKB: false,
              action: "skipped",
            });
          }
        }

        // Mark thread as processed
        await gmail.users.messages.modify({
          userId: "me",
          id: msgRef.id,
          requestBody: { addLabelIds: [processedLabelId] },
        });

        // Add KB extracted label if we created any articles
        if (kbExtractedCount > 0) {
          await gmail.users.messages.modify({
            userId: "me",
            id: msgRef.id,
            requestBody: { addLabelIds: [kbExtractedLabelId] },
          });
        }

        // Determine overall action for this thread
        let overallAction: ProcessResult["action"];
        if (kbExtractedCount > 0) {
          overallAction = "kb_extracted";
        } else if (kbExistsCount === extraction.qaPairs.length) {
          overallAction = "kb_exists";
        } else {
          overallAction = "needs_review";
        }

        const reason = `${extraction.qaPairs.length} Q&A pair(s): ${kbExtractedCount} extracted, ${kbExistsCount} already in KB`;
        log(`→ Thread result: ${overallAction} - ${reason}`);

        results.push({
          messageId: msgRef.id,
          threadId: msgRef.threadId,
          subject: headers.subject,
          from: headers.from,
          threadMessageCount: threadMessages.length,
          threadSummary: extraction.threadSummary,
          isResolved: extraction.isResolved,
          qaPairsFound: extraction.qaPairs.length,
          qaPairsExtracted: kbExtractedCount,
          qaPairsSkipped: kbExistsCount,
          extractedQAs,
          action: overallAction,
          reason,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        log(`ERROR processing thread ${msgRef.threadId}: ${error}`);
        results.push({
          messageId: msgRef.id!,
          threadId: msgRef.threadId!,
          subject: "Error",
          from: "",
          threadMessageCount: 0,
          isResolved: false,
          qaPairsFound: 0,
          qaPairsExtracted: 0,
          qaPairsSkipped: 0,
          extractedQAs: [],
          action: "skipped",
          error,
          reason: `Processing failed: ${error}`,
        });
      }

      log(`---`); // Separator between threads
    }

    // Update job status
    const threadsWithExtraction = results.filter((r) => r.action === "kb_extracted").length;
    const threadsAllInKB = results.filter((r) => r.action === "kb_exists").length;
    const threadsNeedReview = results.filter((r) => r.action === "needs_review").length;
    const threadsSkipped = results.filter((r) => r.action === "skipped").length;

    // Count total Q&A pairs
    const totalQAPairs = results.reduce((sum, r) => sum + r.qaPairsFound, 0);
    const totalExtracted = results.reduce((sum, r) => sum + r.qaPairsExtracted, 0);
    const totalAlreadyInKB = results.reduce((sum, r) => sum + r.qaPairsSkipped, 0);

    log(`=== SUMMARY ===`);
    log(`Processed: ${results.length} threads`);
    log(`- Threads with KB extraction: ${threadsWithExtraction}`);
    log(`- Threads all in KB: ${threadsAllInKB}`);
    log(`- Threads need review: ${threadsNeedReview}`);
    log(`- Threads skipped: ${threadsSkipped}`);
    log(`Q&A Pairs: ${totalQAPairs} found, ${totalExtracted} extracted, ${totalAlreadyInKB} already in KB`);

    await supabase
      .from("kb_import_jobs")
      .update({
        status: "completed",
        total_items: results.length,
        processed_items: results.filter((r) => r.action !== "skipped").length,
        approved_items: totalExtracted, // Now counts individual KB articles, not threads
      })
      .eq("id", jobId);

    return NextResponse.json({
      processed: results.length,
      threads: {
        withExtraction: threadsWithExtraction,
        allInKB: threadsAllInKB,
        needsReview: threadsNeedReview,
        skipped: threadsSkipped,
      },
      qaPairs: {
        found: totalQAPairs,
        extracted: totalExtracted,
        alreadyInKB: totalAlreadyInKB,
      },
      results,
      logs,
      jobId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process";

    // Mark any running jobs as failed (cleanup)
    await supabase
      .from("kb_import_jobs")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("source", "gmail")
      .eq("status", "running");

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET: Get processing status
 */
export async function GET(request: NextRequest) {
  const tokens = getTokensFromRequest(request);
  if (!tokens) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const gmail = createGmailClient(tokens);

    // Count messages in different states
    const [inbox, processed, kbExtracted] = await Promise.all([
      gmail.users.messages.list({
        userId: "me",
        q: "in:inbox category:primary",
        maxResults: 1,
      }),
      gmail.users.messages.list({
        userId: "me",
        q: `label:${PROCESSED_LABEL}`,
        maxResults: 1,
      }),
      gmail.users.messages.list({
        userId: "me",
        q: `label:${KB_EXTRACTED_LABEL}`,
        maxResults: 1,
      }),
    ]);

    // Get recent jobs
    const { data: jobs } = await supabase
      .from("kb_import_jobs")
      .select("*")
      .eq("source", "gmail")
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      inbox: {
        total: inbox.data.resultSizeEstimate ?? 0,
      },
      processed: {
        total: processed.data.resultSizeEstimate ?? 0,
      },
      kbExtracted: {
        total: kbExtracted.data.resultSizeEstimate ?? 0,
      },
      recentJobs: jobs ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
