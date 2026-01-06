/**
 * HubSpot Email Insights Admin API
 *
 * Import emails, extract instructions, identify KB gaps, and generate eval cases.
 */

import { NextRequest, NextResponse } from "next/server";
import { isHubSpotConfigured } from "@/lib/hubspot";
import {
  importHubSpotEmails,
  getImportStats,
  runAllExtractors,
  extractInstructions,
  identifyKBGaps,
  extractEscalationPatterns,
  generateEvalTestCases,
  getEvalStats,
} from "@/lib/hubspot/insights";
import { supabase } from "@/lib/db";

/**
 * GET - Get insights status and statistics
 *
 * Query params:
 * - stats=true - Return overall statistics
 * - instructions - List extracted instructions (with optional status filter)
 * - kb_gaps - List KB gap candidates
 * - escalation_patterns - List escalation patterns
 * - eval_cases - List eval test cases
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const stats = searchParams.get("stats");
  const instructions = searchParams.get("instructions");
  const kbGaps = searchParams.get("kb_gaps");
  const escalationPatterns = searchParams.get("escalation_patterns");
  const evalCases = searchParams.get("eval_cases");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "50");

  // Return overall stats
  if (stats === "true") {
    const [importStats, evalStats] = await Promise.all([
      getImportStats(),
      getEvalStats(),
    ]);

    // Get instruction stats
    const { data: instructionRows } = await supabase
      .from("extracted_instructions")
      .select("instruction_type, status");

    const instructionStats = {
      total: instructionRows?.length || 0,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    for (const i of instructionRows || []) {
      instructionStats.byType[i.instruction_type] =
        (instructionStats.byType[i.instruction_type] || 0) + 1;
      instructionStats.byStatus[i.status] =
        (instructionStats.byStatus[i.status] || 0) + 1;
    }

    // Get KB gap stats
    const { data: gapRows } = await supabase
      .from("kb_gap_candidates")
      .select("topic, gap_severity, status");

    const gapStats = {
      total: gapRows?.length || 0,
      bySeverity: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
    };

    for (const g of gapRows || []) {
      gapStats.bySeverity[g.gap_severity] =
        (gapStats.bySeverity[g.gap_severity] || 0) + 1;
      gapStats.byStatus[g.status] = (gapStats.byStatus[g.status] || 0) + 1;
    }

    // Get escalation pattern stats
    const { data: patternRows } = await supabase
      .from("escalation_patterns")
      .select("pattern_type, rule_implemented");

    const patternStats = {
      total: patternRows?.length || 0,
      byType: {} as Record<string, number>,
      implemented: patternRows?.filter((p) => p.rule_implemented).length || 0,
    };

    for (const p of patternRows || []) {
      patternStats.byType[p.pattern_type] =
        (patternStats.byType[p.pattern_type] || 0) + 1;
    }

    // Get recent import runs
    const { data: recentRuns } = await supabase
      .from("hubspot_import_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      configured: isHubSpotConfigured(),
      emails: importStats,
      instructions: instructionStats,
      kbGaps: gapStats,
      escalationPatterns: patternStats,
      evalCases: evalStats,
      recentRuns,
    });
  }

  // List extracted instructions
  if (instructions !== null) {
    let query = supabase
      .from("extracted_instructions")
      .select(
        `
        id,
        instruction_text,
        instruction_type,
        applies_to,
        keywords,
        status,
        implemented_in,
        reviewed_by,
        reviewed_at,
        notes,
        created_at,
        email:hubspot_emails (
          subject,
          from_email,
          email_date
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ instructions: data });
  }

  // List KB gaps
  if (kbGaps !== null) {
    let query = supabase
      .from("kb_gap_candidates")
      .select(
        `
        id,
        question_text,
        topic,
        subtopic,
        gap_severity,
        status,
        resolution_notes,
        created_at,
        email:hubspot_emails (
          subject,
          from_email,
          email_date
        )
      `
      )
      .order("gap_severity", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ kbGaps: data });
  }

  // List escalation patterns
  if (escalationPatterns !== null) {
    const { data, error } = await supabase
      .from("escalation_patterns")
      .select(
        `
        id,
        pattern_type,
        trigger_description,
        original_escalation_reason,
        rob_feedback,
        suggested_rule,
        rule_implemented,
        created_at,
        email:hubspot_emails (
          subject,
          email_date
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ escalationPatterns: data });
  }

  // List eval test cases
  if (evalCases !== null) {
    const { data, error } = await supabase
      .from("eval_test_cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ evalCases: data });
  }

  return NextResponse.json(
    {
      error:
        "Provide a query param: ?stats=true, ?instructions, ?kb_gaps, ?escalation_patterns, or ?eval_cases",
    },
    { status: 400 }
  );
}

/**
 * POST - Trigger import and extraction operations
 *
 * Body:
 * - action: "import" | "extract" | "extract_instructions" | "identify_gaps" |
 *           "extract_escalation" | "generate_eval" | "full_pipeline"
 * - limit: (optional) Max emails to import
 */
export async function POST(request: NextRequest) {
  if (!isHubSpotConfigured()) {
    return NextResponse.json(
      {
        error: "HubSpot not configured",
        hint: "Add HUBSPOT_ACCESS_TOKEN to your .env file",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { action, limit } = body;

    switch (action) {
      case "import": {
        const result = await importHubSpotEmails({ limit });
        return NextResponse.json({
          success: result.success,
          action: "import",
          stats: result.stats,
          run_id: result.run_id,
          error: result.error,
        });
      }

      case "extract":
      case "extract_all": {
        const result = await runAllExtractors();
        return NextResponse.json({
          success: true,
          action: "extract_all",
          results: result,
        });
      }

      case "extract_instructions": {
        const result = await extractInstructions();
        return NextResponse.json({
          success: true,
          action: "extract_instructions",
          extracted: result.extracted,
          errors: result.errors,
        });
      }

      case "identify_gaps": {
        const result = await identifyKBGaps();
        return NextResponse.json({
          success: true,
          action: "identify_gaps",
          identified: result.identified,
          errors: result.errors,
        });
      }

      case "extract_escalation": {
        const result = await extractEscalationPatterns();
        return NextResponse.json({
          success: true,
          action: "extract_escalation",
          found: result.found,
          errors: result.errors,
        });
      }

      case "generate_eval": {
        const result = await generateEvalTestCases();
        return NextResponse.json({
          success: true,
          action: "generate_eval",
          created: result.created,
          errors: result.errors,
        });
      }

      case "full_pipeline": {
        // Run the full pipeline: import -> extract all -> generate eval
        const importResult = await importHubSpotEmails({ limit });
        const extractResult = await runAllExtractors();
        const evalResult = await generateEvalTestCases();

        return NextResponse.json({
          success: true,
          action: "full_pipeline",
          import: importResult.stats,
          extract: extractResult,
          eval: { created: evalResult.created, errors: evalResult.errors },
        });
      }

      default:
        return NextResponse.json(
          {
            error: "Invalid action",
            validActions: [
              "import",
              "extract",
              "extract_instructions",
              "identify_gaps",
              "extract_escalation",
              "generate_eval",
              "full_pipeline",
            ],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Insights API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update instruction/gap status
 *
 * Body:
 * - type: "instruction" | "kb_gap" | "escalation_pattern"
 * - id: Item ID
 * - status: New status
 * - notes: Optional notes
 * - implemented_in: (instructions only) Where implemented
 * - rule_implemented: (escalation_patterns only) Boolean
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, id, status, notes, implemented_in, rule_implemented } = body;

    if (!type || !id) {
      return NextResponse.json(
        { error: "type and id are required" },
        { status: 400 }
      );
    }

    switch (type) {
      case "instruction": {
        const updateData: Record<string, unknown> = {};
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;
        if (implemented_in) updateData.implemented_in = implemented_in;
        if (status === "approved" || status === "rejected") {
          updateData.reviewed_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from("extracted_instructions")
          .update(updateData)
          .eq("id", id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, type, id, updated: updateData });
      }

      case "kb_gap": {
        const updateData: Record<string, unknown> = {};
        if (status) updateData.status = status;
        if (notes !== undefined) updateData.resolution_notes = notes;
        if (
          status === "covered" ||
          status === "needs_article" ||
          status === "wont_cover"
        ) {
          updateData.resolved_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from("kb_gap_candidates")
          .update(updateData)
          .eq("id", id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, type, id, updated: updateData });
      }

      case "escalation_pattern": {
        const updateData: Record<string, unknown> = {};
        if (rule_implemented !== undefined)
          updateData.rule_implemented = rule_implemented;

        const { error } = await supabase
          .from("escalation_patterns")
          .update(updateData)
          .eq("id", id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, type, id, updated: updateData });
      }

      default:
        return NextResponse.json(
          {
            error: "Invalid type",
            validTypes: ["instruction", "kb_gap", "escalation_pattern"],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Insights PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
