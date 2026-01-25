/**
 * Reel Topic Recommendations API
 *
 * Provides content topic recommendations for social media reels based on
 * support data, trending questions, and resolved issues.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

interface TrendingIntent {
  intent_slug: string;
  intent_name: string;
  intent_category: string;
  recent_count: number;
  baseline_count: number;
  trend_score: number;
  avg_confidence: number;
  sample_subjects: string[];
}

interface QualityResolution {
  thread_id: string;
  subject: string;
  intent_slug: string;
  dialogue_summary: string;
  key_information: string[];
  troubleshooting_steps: string[];
  resolution_method: string;
  quality_score: number;
  resolved_at: string;
}

interface ProductTopic {
  product_id: string;
  product_title: string;
  product_type: string;
  mention_count: number;
  common_intents: string[];
  sample_questions: string[];
}

/**
 * GET - Get reel topic recommendations
 *
 * Query params:
 * - focus: trending | faq | product | troubleshooting | all (default: all)
 * - days: Number of days to analyze (default: 7)
 * - limit: Max recommendations (default: 10)
 * - status: Filter saved recommendations by status (pending | used | skipped)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const focus = searchParams.get("focus") || "all";
  const days = parseInt(searchParams.get("days") || "7");
  const limit = parseInt(searchParams.get("limit") || "10");
  const status = searchParams.get("status");

  // If status is provided, return saved recommendations
  if (status) {
    const { data, error } = await supabase
      .from("reel_topic_recommendations")
      .select("*")
      .eq("status", status)
      .order("relevance_score", { ascending: false })
      .order("generated_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ recommendations: data });
  }

  try {
    const recommendations: Array<{
      type: string;
      title: string;
      description: string;
      hooks: string[];
      score: number;
      data: Record<string, unknown>;
    }> = [];

    const baselineDays = Math.min(days * 4, 120);

    // 1. Get trending intents
    if (focus === "all" || focus === "trending" || focus === "faq") {
      const { data: trendingIntents, error: trendingError } = await supabase.rpc(
        "get_trending_intents",
        {
          recent_days: days,
          baseline_days: baselineDays,
        }
      );

      if (trendingError) {
        console.error("Trending intents error:", trendingError);
      } else if (trendingIntents) {
        for (const intent of (trendingIntents as TrendingIntent[]).slice(0, 5)) {
          recommendations.push({
            type: "trending_intent",
            title: formatIntentTitle(intent.intent_slug),
            description: `${intent.recent_count} questions in ${days} days (${intent.trend_score.toFixed(1)}x trend)`,
            hooks: generateIntentHooks(intent.intent_slug, intent.sample_subjects),
            score: intent.trend_score,
            data: {
              intentSlug: intent.intent_slug,
              category: intent.intent_category,
              recentCount: intent.recent_count,
              baselineCount: intent.baseline_count,
              avgConfidence: intent.avg_confidence,
              sampleSubjects: intent.sample_subjects,
            },
          });
        }
      }
    }

    // 2. Get quality resolutions for storytelling
    if (focus === "all" || focus === "troubleshooting") {
      const { data: qualityResolutions, error: resolutionError } = await supabase.rpc(
        "get_quality_resolutions",
        {
          days_back: Math.max(days, 30),
          min_quality: 0.7,
        }
      );

      if (resolutionError) {
        console.error("Quality resolutions error:", resolutionError);
      } else if (qualityResolutions) {
        for (const resolution of (qualityResolutions as QualityResolution[]).slice(0, 5)) {
          recommendations.push({
            type: "quality_resolution",
            title: `Story: ${resolution.subject || "Customer Success"}`,
            description: resolution.dialogue_summary || "Well-resolved customer issue",
            hooks: [
              `Customer asked: "${(resolution.subject || "").slice(0, 40)}..."`,
              resolution.troubleshooting_steps?.length
                ? `${resolution.troubleshooting_steps.length} steps to fix this`
                : "Here's how we solved it",
              "This fix surprised everyone...",
            ],
            score: resolution.quality_score,
            data: {
              threadId: resolution.thread_id,
              intent: resolution.intent_slug,
              keyInfo: resolution.key_information,
              steps: resolution.troubleshooting_steps,
              resolution: resolution.resolution_method,
            },
          });
        }
      }
    }

    // 3. Get popular product topics
    if (focus === "all" || focus === "product") {
      const { data: productTopics, error: productError } = await supabase.rpc(
        "get_popular_product_topics",
        {
          days_back: Math.max(days, 30),
        }
      );

      if (productError) {
        console.error("Product topics error:", productError);
      } else if (productTopics) {
        for (const product of (productTopics as ProductTopic[]).slice(0, 5)) {
          recommendations.push({
            type: "product_highlight",
            title: `Product: ${product.product_title}`,
            description: `${product.mention_count} inquiries`,
            hooks: [
              `Everything about ${product.product_title}`,
              `Is ${product.product_title} right for you?`,
              `${product.product_title} FAQ answered`,
            ],
            score: product.mention_count,
            data: {
              productId: product.product_id,
              productType: product.product_type,
              commonIntents: product.common_intents,
              sampleQuestions: product.sample_questions,
            },
          });
        }
      }
    }

    // 4. Add evergreen suggestions if not enough data
    if (recommendations.length < 5) {
      recommendations.push(
        {
          type: "evergreen",
          title: "Before & After Results",
          description: "Customer transformation stories with performance gains",
          hooks: [
            "+[X] HP with one mod",
            "Before vs After: Watch this",
            "Real results from real customers",
          ],
          score: 0.8,
          data: { category: "results" },
        },
        {
          type: "evergreen",
          title: "Common Mistakes",
          description: "Educational content about installation or tuning errors",
          hooks: [
            "STOP! Don't make this mistake",
            "3 things that void your warranty",
            "The error 90% of tuners make",
          ],
          score: 0.75,
          data: { category: "education" },
        },
        {
          type: "evergreen",
          title: "Quick Tips",
          description: "Bite-sized tips that provide immediate value",
          hooks: [
            "30 seconds to better performance",
            "Pro tip your tuner won't tell you",
            "One setting. Big difference.",
          ],
          score: 0.7,
          data: { category: "tips" },
        }
      );
    }

    // Sort by score and limit
    recommendations.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      recommendations: recommendations.slice(0, limit),
      meta: {
        focus,
        daysAnalyzed: days,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Reel recommendations error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * POST - Generate and save recommendations
 *
 * Body:
 * - focus: trending | faq | product | troubleshooting | all
 * - days: Number of days to analyze
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { focus = "all", days = 7 } = body;

    // Use GET logic to generate recommendations
    const url = new URL(request.url);
    url.searchParams.set("focus", focus);
    url.searchParams.set("days", days.toString());

    const getRequest = new NextRequest(url);
    const response = await GET(getRequest);
    const data = await response.json();

    if (!data.recommendations) {
      return NextResponse.json(
        { error: "Failed to generate recommendations" },
        { status: 500 }
      );
    }

    // Save to database
    const savedIds: string[] = [];
    for (const rec of data.recommendations) {
      const { data: saved, error } = await supabase
        .from("reel_topic_recommendations")
        .insert({
          topic_type: rec.type,
          title: rec.title,
          description: rec.description,
          hook_ideas: rec.hooks,
          source_data: rec.data,
          relevance_score: Math.min(rec.score / 10, 1),
          status: "pending",
        })
        .select("id")
        .single();

      if (!error && saved) {
        savedIds.push(saved.id);
      }
    }

    return NextResponse.json({
      success: true,
      saved: savedIds.length,
      recommendations: data.recommendations,
    });
  } catch (error) {
    console.error("Save recommendations error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update recommendation status
 *
 * Body:
 * - id: Recommendation ID
 * - status: pending | used | skipped
 * - notes: Optional notes
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, notes } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };
    if (notes !== undefined) updateData.notes = notes;
    if (status === "used") updateData.used_at = new Date().toISOString();

    const { error } = await supabase
      .from("reel_topic_recommendations")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id, status });
  } catch (error) {
    console.error("Update recommendation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

// Helper functions

function formatIntentTitle(slug: string): string {
  const titleMap: Record<string, string> = {
    PRODUCT_SUPPORT: "Product Support Questions",
    COMPATIBILITY_QUESTION: "Compatibility Questions",
    FIRMWARE_UPDATE_REQUEST: "Firmware Updates",
    FIRMWARE_ACCESS_ISSUE: "Firmware Access Issues",
    ORDER_STATUS: "Order Status",
    INSTALL_GUIDANCE: "Installation Help",
    PART_IDENTIFICATION: "Part Identification",
    FUNCTIONALITY_BUG: "Bug Reports",
    DOCS_VIDEO_MISMATCH: "Documentation Questions",
    RETURN_REFUND_REQUEST: "Returns/Refunds",
    MISSING_DAMAGED_ITEM: "Missing/Damaged Items",
  };
  return (
    titleMap[slug] ||
    slug
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function generateIntentHooks(slug: string, sampleSubjects: string[] | null): string[] {
  const intentHooks: Record<string, string[]> = {
    COMPATIBILITY_QUESTION: [
      "Will it fit YOUR car?",
      "Check this BEFORE you buy",
      "Compatibility 101",
    ],
    FIRMWARE_UPDATE_REQUEST: [
      "Is your tune outdated?",
      "Firmware update guide",
      "What's new in the latest update",
    ],
    INSTALL_GUIDANCE: [
      "Don't skip this step!",
      "5-minute install guide",
      "Avoid these install mistakes",
    ],
    PRODUCT_SUPPORT: [
      "Fix this in 60 seconds",
      "The #1 support question answered",
      "Try this before contacting support",
    ],
  };

  const hooks = intentHooks[slug] || [
    "Your questions answered",
    "Here's what you need to know",
    "Let me explain...",
  ];

  // Add hook from sample subject if available
  if (sampleSubjects?.[0] && sampleSubjects[0].length < 60) {
    hooks.push(`"${sampleSubjects[0]}" - answered`);
  }

  return hooks.slice(0, 3);
}
