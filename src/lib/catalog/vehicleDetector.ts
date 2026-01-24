/**
 * Vehicle Detection
 *
 * Extract vehicle information from customer messages for catalog lookup.
 *
 * As of Jan 2026, this uses LLM for accurate vehicle extraction across
 * languages and phrasings, with basic year regex as fallback.
 */

import { isLLMConfigured, getClient } from "@/lib/llm/client";

/**
 * Detected vehicle info
 */
export type DetectedVehicle = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  confidence: number;
};

/**
 * Detect vehicle information from text using LLM.
 * Falls back to basic year extraction if LLM is unavailable.
 *
 * @param text - The text to analyze
 * @returns Detected vehicle info with confidence score
 */
export async function detectVehicle(text: string): Promise<DetectedVehicle> {
  if (!text || text.trim().length === 0) {
    return { year: null, make: null, model: null, trim: null, confidence: 0 };
  }

  // Try LLM-based detection first
  if (isLLMConfigured()) {
    try {
      return await detectVehicleWithLLM(text);
    } catch (error) {
      console.warn("[VehicleDetector] LLM detection failed, using fallback:", error);
    }
  }

  // Fallback to basic year extraction only
  return detectVehicleFallback(text);
}

/**
 * LLM-based vehicle detection - understands context and works in any language
 */
async function detectVehicleWithLLM(text: string): Promise<DetectedVehicle> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `Extract vehicle information from customer messages for an automotive parts company.

Return a JSON object with these fields:
- year: number or null (vehicle model year, e.g., 2019)
- make: string or null (manufacturer, e.g., "Infiniti", "Toyota", "BMW")
- model: string or null (model name, e.g., "Q50", "Camry", "Model S")
- trim: string or null (trim level if mentioned, e.g., "Red Sport", "Premium", "SR5")
- confidence: number 0-1 (how confident you are in the extraction)

Guidelines:
- Normalize make names to proper case (e.g., "infiniti" → "Infiniti", "bmw" → "BMW")
- Model names should be uppercase or proper case as conventionally written
- If a customer mentions a product type without a vehicle (e.g., "tesla screen"), that's NOT a vehicle - return nulls
- A "Tesla screen" is a product, "Model 3" is a Tesla vehicle
- Set confidence based on how much info is present:
  - Year + Make + Model = 0.9-1.0
  - Make + Model = 0.7-0.8
  - Year + Make OR Just Model with known make = 0.5-0.6
  - Just year or unclear = 0.2-0.4
  - No vehicle info = 0

Return ONLY valid JSON, no other text.`,
      },
      {
        role: "user",
        content: text,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { year: null, make: null, model: null, trim: null, confidence: 0 };
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { year: null, make: null, model: null, trim: null, confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and normalize the response
    const year = typeof parsed.year === "number" && parsed.year >= 1990 && parsed.year <= 2035
      ? parsed.year
      : null;
    const make = typeof parsed.make === "string" && parsed.make.length > 0
      ? parsed.make.trim()
      : null;
    const model = typeof parsed.model === "string" && parsed.model.length > 0
      ? parsed.model.trim()
      : null;
    const trim = typeof parsed.trim === "string" && parsed.trim.length > 0
      ? parsed.trim.trim()
      : null;
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : calculateConfidence(year, make, model);

    return { year, make, model, trim, confidence };
  } catch {
    return { year: null, make: null, model: null, trim: null, confidence: 0 };
  }
}

/**
 * Calculate confidence based on what info is present
 */
function calculateConfidence(year: number | null, make: string | null, model: string | null): number {
  let confidence = 0;
  if (year) confidence += 0.3;
  if (make) confidence += 0.3;
  if (model) confidence += 0.3;
  return Math.min(confidence, 1.0);
}

/**
 * Simple fallback detection (no LLM required)
 * Only extracts year since that's reliably detected with regex
 */
function detectVehicleFallback(text: string): DetectedVehicle {
  // Extract year (4-digit number between 1990-2035)
  const yearMatch = text.match(/\b(19[9][0-9]|20[0-3][0-9])\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  return {
    year,
    make: null,
    model: null,
    trim: null,
    confidence: year ? 0.2 : 0,
  };
}

/**
 * Check if we have enough info for a catalog lookup
 */
export function canDoProductLookup(vehicle: DetectedVehicle): boolean {
  // Need at least a make to do a lookup
  return vehicle.make !== null && vehicle.confidence >= 0.3;
}
