/**
 * Catalog Search API
 *
 * GET: Search products by vehicle or text query
 */

import { NextRequest, NextResponse } from "next/server";
import {
  findProductsByVehicle,
  searchProducts,
  getAvailableMakes,
  getAvailableModels,
  formatProductsForAgent,
} from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const year = searchParams.get("year");
  const make = searchParams.get("make");
  const model = searchParams.get("model");
  const query = searchParams.get("q");
  const format = searchParams.get("format"); // "agent" for formatted response

  try {
    // Vehicle-based search
    if (make) {
      const yearNum = year ? parseInt(year, 10) : null;

      if (yearNum && !isNaN(yearNum)) {
        const products = await findProductsByVehicle(yearNum, make, model ?? undefined);

        if (format === "agent") {
          return NextResponse.json({
            formatted: formatProductsForAgent(products),
            count: products.length,
          });
        }

        return NextResponse.json({ products });
      }

      // Just make provided - return available models
      const models = await getAvailableModels(make);
      return NextResponse.json({ make, models });
    }

    // Text search
    if (query) {
      const products = await searchProducts(query);
      return NextResponse.json({ products });
    }

    // No params - return available makes
    const makes = await getAvailableMakes();
    return NextResponse.json({ makes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Catalog search error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
