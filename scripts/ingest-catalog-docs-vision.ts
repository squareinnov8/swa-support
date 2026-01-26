/**
 * Ingest Product Catalog Documentation using Claude Vision
 *
 * Converts PDF installation guides to images and uses Claude's vision
 * to extract actual installation instructions.
 *
 * Run with: npx tsx scripts/ingest-catalog-docs-vision.ts
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!openaiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

// Path to catalog-refresh project
const CATALOG_PATH = "/Users/robertramsay/projects/catalog-refresh";
const ASSETS_PATH = path.join(CATALOG_PATH, "data/assets");

interface IngestStats {
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse make/model/year from folder name
 * Format: Make-Model-Years-SKU (e.g., "Infiniti-Q50_Q60-2014-2019-801A")
 */
function parseFolderName(folderName: string): {
  make: string;
  model: string;
  years: string;
  sku: string;
} {
  const parts = folderName.split("-");
  if (parts.length < 3) {
    return { make: "", model: "", years: "", sku: "" };
  }

  const make = parts[0].replace(/_/g, " ");

  // Find where years start (4-digit number)
  let modelParts: string[] = [];
  let yearsStart = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{4}$/.test(parts[i])) {
      yearsStart = i;
      break;
    }
    modelParts.push(parts[i]);
  }

  const model = modelParts.join(" ").replace(/_/g, " ");

  // Years are typically 2 consecutive 4-digit numbers or a range
  let years = "";
  let skuStart = yearsStart;
  if (yearsStart > 0 && yearsStart < parts.length) {
    if (yearsStart + 1 < parts.length && /^\d{4}$/.test(parts[yearsStart + 1])) {
      years = `${parts[yearsStart]}-${parts[yearsStart + 1]}`;
      skuStart = yearsStart + 2;
    } else {
      years = parts[yearsStart];
      skuStart = yearsStart + 1;
    }
  }

  const sku = parts.slice(skuStart).join("-");

  return { make, model, years, sku };
}

/**
 * Convert PDF to base64 images using pdf-to-img
 */
async function pdfToImages(pdfPath: string): Promise<string[]> {
  // Dynamic import for ESM module
  const { pdf } = await import("pdf-to-img");

  const images: string[] = [];
  const document = await pdf(pdfPath, { scale: 2 }); // scale 2 for better readability

  let pageNum = 0;
  for await (const image of document) {
    pageNum++;
    // Convert buffer to base64
    const base64 = Buffer.from(image).toString("base64");
    images.push(base64);

    // Limit to first 6 pages to control costs
    if (pageNum >= 6) break;
  }

  return images;
}

/**
 * Use GPT-4o Vision to extract installation instructions from PDF images
 */
async function extractInstructionsWithVision(
  images: string[],
  vehicleInfo: { make: string; model: string; years: string; sku: string }
): Promise<string> {
  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = images.map((base64) => ({
    type: "image_url",
    image_url: {
      url: `data:image/png;base64,${base64}`,
      detail: "high",
    },
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `These are pages from an installation guide for a ${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.years}) G-Series head unit (SKU: ${vehicleInfo.sku}).

Please extract and summarize the installation instructions in a clear, structured format. Include:

1. **Tools Required** - List any tools mentioned or visible
2. **Pre-Installation Notes** - Any warnings, prerequisites, or preparation steps
3. **Removal Steps** - How to remove the factory unit/trim pieces
4. **Installation Steps** - How to install the new unit
5. **Wiring/Connections** - Any wiring details or connector information
6. **Post-Installation** - Testing, reassembly, or final steps
7. **Tips & Warnings** - Any important notes, common issues, or safety warnings

Format the response in Markdown. If certain sections aren't covered in the images, note that. Focus on extracting actionable installation information that would help a customer or support agent.`,
          },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content || "";
}

/**
 * Create KB article with extracted installation instructions
 */
async function createInstallGuideArticle(
  folderName: string,
  instructions: string,
  imageCount: number
): Promise<boolean> {
  const { make, model, years, sku } = parseFolderName(folderName);

  if (!make || !model) {
    console.warn(`Could not parse folder name: ${folderName}`);
    return false;
  }

  const title = `Installation Guide: ${make} ${model} (${years})`;

  // Check if article already exists
  const { data: existing } = await supabase
    .from("kb_docs")
    .select("id")
    .eq("title", title)
    .maybeSingle();

  if (existing) {
    console.log(`  Skipping (exists): ${title}`);
    return false;
  }

  // Build article content
  let content = `# ${title}\n\n`;
  content += `**Vehicle:** ${make} ${model}\n`;
  content += `**Years:** ${years}\n`;
  content += `**Product SKU:** ${sku}\n`;
  content += `**Product:** G-Series Head Unit\n\n`;
  content += instructions;

  if (imageCount > 0) {
    content += `\n\n---\n*This guide includes ${imageCount} reference images in the original documentation.*`;
  }

  // Create the KB doc
  const { data: doc, error } = await supabase
    .from("kb_docs")
    .insert({
      title,
      body: content,
      source: "manual",
      metadata: {
        type: "installation_guide",
        make,
        model,
        years,
        sku,
        asset_folder: folderName,
        image_count: imageCount,
        extracted_via: "claude-vision",
        imported_from: "catalog-refresh",
      },
    })
    .select()
    .single();

  if (error) {
    console.error(`Error creating article ${title}:`, error.message);
    return false;
  }

  console.log(`  Created: ${title} (${doc.id})`);
  return true;
}

/**
 * Main ingestion function
 */
async function ingestWithVision(): Promise<IngestStats> {
  const stats: IngestStats = {
    processed: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  console.log("=== Ingesting Installation Guides with Claude Vision ===\n");

  const assetFolders = fs.readdirSync(ASSETS_PATH).filter((f) => {
    const fullPath = path.join(ASSETS_PATH, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith(".");
  });

  console.log(`Found ${assetFolders.length} asset folders\n`);

  for (const folder of assetFolders) {
    const folderPath = path.join(ASSETS_PATH, folder);
    const guidesPath = path.join(folderPath, "guides");
    const imagesPath = path.join(folderPath, "images");

    // Skip if no guides folder
    if (!fs.existsSync(guidesPath)) {
      continue;
    }

    const pdfFiles = fs.readdirSync(guidesPath).filter((f) => f.endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      continue;
    }

    // Get image count for reference
    let imageCount = 0;
    if (fs.existsSync(imagesPath)) {
      imageCount = fs.readdirSync(imagesPath).filter((f) =>
        /\.(jpg|jpeg|png|gif)$/i.test(f)
      ).length;
    }

    // Check if article already exists
    const { make, model, years } = parseFolderName(folder);
    if (!make || !model) {
      console.log(`Skipping (can't parse): ${folder}`);
      continue;
    }

    const title = `Installation Guide: ${make} ${model} (${years})`;
    const { data: existing } = await supabase
      .from("kb_docs")
      .select("id")
      .eq("title", title)
      .maybeSingle();

    if (existing) {
      console.log(`Skipping (exists): ${folder}`);
      stats.skipped++;
      continue;
    }

    // Process first PDF (usually the main guide)
    const pdfPath = path.join(guidesPath, pdfFiles[0]);
    console.log(`Processing: ${folder}`);
    console.log(`  PDF: ${pdfFiles[0]}`);

    try {
      // Convert PDF to images
      console.log("  Converting PDF to images...");
      const images = await pdfToImages(pdfPath);
      console.log(`  Got ${images.length} page images`);

      if (images.length === 0) {
        console.log("  No images extracted, skipping");
        stats.errors.push(`${folder}: No images extracted from PDF`);
        continue;
      }

      // Extract instructions with Claude Vision
      console.log("  Extracting instructions with Claude Vision...");
      const instructions = await extractInstructionsWithVision(images, {
        make,
        model,
        years,
        sku: parseFolderName(folder).sku,
      });

      if (!instructions || instructions.length < 200) {
        console.log("  Insufficient content extracted, skipping");
        stats.errors.push(`${folder}: Insufficient content extracted`);
        continue;
      }

      console.log(`  Extracted ${instructions.length} chars of instructions`);

      // Create the KB article
      const created = await createInstallGuideArticle(folder, instructions, imageCount);
      if (created) {
        stats.created++;
      }

      stats.processed++;

      // Rate limiting - wait between API calls
      await new Promise((resolve) => setTimeout(resolve, 1000));

    } catch (error) {
      const errMsg = `${folder}: ${error}`;
      console.error(`  Error: ${errMsg}`);
      stats.errors.push(errMsg);
    }
  }

  return stats;
}

// Main execution
async function main() {
  // Check for --test flag to only process first 3
  const testMode = process.argv.includes("--test");

  if (testMode) {
    console.log("=== TEST MODE: Processing first 3 folders only ===\n");
  }

  const stats = await ingestWithVision();

  console.log("\n=== Ingestion Complete ===\n");
  console.log(`Processed: ${stats.processed}`);
  console.log(`Created: ${stats.created}`);
  console.log(`Skipped (existing): ${stats.skipped}`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of stats.errors) {
      console.log(`  - ${error}`);
    }
  }

  console.log("\nRun: npm run embed:kb to generate embeddings");
}

main().catch(console.error);
