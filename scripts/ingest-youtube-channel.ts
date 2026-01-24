/**
 * YouTube Channel Ingestion Script
 *
 * Fetches all videos from SquareWheels Auto YouTube channel,
 * extracts transcripts with timestamps, and creates KB articles.
 *
 * Usage: npx tsx scripts/ingest-youtube-channel.ts
 */

import { Innertube } from "youtubei.js";
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

const CHANNEL_NAME = "SquareWheels Auto";
const DATA_DIR = "data/youtube";

interface VideoInfo {
  id: string;
  title: string;
  duration: string;
  views: string;
  description?: string;
}

interface TranscriptSegment {
  timestamp: string;
  startSeconds: number;
  text: string;
}

interface ProcessedVideo {
  id: string;
  title: string;
  url: string;
  duration: string;
  transcript: TranscriptSegment[];
  chapters: Chapter[];
}

interface Chapter {
  title: string;
  timestamp: string;
  startSeconds: number;
  content: string;
}

async function getChannelVideos(): Promise<VideoInfo[]> {
  console.log("Searching for", CHANNEL_NAME, "videos...\n");

  const youtube = await Innertube.create();
  const search = await youtube.search(CHANNEL_NAME, { type: "video" });

  const videos: VideoInfo[] = [];

  // Keywords that indicate this is NOT a SquareWheels Auto video
  const excludePatterns = [
    /nursery rhyme/i,
    /kids song/i,
    /baby shark/i,
    /wheels on the bus/i,
    /children/i,
    /kindergarten/i,
    /toddler/i,
  ];

  for (const video of search.videos) {
    // Must be from SquareWheels channel
    if (!video.author?.name?.includes("SquareWheels")) continue;

    const title = video.title?.text || "";

    // Skip children's content that might match "Wheels"
    if (excludePatterns.some((p) => p.test(title))) {
      console.log(`  Skipping non-automotive: ${title.slice(0, 50)}...`);
      continue;
    }

    // Must contain automotive keywords
    const automotiveKeywords = /q50|q60|infiniti|apex|screen|install|headlight|firmware|carplay|tesla/i;
    if (!automotiveKeywords.test(title)) {
      console.log(`  Skipping non-automotive: ${title.slice(0, 50)}...`);
      continue;
    }

    videos.push({
      id: video.id || "",
      title,
      duration: video.duration?.text || "",
      views: video.view_count?.text || "",
    });
  }

  console.log(`Found ${videos.length} automotive videos\n`);
  return videos;
}

function downloadTranscript(videoId: string): boolean {
  const outputPath = path.join(DATA_DIR, `${videoId}.en.vtt`);

  if (fs.existsSync(outputPath)) {
    console.log(`  Transcript already exists for ${videoId}`);
    return true;
  }

  try {
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "${DATA_DIR}/%(id)s" "https://www.youtube.com/watch?v=${videoId}"`,
      { stdio: "pipe", timeout: 60000 }
    );
    return fs.existsSync(outputPath);
  } catch (e: any) {
    console.error(`  Failed to download transcript: ${e.message?.slice(0, 50)}`);
    return false;
  }
}

function parseVTT(vttPath: string): TranscriptSegment[] {
  const content = fs.readFileSync(vttPath, "utf-8");
  const segments: TranscriptSegment[] = [];
  const seen = new Set<string>();

  // Parse VTT format - extract clean text without duplicates
  const lines = content.split("\n");
  let currentTime = "";

  for (const line of lines) {
    // Match timestamp lines
    const timeMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const mins = parseInt(timeMatch[2]);
      const secs = parseInt(timeMatch[3]);
      const totalSeconds = hours * 3600 + mins * 60 + secs;
      const displayMins = Math.floor(totalSeconds / 60);
      const displaySecs = totalSeconds % 60;
      currentTime = `${displayMins}:${displaySecs.toString().padStart(2, "0")}`;
      continue;
    }

    // Skip non-text lines
    if (!line.trim() || line.startsWith("WEBVTT") || line.startsWith("Kind:") || line.startsWith("Language:")) {
      continue;
    }

    // Clean the text line (remove timing tags)
    let text = line.replace(/<[^>]+>/g, "").trim();
    if (!text || seen.has(text)) continue;

    seen.add(text);

    if (currentTime) {
      const timeParts = currentTime.split(":");
      const startSeconds = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);

      segments.push({
        timestamp: currentTime,
        startSeconds,
        text,
      });
    }
  }

  return segments;
}

function identifyChapters(segments: TranscriptSegment[], title: string): Chapter[] {
  // Group segments into logical chapters based on content
  // For now, create chapters every ~2 minutes or at topic changes
  const chapters: Chapter[] = [];
  let currentChapter: Chapter | null = null;
  let lastChapterTime = 0;

  const topicKeywords = [
    { keywords: ["remove", "removing", "take off", "pull out"], title: "Removal" },
    { keywords: ["install", "installing", "put in", "connect"], title: "Installation" },
    { keywords: ["wire", "wiring", "harness", "plug"], title: "Wiring" },
    { keywords: ["test", "testing", "check", "verify"], title: "Testing" },
    { keywords: ["setting", "settings", "configure", "menu"], title: "Configuration" },
    { keywords: ["camera", "backup", "reverse"], title: "Camera Setup" },
    { keywords: ["carplay", "android auto", "phone"], title: "CarPlay/Android Auto" },
    { keywords: ["firmware", "update", "software"], title: "Firmware Update" },
    { keywords: ["troubleshoot", "problem", "issue", "fix"], title: "Troubleshooting" },
  ];

  for (const segment of segments) {
    const textLower = segment.text.toLowerCase();

    // Check if this segment indicates a new topic
    let newTopic: string | null = null;
    for (const { keywords, title } of topicKeywords) {
      if (keywords.some((kw) => textLower.includes(kw))) {
        // Only create new chapter if enough time has passed
        if (segment.startSeconds - lastChapterTime > 60) {
          newTopic = title;
          break;
        }
      }
    }

    if (newTopic || !currentChapter) {
      if (currentChapter) {
        chapters.push(currentChapter);
      }
      currentChapter = {
        title: newTopic || "Introduction",
        timestamp: segment.timestamp,
        startSeconds: segment.startSeconds,
        content: segment.text,
      };
      lastChapterTime = segment.startSeconds;
    } else {
      currentChapter.content += " " + segment.text;
    }
  }

  if (currentChapter) {
    chapters.push(currentChapter);
  }

  return chapters;
}

function generateKBArticle(video: ProcessedVideo): string {
  const lines: string[] = [];

  lines.push(`# ${video.title}`);
  lines.push("");
  lines.push(`**Video:** [Watch on YouTube](${video.url})`);
  lines.push(`**Duration:** ${video.duration}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Table of contents with timestamp links
  lines.push("## Chapters");
  lines.push("");
  for (const chapter of video.chapters) {
    const link = `${video.url}&t=${chapter.startSeconds}s`;
    lines.push(`- [${chapter.timestamp}] [${chapter.title}](${link})`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Full transcript with timestamps
  lines.push("## Full Transcript");
  lines.push("");

  for (const chapter of video.chapters) {
    const link = `${video.url}&t=${chapter.startSeconds}s`;
    lines.push(`### ${chapter.title} ([${chapter.timestamp}](${link}))`);
    lines.push("");
    lines.push(chapter.content);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Quick Reference Timestamps");
  lines.push("");

  // Find key moments to highlight
  const keyMoments = video.transcript.filter((s) => {
    const text = s.text.toLowerCase();
    return (
      text.includes("important") ||
      text.includes("make sure") ||
      text.includes("don't forget") ||
      text.includes("tip") ||
      text.includes("careful") ||
      text.includes("here's") ||
      text.includes("this is where")
    );
  });

  if (keyMoments.length > 0) {
    for (const moment of keyMoments.slice(0, 10)) {
      const link = `${video.url}&t=${moment.startSeconds}s`;
      lines.push(`- [${moment.timestamp}](${link}) - "${moment.text.slice(0, 80)}..."`);
    }
  }

  return lines.join("\n");
}

async function getOrCreateVideoCategory(): Promise<string> {
  // Check if Videos category exists
  const { data: existing } = await supabase
    .from("kb_categories")
    .select("id")
    .eq("name", "Videos")
    .single();

  if (existing) return existing.id;

  // Create Videos category
  const { data: created, error } = await supabase
    .from("kb_categories")
    .insert({ name: "Videos", slug: "videos" })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create Videos category: ${error.message}`);
  console.log("  Created 'Videos' category");
  return created.id;
}

async function saveToKB(video: ProcessedVideo, markdown: string): Promise<void> {
  const categoryId = await getOrCreateVideoCategory();

  // Check if article already exists (by source + source_id)
  const { data: existing } = await supabase
    .from("kb_docs")
    .select("id")
    .eq("source", "youtube")
    .eq("source_id", video.id)
    .single();

  const docData = {
    title: `Video: ${video.title}`,
    source: "youtube",
    source_id: video.id,
    category_id: categoryId,
    body: markdown,
    product_tags: extractProductTags(video.title),
    metadata: {
      video_url: video.url,
      duration: video.duration,
      chapters: video.chapters.map((c) => ({
        title: c.title,
        timestamp: c.timestamp,
        startSeconds: c.startSeconds,
      })),
    },
  };

  if (existing) {
    await supabase.from("kb_docs").update(docData).eq("id", existing.id);
    console.log(`  Updated KB article: ${video.title}`);
  } else {
    await supabase.from("kb_docs").insert(docData);
    console.log(`  Created KB article: ${video.title}`);
  }
}

function extractProductTags(title: string): string[] {
  const tags: string[] = [];
  const titleLower = title.toLowerCase();

  if (titleLower.includes("apex")) tags.push("apex");
  if (titleLower.includes("g-series") || titleLower.includes("mk6") || titleLower.includes("mk7")) tags.push("g-series");
  if (titleLower.includes("tesla") || titleLower.includes("screen")) tags.push("tesla-screen");
  if (titleLower.includes("headlight")) tags.push("headlights");
  if (titleLower.includes("q50")) tags.push("q50");
  if (titleLower.includes("q60")) tags.push("q60");
  if (titleLower.includes("carplay")) tags.push("carplay");
  if (titleLower.includes("firmware") || titleLower.includes("software")) tags.push("firmware");
  if (titleLower.includes("install")) tags.push("installation");

  return tags;
}

async function main() {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Get videos from channel
  const videos = await getChannelVideos();

  if (videos.length === 0) {
    console.log("No videos found");
    return;
  }

  // Process each video
  const processed: ProcessedVideo[] = [];

  for (const video of videos) {
    console.log(`\nProcessing: ${video.title}`);
    console.log(`  ID: ${video.id}`);
    console.log(`  Duration: ${video.duration}`);

    // Download transcript
    const success = downloadTranscript(video.id);
    if (!success) {
      console.log("  Skipping - no transcript available");
      continue;
    }

    // Parse transcript
    const vttPath = path.join(DATA_DIR, `${video.id}.en.vtt`);
    const segments = parseVTT(vttPath);
    console.log(`  Parsed ${segments.length} transcript segments`);

    if (segments.length === 0) {
      console.log("  Skipping - empty transcript");
      continue;
    }

    // Identify chapters
    const chapters = identifyChapters(segments, video.title);
    console.log(`  Identified ${chapters.length} chapters`);

    const processedVideo: ProcessedVideo = {
      id: video.id,
      title: video.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      duration: video.duration,
      transcript: segments,
      chapters,
    };

    processed.push(processedVideo);

    // Generate KB article
    const markdown = generateKBArticle(processedVideo);

    // Save markdown locally
    const mdPath = path.join(DATA_DIR, `${video.id}.md`);
    fs.writeFileSync(mdPath, markdown);
    console.log(`  Saved: ${mdPath}`);

    // Save to KB database
    await saveToKB(processedVideo, markdown);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processed ${processed.length} videos`);
  console.log(`Output directory: ${DATA_DIR}`);
}

main().catch(console.error);
