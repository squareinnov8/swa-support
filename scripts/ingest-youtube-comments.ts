/**
 * YouTube Comments Ingestion Script
 *
 * Extracts Q&A from video comments and adds to KB.
 * Focuses on:
 * 1. Questions answered by SquareWheels/Rob
 * 2. Highly-liked helpful comments
 * 3. Common questions (even unanswered - flags for FAQ)
 *
 * Usage: npx tsx scripts/ingest-youtube-comments.ts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DATA_DIR = "data/youtube";

interface Comment {
  id: string;
  text: string;
  author: string;
  author_id: string;
  like_count: number;
  parent: string; // "root" or parent comment ID
  timestamp: number;
}

interface QAPair {
  question: string;
  questionAuthor: string;
  answer: string;
  answerAuthor: string;
  likes: number;
  videoId: string;
  videoTitle: string;
}

interface VideoInfo {
  id: string;
  title: string;
  comments: Comment[];
}

// Channel owner identifiers
const OWNER_PATTERNS = [
  /squarewheels/i,
  /^rob$/i,
  /@squarewheelsauto/i,
];

function isOwnerReply(author: string): boolean {
  return OWNER_PATTERNS.some((p) => p.test(author));
}

function downloadComments(videoId: string): VideoInfo | null {
  const jsonPath = path.join(DATA_DIR, `${videoId}.info.json`);

  // Download if not exists or older than 7 days
  const shouldDownload =
    !fs.existsSync(jsonPath) ||
    Date.now() - fs.statSync(jsonPath).mtimeMs > 7 * 24 * 60 * 60 * 1000;

  if (shouldDownload) {
    try {
      console.log(`  Downloading comments for ${videoId}...`);
      execSync(
        `yt-dlp --write-comments --skip-download -o "${DATA_DIR}/%(id)s" "https://www.youtube.com/watch?v=${videoId}"`,
        { stdio: "pipe", timeout: 120000 }
      );
    } catch (e: any) {
      console.error(`  Failed to download comments: ${e.message?.slice(0, 50)}`);
      return null;
    }
  }

  if (!fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    return {
      id: videoId,
      title: data.title || "",
      comments: data.comments || [],
    };
  } catch (e) {
    return null;
  }
}

function extractQAPairs(video: VideoInfo): QAPair[] {
  const pairs: QAPair[] = [];
  const comments = video.comments;

  // Build a map of comment ID -> comment
  const commentMap = new Map<string, Comment>();
  for (const c of comments) {
    commentMap.set(c.id, c);
  }

  // Find owner replies
  for (const reply of comments) {
    if (reply.parent === "root") continue; // Skip root comments
    if (!isOwnerReply(reply.author)) continue; // Skip non-owner replies

    const parent = commentMap.get(reply.parent);
    if (!parent) continue;

    // Check if parent is a question
    if (parent.text?.includes("?")) {
      pairs.push({
        question: parent.text.trim(),
        questionAuthor: parent.author,
        answer: reply.text.trim(),
        answerAuthor: reply.author,
        likes: parent.like_count + reply.like_count,
        videoId: video.id,
        videoTitle: video.title,
      });
    }
  }

  return pairs;
}

function extractPopularComments(video: VideoInfo): Comment[] {
  // Get highly-liked root comments that contain useful info
  return video.comments
    .filter((c) => c.parent === "root" && c.like_count >= 5)
    .sort((a, b) => b.like_count - a.like_count)
    .slice(0, 10);
}

function extractUnansweredQuestions(video: VideoInfo): Comment[] {
  const comments = video.comments;

  // Build set of answered comment IDs
  const answeredIds = new Set<string>();
  for (const c of comments) {
    if (c.parent !== "root" && isOwnerReply(c.author)) {
      answeredIds.add(c.parent);
    }
  }

  // Find unanswered questions
  return comments
    .filter(
      (c) =>
        c.parent === "root" &&
        c.text?.includes("?") &&
        !answeredIds.has(c.id) &&
        c.like_count >= 2 // At least some engagement
    )
    .sort((a, b) => b.like_count - a.like_count)
    .slice(0, 20);
}

function generateCommentKBArticle(
  video: VideoInfo,
  qaPairs: QAPair[],
  popularComments: Comment[],
  unansweredQuestions: Comment[]
): string {
  const lines: string[] = [];

  lines.push(`# Video Q&A: ${video.title}`);
  lines.push("");
  lines.push(`**Video:** [Watch on YouTube](https://www.youtube.com/watch?v=${video.id})`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Q&A Section
  if (qaPairs.length > 0) {
    lines.push("## Questions Answered by SquareWheels");
    lines.push("");
    for (const qa of qaPairs) {
      lines.push(`### Q: ${qa.question.slice(0, 200)}`);
      lines.push(`*Asked by ${qa.questionAuthor}*`);
      lines.push("");
      lines.push(`**A:** ${qa.answer}`);
      lines.push(`*— ${qa.answerAuthor}*`);
      lines.push("");
    }
  }

  // Popular comments
  if (popularComments.length > 0) {
    lines.push("## Popular Comments");
    lines.push("");
    for (const c of popularComments) {
      lines.push(`> "${c.text.slice(0, 300)}${c.text.length > 300 ? "..." : ""}"`);
      lines.push(`> — ${c.author} (${c.like_count} likes)`);
      lines.push("");
    }
  }

  // Unanswered questions (for FAQ development)
  if (unansweredQuestions.length > 0) {
    lines.push("## Common Unanswered Questions");
    lines.push("*Consider adding these to FAQ or video content*");
    lines.push("");
    for (const q of unansweredQuestions.slice(0, 10)) {
      lines.push(`- "${q.text.slice(0, 150)}${q.text.length > 150 ? "..." : ""}" (${q.like_count} likes)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function getVideoIds(): Promise<string[]> {
  // Get video IDs from existing KB articles
  const { data } = await supabase
    .from("kb_docs")
    .select("source_id")
    .eq("source", "youtube");

  return (data || []).map((d) => d.source_id).filter(Boolean);
}

async function saveCommentKB(
  video: VideoInfo,
  markdown: string,
  qaPairs: QAPair[]
): Promise<void> {
  // Get or create FAQ category
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

  // Check if exists
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
      comment_count: video.comments.length,
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
  console.log("YouTube Comments Ingestion\n");

  // Get video IDs from existing KB
  const videoIds = await getVideoIds();
  console.log(`Found ${videoIds.length} videos in KB\n`);

  let totalQA = 0;
  let totalUnanswered = 0;

  for (const videoId of videoIds) {
    console.log(`\nProcessing: ${videoId}`);

    const video = downloadComments(videoId);
    if (!video) {
      console.log("  Skipping - no comments data");
      continue;
    }

    console.log(`  Video: ${video.title.slice(0, 50)}...`);
    console.log(`  Comments: ${video.comments.length}`);

    const qaPairs = extractQAPairs(video);
    const popularComments = extractPopularComments(video);
    const unansweredQuestions = extractUnansweredQuestions(video);

    console.log(`  Q&A pairs: ${qaPairs.length}`);
    console.log(`  Popular comments: ${popularComments.length}`);
    console.log(`  Unanswered questions: ${unansweredQuestions.length}`);

    totalQA += qaPairs.length;
    totalUnanswered += unansweredQuestions.length;

    if (qaPairs.length > 0 || popularComments.length > 0) {
      const markdown = generateCommentKBArticle(
        video,
        qaPairs,
        popularComments,
        unansweredQuestions
      );

      // Save locally
      const mdPath = path.join(DATA_DIR, `${videoId}-comments.md`);
      fs.writeFileSync(mdPath, markdown);
      console.log(`  Saved: ${mdPath}`);

      // Save to KB
      await saveCommentKB(video, markdown, qaPairs);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Total Q&A pairs extracted: ${totalQA}`);
  console.log(`Total unanswered questions flagged: ${totalUnanswered}`);
}

main().catch(console.error);
