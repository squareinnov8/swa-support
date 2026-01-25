/**
 * External Trend Signals
 *
 * Fetches trending topics from external sources to complement internal support data.
 * Currently supports web search for trend discovery. Can be extended with APIs for:
 * - Google Trends
 * - YouTube Data API (already have YOUTUBE_API_KEY)
 * - Reddit API
 * - Twitter/X API
 */

import { supabase } from "@/lib/db";

export interface TrendSignal {
  source: "google_trends" | "youtube" | "reddit" | "internal";
  topic: string;
  description: string;
  score: number;
  relatedTerms?: string[];
  url?: string;
  fetchedAt: Date;
}

/**
 * Core product/brand keywords to track trends for
 */
const TRACKED_KEYWORDS = [
  // Products
  "APEX tune",
  "G-Series ECU",
  "ECU tuning",
  "performance tune",
  "car tuning",
  // Vehicles (top supported makes)
  "Infiniti Q50 tune",
  "Infiniti Q60 tune",
  "Nissan 370Z tune",
  "Nissan GTR tune",
  // General automotive performance
  "dyno results",
  "HP gains",
  "turbo upgrade",
  "fuel economy tune",
];

/**
 * Get YouTube trending videos in automotive performance category
 * Requires YOUTUBE_API_KEY environment variable
 */
export async function getYouTubeTrends(): Promise<TrendSignal[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log("[TrendSignals] YouTube API not configured");
    return [];
  }

  const signals: TrendSignal[] = [];

  try {
    // Search for recent popular videos about ECU tuning
    const searchTerms = ["ECU tuning 2026", "car tune review", "performance tune results"];

    for (const term of searchTerms) {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
          new URLSearchParams({
            part: "snippet",
            q: term,
            type: "video",
            order: "viewCount",
            publishedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            maxResults: "5",
            key: apiKey,
          })
      );

      if (!response.ok) {
        console.error(`[TrendSignals] YouTube API error: ${response.status}`);
        continue;
      }

      const data = await response.json();

      for (const item of data.items || []) {
        const title = item.snippet?.title || "";
        const description = item.snippet?.description || "";

        // Check if relevant to our products
        const isRelevant = TRACKED_KEYWORDS.some(
          (kw) =>
            title.toLowerCase().includes(kw.toLowerCase()) ||
            description.toLowerCase().includes(kw.toLowerCase())
        );

        if (isRelevant) {
          signals.push({
            source: "youtube",
            topic: title,
            description: description.slice(0, 200),
            score: 0.8,
            url: `https://youtube.com/watch?v=${item.id?.videoId}`,
            fetchedAt: new Date(),
          });
        }
      }
    }

    // Deduplicate by title similarity
    const uniqueSignals = signals.filter(
      (signal, index, self) =>
        index === self.findIndex((s) => s.topic.toLowerCase() === signal.topic.toLowerCase())
    );

    return uniqueSignals.slice(0, 10);
  } catch (error) {
    console.error("[TrendSignals] YouTube fetch error:", error);
    return [];
  }
}

/**
 * Get related search trends from internal data
 * Analyzes what customers are searching/asking about
 */
export async function getInternalTrends(
  daysBack: number = 14
): Promise<TrendSignal[]> {
  const signals: TrendSignal[] = [];

  try {
    // Get trending intents from our own data
    const { data: trendingIntents } = await supabase.rpc("get_trending_intents", {
      recent_days: daysBack,
      baseline_days: daysBack * 4,
    });

    if (trendingIntents) {
      for (const intent of trendingIntents) {
        signals.push({
          source: "internal",
          topic: intent.intent_name || intent.intent_slug,
          description: `${intent.recent_count} customer queries (${intent.trend_score.toFixed(1)}x trend)`,
          score: Math.min(intent.trend_score / 5, 1),
          relatedTerms: intent.sample_subjects?.slice(0, 3),
          fetchedAt: new Date(),
        });
      }
    }

    // Get popular product mentions
    const { data: productTopics } = await supabase.rpc("get_popular_product_topics", {
      days_back: daysBack,
    });

    if (productTopics) {
      for (const product of productTopics) {
        signals.push({
          source: "internal",
          topic: `Product: ${product.product_title}`,
          description: `${product.mention_count} customer inquiries`,
          score: Math.min(product.mention_count / 20, 1),
          relatedTerms: product.sample_questions?.slice(0, 3),
          fetchedAt: new Date(),
        });
      }
    }

    return signals;
  } catch (error) {
    console.error("[TrendSignals] Internal trends error:", error);
    return [];
  }
}

/**
 * Combine all trend signals and rank by relevance
 */
export async function getAllTrendSignals(options?: {
  includeYouTube?: boolean;
  daysBack?: number;
}): Promise<TrendSignal[]> {
  const { includeYouTube = true, daysBack = 14 } = options || {};

  const allSignals: TrendSignal[] = [];

  // Always get internal trends
  const internalTrends = await getInternalTrends(daysBack);
  allSignals.push(...internalTrends);

  // Optionally get YouTube trends
  if (includeYouTube && process.env.YOUTUBE_API_KEY) {
    const youtubeTrends = await getYouTubeTrends();
    allSignals.push(...youtubeTrends);
  }

  // Sort by score
  allSignals.sort((a, b) => b.score - a.score);

  return allSignals;
}

/**
 * Generate content ideas from trend signals
 */
export function generateContentIdeas(signals: TrendSignal[]): Array<{
  title: string;
  angle: string;
  hooks: string[];
  sources: string[];
}> {
  const ideas: Array<{
    title: string;
    angle: string;
    hooks: string[];
    sources: string[];
  }> = [];

  // Group signals by topic similarity
  const topSignals = signals.slice(0, 10);

  for (const signal of topSignals) {
    const hooks: string[] = [];

    // Generate hooks based on source
    if (signal.source === "youtube") {
      hooks.push(
        `Everyone's watching this: ${signal.topic.slice(0, 40)}`,
        "Here's our take on what's trending",
        "The video everyone's talking about..."
      );
    } else if (signal.source === "internal") {
      hooks.push(
        `The #1 question we're getting right now`,
        `${signal.description} - let's break it down`,
        "You asked, we're answering"
      );
    }

    ideas.push({
      title: signal.topic,
      angle:
        signal.source === "internal"
          ? "FAQ/Support-driven"
          : "Trend-riding",
      hooks,
      sources: [signal.source],
    });
  }

  return ideas;
}

/**
 * Save trend signals to database for analysis
 */
export async function saveTrendSignals(signals: TrendSignal[]): Promise<number> {
  let saved = 0;

  for (const signal of signals) {
    const { error } = await supabase.from("reel_topic_recommendations").insert({
      topic_type: "external_trend",
      title: signal.topic,
      description: signal.description,
      hook_ideas: [],
      source_data: {
        source: signal.source,
        relatedTerms: signal.relatedTerms,
        url: signal.url,
      },
      relevance_score: signal.score,
      status: "pending",
    });

    if (!error) saved++;
  }

  return saved;
}
