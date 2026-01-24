/**
 * Fetch YouTube video transcripts with timestamps
 * For ingesting DIY/how-to video content into KB
 */

interface TranscriptSegment {
  start: number;
  duration: number;
  text: string;
  timestamp: string;
}

async function getTranscript(videoId: string): Promise<TranscriptSegment[] | null> {
  // Fetch the video page to get the captions URL
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const html = await response.text();

  // Extract caption track URL from the page
  const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionMatch) {
    console.log("No caption tracks found in page");
    return null;
  }

  try {
    const tracks = JSON.parse(captionMatch[1]);
    console.log("Found", tracks.length, "caption track(s)");

    if (tracks.length === 0) return null;

    // Get the first track (usually English)
    const track = tracks[0];
    console.log("Using track:", track.name?.simpleText || track.languageCode);

    // Fetch the caption data
    const captionResponse = await fetch(track.baseUrl);
    const captionXml = await captionResponse.text();

    // Parse the XML to extract text and timestamps
    const segments: TranscriptSegment[] = [];
    const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
    let match;

    while ((match = regex.exec(captionXml)) !== null) {
      const start = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      let text = match[3];

      // Decode HTML entities
      text = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\n/g, " ");

      // Format timestamp
      const mins = Math.floor(start / 60);
      const secs = Math.floor(start % 60);
      const timestamp = `${mins}:${secs.toString().padStart(2, "0")}`;

      segments.push({ start, duration, text, timestamp });
    }

    return segments;
  } catch (e: any) {
    console.error("Parse error:", e.message);
    return null;
  }
}

function formatTimestampLink(videoId: string, startSeconds: number): string {
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startSeconds)}s`;
}

async function main() {
  const videoId = process.argv[2] || "Imqw7oa3izE";
  console.log("Fetching transcript for video:", videoId);
  console.log("URL:", `https://www.youtube.com/watch?v=${videoId}`);
  console.log("---\n");

  const segments = await getTranscript(videoId);

  if (!segments || segments.length === 0) {
    console.log("Failed to get transcript");
    return;
  }

  console.log(`\nGot ${segments.length} segments\n`);
  console.log("--- TRANSCRIPT PREVIEW (first 40 segments) ---\n");

  for (const seg of segments.slice(0, 40)) {
    console.log(`[${seg.timestamp}] ${seg.text}`);
  }

  console.log("\n...\n");

  // Show last few segments too
  console.log("--- LAST 10 SEGMENTS ---\n");
  for (const seg of segments.slice(-10)) {
    console.log(`[${seg.timestamp}] ${seg.text}`);
  }

  console.log("\n--- STATS ---");
  console.log("Total segments:", segments.length);
  console.log(
    "Total text:",
    segments.reduce((a, s) => a + s.text.length, 0),
    "characters"
  );
  console.log(
    "Duration:",
    Math.floor(segments[segments.length - 1].start / 60),
    "minutes"
  );

  // Example of timestamped links
  console.log("\n--- SAMPLE TIMESTAMPED LINKS ---");
  const sampleSegments = [segments[0], segments[Math.floor(segments.length / 2)], segments[segments.length - 1]];
  for (const seg of sampleSegments) {
    console.log(`[${seg.timestamp}] "${seg.text.slice(0, 50)}..."`);
    console.log(`  Link: ${formatTimestampLink(videoId, seg.start)}`);
  }
}

main().catch(console.error);
