/**
 * Embedding Generation
 *
 * Uses OpenAI text-embedding-3-small for generating vector embeddings.
 * Dimensions: 1536 (matches kb_chunks.embedding column)
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Embedding model configuration
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for a single text
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  // Filter out empty texts and track indices
  const validTexts: { index: number; text: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]?.trim();
    if (text && text.length > 0) {
      validTexts.push({ index: i, text });
    }
  }

  if (validTexts.length === 0) {
    return texts.map(() => []);
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: validTexts.map((v) => v.text),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  // Map results back to original indices
  const result: number[][] = texts.map(() => []);
  for (let i = 0; i < response.data.length; i++) {
    const originalIndex = validTexts[i].index;
    result[originalIndex] = response.data[i].embedding;
  }

  return result;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Format embedding for PostgreSQL vector type
 * PostgreSQL pgvector expects format: [0.1, 0.2, ...]
 */
export function formatEmbeddingForPg(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Check if OpenAI is configured
 */
export function isEmbeddingConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
