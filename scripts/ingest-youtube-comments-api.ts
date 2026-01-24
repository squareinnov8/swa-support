/**
 * YouTube Comments Ingestion via YouTube Data API
 *
 * Uses the official YouTube Data API to get properly threaded comments
 * with parent-child relationships, allowing extraction of Q&A pairs
 * where Rob/SquareWheels replied to customer questions.
 *
 * Setup:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project (or use existing)
 * 3. Enable "YouTube Data API v3"
 * 4. Create API credentials (API Key for public data)
 * 5. Add YOUTUBE_API_KEY to .env
 *
 * Usage: npx tsx scripts/ingest-youtube-comments-api.ts
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = "UCfMJ2t7f2tUqhOAVZjCvGRA"; // @SquareWheelsAuto

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_DIR = "data/youtube";

interface YouTubeComment {
  id: string;
  text: string;
  author: string;
  authorChannelId: string;
  likeCount: number;
  publishedAt: string;
  parentId?: string;
}

interface CommentThread {
  topLevelComment: YouTubeComment;
  replies: YouTubeComment[];
  totalReplyCount: number;
}

interface QAPair {
  question: string;
  questionAuthor: string;
  answer: string;
  answerAuthor: string;
  questionLikes: number;
  answerLikes: number;
  videoId: string;
  videoTitle: string;
}

interface VideoInfo {
  id: string;
  title: string;
  threads: CommentThread[];
}

// Channel owner identifiers
const OWNER_CHANNEL_ID = CHANNEL_ID;
const OWNER_PATTERNS = [/squarewheels/i, /@squarewheelsauto/i];

function isOwnerReply(authorChannelId: string, authorName: string): boolean {
  if (authorChannelId === OWNER_CHANNEL_ID) return true;
  return OWNER_PATTERNS.some((p) => p.test(authorName));
}

async function fetchCommentThreads(videoId: string): Promise<CommentThread[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not set in environment");
  }

  const threads: CommentThread[] = [];
  let pageToken: string | undefined;

  console.log(`  Fetching comment threads...`);

  do {
    const url = new URL(
      "https://www.googleapis.com/youtube/v3/commentThreads"
    );
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("videoId", videoId);
    url.searchParams.set("part", "snippet,replies");
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("order", "relevance");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`YouTube API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    for (const item of data.items || []) {
      const snippet = item.snippet.topLevelComment.snippet;
      const topLevelComment: YouTubeComment = {
        id: item.snippet.topLevelComment.id,
        text: snippet.textDisplay,
        author: snippet.authorDisplayName,
        authorChannelId: snippet.authorChannelId?.value || "",
        likeCount: snippet.likeCount || 0,
        publishedAt: snippet.publishedAt,
      };

      const replies: YouTubeComment[] = [];
      if (item.replies?.comments) {
        for (const reply of item.replies.comments) {
          const replySnippet = reply.snippet;
          replies.push({
            id: reply.id,
            text: replySnippet.textDisplay,
            author: replySnippet.authorDisplayName,
            authorChannelId: replySnippet.authorChannelId?.value || "",
            likeCount: replySnippet.likeCount || 0,
            publishedAt: replySnippet.publishedAt,
            parentId: replySnippet.parentId,
          });
        }
      }

      threads.push({
        topLevelComment,
        replies,
        totalReplyCount: item.snippet.totalReplyCount || 0,
      });
    }

    pageToken = data.nextPageToken;
    console.log(`    Fetched ${threads.length} threads...`);

    // Rate limiting - be nice to the API
    await new Promise((r) => setTimeout(r, 100));
  } while (pageToken && threads.length < 500); // Cap at 500 threads

  return threads;
}

async function fetchAllReplies(
  commentId: string,
  existingReplies: YouTubeComment[]
): Promise<YouTubeComment[]> {
  if (!YOUTUBE_API_KEY) return existingReplies;

  const replies: YouTubeComment[] = [...existingReplies];
  let pageToken: string | undefined;

  // If we already have all replies, skip
  if (replies.length >= 20) return replies; // API returns max 5 initially

  do {
    const url = new URL("https://www.googleapis.com/youtube/v3/comments");
    url.searchParams.set("key", YOUTUBE_API_KEY);
    url.searchParams.set("parentId", commentId);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("maxResults", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString());
    if (!response.ok) break;

    const data = await response.json();

    for (const item of data.items || []) {
      const snippet = item.snippet;
      // Avoid duplicates
      if (!replies.find((r) => r.id === item.id)) {
        replies.push({
          id: item.id,
          text: snippet.textDisplay,
          author: snippet.authorDisplayName,
          authorChannelId: snippet.authorChannelId?.value || "",
          likeCount: snippet.likeCount || 0,
          publishedAt: snippet.publishedAt,
          parentId: snippet.parentId,
        });
      }
    }

    pageToken = data.nextPageToken;
    await new Promise((r) => setTimeout(r, 100));
  } while (pageToken);

  return replies;
}

function extractQAPairs(video: VideoInfo): QAPair[] {
  const pairs: QAPair[] = [];

  for (const thread of video.threads) {
    const question = thread.topLevelComment;

    // Skip if no question mark in original comment
    if (!question.text.includes("?")) continue;

    // Find owner replies
    for (const reply of thread.replies) {
      if (isOwnerReply(reply.authorChannelId, reply.author)) {
        pairs.push({
          question: cleanHtml(question.text),
          questionAuthor: question.author,
          answer: cleanHtml(reply.text),
          answerAuthor: reply.author,
          questionLikes: question.likeCount,
          answerLikes: reply.likeCount,
          videoId: video.id,
          videoTitle: video.title,
        });
        break; // Take first owner reply
      }
    }
  }

  return pairs;
}

function cleanHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractPopularComments(video: VideoInfo): YouTubeComment[] {
  return video.threads
    .map((t) => t.topLevelComment)
    .filter((c) => c.likeCount >= 5)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 10);
}

function extractUnansweredQuestions(video: VideoInfo): YouTubeComment[] {
  const answered = new Set<string>();

  for (const thread of video.threads) {
    for (const reply of thread.replies) {
      if (isOwnerReply(reply.authorChannelId, reply.author)) {
        answered.add(thread.topLevelComment.id);
        break;
      }
    }
  }

  return video.threads
    .map((t) => t.topLevelComment)
    .filter(
      (c) => c.text.includes("?") && !answered.has(c.id) && c.likeCount >= 2
    )
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 15);
}

function generateCommentKBArticle(
  video: VideoInfo,
  qaPairs: QAPair[],
  popularComments: YouTubeComment[],
  unansweredQuestions: YouTubeComment[]
): string {
  const lines: string[] = [];

  lines.push(`# Video Q&A: ${video.title}`);
  lines.push("");
  lines.push(
    `**Video:** [Watch on YouTube](https://www.youtube.com/watch?v=${video.id})`
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Q&A Section - the key value from the API!
  if (qaPairs.length > 0) {
    lines.push("## Questions Answered by SquareWheels");
    lines.push("");
    for (const qa of qaPairs) {
      lines.push(`### Q: ${qa.question.slice(0, 300)}`);
      lines.push(`*Asked by ${qa.questionAuthor} (${qa.questionLikes} likes)*`);
      lines.push("");
      lines.push(`**A:** ${qa.answer}`);
      lines.push(`*— ${qa.answerAuthor}*`);
      lines.push("");
    }
  }

  // Popular comments (testimonials)
  if (popularComments.length > 0) {
    lines.push("## Popular Comments");
    lines.push("");
    for (const c of popularComments) {
      const text = cleanHtml(c.text);
      lines.push(`> "${text.slice(0, 300)}${text.length > 300 ? "..." : ""}"`);
      lines.push(`> — ${c.author} (${c.likeCount} likes)`);
      lines.push("");
    }
  }

  // Unanswered questions
  if (unansweredQuestions.length > 0) {
    lines.push("## Common Unanswered Questions");
    lines.push("*Consider adding these to FAQ or video content*");
    lines.push("");
    for (const q of unansweredQuestions.slice(0, 10)) {
      const text = cleanHtml(q.text);
      lines.push(
        `- "${text.slice(0, 150)}${text.length > 150 ? "..." : ""}" (${q.likeCount} likes)`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function getVideoIds(): Promise<{ id: string; title: string }[]> {
  const { data } = await supabase
    .from("kb_docs")
    .select("source_id, title")
    .eq("source", "youtube");

  return (data || [])
    .filter((d) => d.source_id)
    .map((d) => ({
      id: d.source_id,
      title: d.title?.replace("Video: ", "") || "",
    }));
}

async function saveCommentKB(
  video: VideoInfo,
  markdown: string,
  qaPairs: QAPair[]
): Promise<void> {
  let { data: category } = await supabase
    .from("kb_categories")
    .select("id")
    .eq("name", "Video Q&A")
    .single();

  if (!category) {
    const { data: created } = await supabase
      .from("kb_categories")
      .insert({ name: "Video Q&A", slug: "video-qa" })
      .select("id")
      .single();
    category = created;
  }

  const { data: existing } = await supabase
    .from("kb_docs")
    .select("id")
    .eq("source", "youtube-comments")
    .eq("source_id", video.id)
    .single();

  const docData = {
    title: `Q&A: ${video.title}`,
    source: "youtube-comments",
    source_id: video.id,
    category_id: category?.id,
    body: markdown,
    metadata: {
      video_url: `https://www.youtube.com/watch?v=${video.id}`,
      qa_count: qaPairs.length,
      thread_count: video.threads.length,
      fetched_via: "youtube-data-api",
    },
  };

  if (existing) {
    await supabase.from("kb_docs").update(docData).eq("id", existing.id);
    console.log(`  Updated Q&A article`);
  } else {
    await supabase.from("kb_docs").insert(docData);
    console.log(`  Created Q&A article`);
  }
}

async function main() {
  console.log("YouTube Comments Ingestion (Data API)\n");

  if (!YOUTUBE_API_KEY) {
    console.error("❌ YOUTUBE_API_KEY not set in .env");
    console.log("\nSetup instructions:");
    console.log("1. Go to https://console.cloud.google.com/");
    console.log("2. Create or select a project");
    console.log('3. Enable "YouTube Data API v3"');
    console.log("4. Go to Credentials → Create Credentials → API Key");
    console.log("5. Add to .env: YOUTUBE_API_KEY=your_key_here");
    process.exit(1);
  }

  const videos = await getVideoIds();
  console.log(`Found ${videos.length} videos in KB\n`);

  let totalQA = 0;
  let totalThreads = 0;
  let totalUnanswered = 0;

  for (const videoInfo of videos) {
    console.log(`\nProcessing: ${videoInfo.id}`);
    console.log(`  Title: ${videoInfo.title.slice(0, 50)}...`);

    try {
      const threads = await fetchCommentThreads(videoInfo.id);
      console.log(`  Comment threads: ${threads.length}`);

      // For threads with many replies, fetch all replies
      for (const thread of threads) {
        if (thread.totalReplyCount > thread.replies.length) {
          thread.replies = await fetchAllReplies(
            thread.topLevelComment.id,
            thread.replies
          );
        }
      }

      const video: VideoInfo = {
        id: videoInfo.id,
        title: videoInfo.title,
        threads,
      };

      const qaPairs = extractQAPairs(video);
      const popularComments = extractPopularComments(video);
      const unansweredQuestions = extractUnansweredQuestions(video);

      console.log(`  ✅ Q&A pairs (owner replied): ${qaPairs.length}`);
      console.log(`  Popular comments: ${popularComments.length}`);
      console.log(`  Unanswered questions: ${unansweredQuestions.length}`);

      totalQA += qaPairs.length;
      totalThreads += threads.length;
      totalUnanswered += unansweredQuestions.length;

      // Generate and save markdown
      const markdown = generateCommentKBArticle(
        video,
        qaPairs,
        popularComments,
        unansweredQuestions
      );

      // Save locally
      const mdPath = path.join(DATA_DIR, `${video.id}-comments.md`);
      fs.writeFileSync(mdPath, markdown);
      console.log(`  Saved: ${mdPath}`);

      // Save to KB
      await saveCommentKB(video, markdown, qaPairs);

      // Also save raw thread data for debugging
      const jsonPath = path.join(DATA_DIR, `${video.id}-threads.json`);
      fs.writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            videoId: video.id,
            title: video.title,
            threadCount: threads.length,
            qaPairCount: qaPairs.length,
            threads: threads.slice(0, 50), // Save first 50 threads
          },
          null,
          2
        )
      );
    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message}`);
      if (error.message.includes("quotaExceeded")) {
        console.error("\n⚠️  YouTube API quota exceeded. Try again tomorrow.");
        break;
      }
    }

    // Rate limiting between videos
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Total comment threads fetched: ${totalThreads}`);
  console.log(`Total Q&A pairs extracted: ${totalQA}`);
  console.log(`Total unanswered questions: ${totalUnanswered}`);
  console.log("\nRun 'npm run embed:kb' to generate embeddings for new content.");
}

main().catch(console.error);
