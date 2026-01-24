/**
 * Collect positive testimonials from Gmail inbox
 * Saves to docs/testimonials.md for marketing use
 */

import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Testimonial {
  quote: string;
  name: string;
  category: string;
  subject: string;
  order: string | null;
  date: string;
}

async function main() {
  const { data: syncState } = await supabase
    .from("gmail_sync_state")
    .select("*")
    .single();

  if (!syncState?.refresh_token) {
    console.error("No Gmail refresh token found");
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({ refresh_token: syncState.refresh_token });
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const searchQueries = [
    "awesome OR amazing",
    '"thank you so much" OR "thanks so much"',
    '"great video" OR "helpful video" OR "love the video"',
    '"fast response" OR "quick response" OR "so fast"',
    '"works great" OR "works perfect" OR "love it"',
    "impressed OR excellent",
    '"highly recommend" OR "would recommend"',
  ];

  const testimonials: Testimonial[] = [];
  const seenIds = new Set<string>();

  // Positive patterns to extract
  const positivePatterns = [
    { regex: /how the hell did you answer[^.!?\n]*fast[^.!?\n]*/i, category: "Response Speed" },
    { regex: /you.{0,3}re awesome[^.!?\n]*/i, category: "Service Quality" },
    { regex: /thank you (so much|for your)[^.!?\n]*/i, category: "Gratitude" },
    { regex: /great (video|product|service|support|job|work)[^.!?\n]*/i, category: "Quality" },
    { regex: /(so|super|really|very) (fast|quick|helpful|responsive)[^.!?\n]*/i, category: "Response Speed" },
    { regex: /love (the|this|my|it)[^.!?\n]{0,50}/i, category: "Product Love" },
    { regex: /works (great|perfect|amazing)[^.!?\n]*/i, category: "Product Quality" },
    { regex: /impressed[^.!?\n]*/i, category: "Impressed" },
    { regex: /excellent (service|support|product|quality)[^.!?\n]*/i, category: "Quality" },
    { regex: /(highly|would|definitely) recommend[^.!?\n]*/i, category: "Recommendation" },
    { regex: /amazing (product|service|support)[^.!?\n]*/i, category: "Quality" },
    { regex: /exactly what (i|we) (needed|wanted)[^.!?\n]*/i, category: "Satisfaction" },
    { regex: /problem solved[^.!?\n]*/i, category: "Resolution" },
    { regex: /backup cam now works[^.!?\n]*/i, category: "Product Quality" },
    { regex: /everything is (fine and )?great[^.!?\n]*/i, category: "Satisfaction" },
    { regex: /white glove[^.!?\n]*/i, category: "Service Quality" },
    { regex: /couldn't be happier[^.!?\n]*/i, category: "Satisfaction" },
  ];

  console.log("Searching Gmail for positive sentiment emails...\n");

  for (const q of searchQueries) {
    try {
      const res = await gmail.users.messages.list({
        userId: "me",
        q: `in:inbox (${q}) -from:squarewheelsauto -from:noreply -from:notification -from:mailer -from:newsletter`,
        maxResults: 30,
      });

      console.log(`Query "${q.slice(0, 30)}...": ${res.data.messages?.length || 0} results`);

      for (const msg of res.data.messages || []) {
        if (seenIds.has(msg.id!)) continue;
        seenIds.add(msg.id!);

        const full = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "full",
        });

        const headers = full.data.payload?.headers || [];
        const from = headers.find((h) => h.name === "From")?.value || "";
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const dateStr = headers.find((h) => h.name === "Date")?.value || "";

        // Skip automated/spam
        if (/noreply|donotreply|notification|mailer|newsletter|tiktok|facebook|instagram|google\.com|facebookmail/i.test(from)) continue;
        if (/squarewheels/i.test(from)) continue;

        // Extract body
        function extractText(payload: any): string {
          if (payload.body?.data) {
            return Buffer.from(payload.body.data, "base64").toString("utf-8");
          }
          if (payload.parts) {
            for (const part of payload.parts) {
              if (part.mimeType === "text/plain" && part.body?.data) {
                return Buffer.from(part.body.data, "base64").toString("utf-8");
              }
              const nested = extractText(part);
              if (nested) return nested;
            }
          }
          return "";
        }

        const body = extractText(full.data.payload);
        if (body.length < 30 || body.includes("<!DOCTYPE")) continue;

        // Extract name
        const nameMatch = from.match(/^([^<]+)/);
        const name = nameMatch ? nameMatch[1].trim().replace(/"/g, "") : from.split("@")[0];

        // Find matching positive quotes
        for (const { regex, category } of positivePatterns) {
          const match = body.match(regex);
          if (match) {
            let quote = match[0].trim();
            quote = quote.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();

            // Skip if it's a quoted reply
            if (quote.includes("wrote:") || quote.includes("On ")) continue;
            if (quote.length < 15 || quote.length > 150) continue;

            const orderMatch = subject.match(/#?(\d{4})/);

            testimonials.push({
              quote,
              name,
              category,
              subject,
              order: orderMatch ? "#" + orderMatch[1] : null,
              date: dateStr,
            });
            break;
          }
        }
      }
    } catch (e: any) {
      console.error(`Search error for "${q.slice(0, 20)}...":`, e.message?.slice(0, 50));
    }
  }

  // Dedupe by name, keep best quote per person
  const byName = new Map<string, Testimonial>();
  for (const t of testimonials) {
    const key = t.name.toLowerCase().split(" ")[0];
    if (!byName.has(key) || t.quote.length > byName.get(key)!.quote.length) {
      byName.set(key, t);
    }
  }

  const unique = [...byName.values()];
  console.log(`\nFound ${unique.length} unique testimonials\n`);

  // Generate markdown
  const lines: string[] = [];
  lines.push("# Customer Testimonials");
  lines.push("");
  lines.push("> Collected from support inbox - positive sentiment quotes for marketing use.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // Group by category
  const byCategory = new Map<string, Testimonial[]>();
  for (const t of unique) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }

  // Priority order for categories
  const categoryOrder = [
    "Response Speed",
    "Service Quality",
    "Product Quality",
    "Satisfaction",
    "Quality",
    "Gratitude",
    "Product Love",
    "Recommendation",
    "Resolution",
    "Impressed",
  ];

  for (const category of categoryOrder) {
    const items = byCategory.get(category);
    if (!items?.length) continue;

    lines.push(`## ${category}`);
    lines.push("");
    for (const t of items) {
      const firstName = t.name.split(" ")[0];
      lines.push(`> "${t.quote}"`);
      lines.push(`> — **${firstName}**${t.order ? ` (${t.order})` : ""}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## All Testimonials (Table Format)");
  lines.push("");
  lines.push("| Quote | Customer | Category | Order |");
  lines.push("|-------|----------|----------|-------|");
  for (const t of unique) {
    const firstName = t.name.split(" ")[0];
    const cleanQuote = t.quote.replace(/\|/g, "-").slice(0, 80);
    lines.push(`| "${cleanQuote}" | ${firstName} | ${t.category} | ${t.order || "—"} |`);
  }

  lines.push("");
  lines.push("---");
  lines.push(`*Generated: ${new Date().toISOString().split("T")[0]}*`);

  const md = lines.join("\n");

  // Ensure docs directory exists
  if (!fs.existsSync("docs")) {
    fs.mkdirSync("docs");
  }

  fs.writeFileSync("docs/testimonials.md", md);
  console.log(`Saved ${unique.length} testimonials to docs/testimonials.md`);
}

main().catch((e) => console.error("Error:", e.message));
