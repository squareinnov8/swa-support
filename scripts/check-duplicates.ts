import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const threadId = 'fcf98a2a-6b5c-4678-84a2-0a4991ff81b3';

  // Get all messages with their gmail_message_id
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, direction, from_email, created_at, channel_metadata')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== MESSAGES WITH GMAIL IDs ===\n');

  const gmailIds: Record<string, number> = {};

  for (const msg of messages || []) {
    const metadata = msg.channel_metadata as Record<string, unknown> | null;
    const gmailId = metadata?.gmail_message_id as string | undefined;

    console.log('ID:', msg.id);
    console.log('Direction:', msg.direction);
    console.log('From:', msg.from_email);
    console.log('Created:', msg.created_at);
    console.log('Gmail ID:', gmailId || 'NONE');
    console.log('Synced from Gmail:', metadata?.synced_from_gmail || false);
    console.log('---');

    if (gmailId) {
      gmailIds[gmailId] = (gmailIds[gmailId] || 0) + 1;
    } else {
      gmailIds['NO_GMAIL_ID'] = (gmailIds['NO_GMAIL_ID'] || 0) + 1;
    }
  }

  console.log('\n=== DUPLICATE ANALYSIS ===');
  console.log('Gmail ID counts:');
  for (const [id, count] of Object.entries(gmailIds)) {
    console.log('  ', id + ':', count, count > 1 ? '⚠️ DUPLICATE!' : '');
  }

  // Check draft_generations table
  const { data: drafts } = await supabase
    .from('draft_generations')
    .select('id, thread_id, intent, created_at, was_sent')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('\n=== DRAFT GENERATIONS ===');
  for (const draft of drafts || []) {
    console.log('ID:', draft.id);
    console.log('Intent:', draft.intent);
    console.log('Created:', draft.created_at);
    console.log('Was Sent:', draft.was_sent);
    console.log('---');
  }
}

main();
