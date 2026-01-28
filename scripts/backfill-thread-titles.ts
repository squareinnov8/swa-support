/**
 * Backfill thread titles for existing threads
 *
 * Usage: npx tsx scripts/backfill-thread-titles.ts [limit]
 */

import 'dotenv/config';
import { backfillThreadTitles } from '../src/lib/llm/titleGenerator';

async function main() {
  const limit = parseInt(process.argv[2] || '50', 10);

  console.log(`Backfilling titles for up to ${limit} threads...`);

  const count = await backfillThreadTitles(limit);

  console.log(`Generated titles for ${count} threads.`);
}

main().catch(console.error);
