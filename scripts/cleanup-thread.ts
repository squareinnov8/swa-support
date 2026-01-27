import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  const threadId = 'fcf98a2a-6b5c-4678-84a2-0a4991ff81b3';

  console.log('=== CLEANING UP DUPLICATE MESSAGES ===\n');

  // Get all messages with their gmail_message_id
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, direction, from_email, created_at, channel_metadata, body_text')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error || !messages) {
    console.error('Error fetching messages:', error?.message);
    return;
  }

  // Group by gmail_message_id
  const byGmailId: Record<string, typeof messages> = {};

  for (const msg of messages) {
    const metadata = msg.channel_metadata as Record<string, unknown> | null;
    const gmailId = (metadata?.gmail_message_id as string) || 'NO_ID';
    if (!byGmailId[gmailId]) {
      byGmailId[gmailId] = [];
    }
    byGmailId[gmailId].push(msg);
  }

  // Find duplicates and delete them
  const toDelete: string[] = [];
  const toKeep: string[] = [];

  for (const [gmailId, msgs] of Object.entries(byGmailId)) {
    if (msgs.length > 1) {
      console.log(`Gmail ID ${gmailId}: ${msgs.length} duplicates`);
      // Keep the first one, delete the rest
      toKeep.push(msgs[0].id);
      for (let i = 1; i < msgs.length; i++) {
        toDelete.push(msgs[i].id);
      }
    } else {
      toKeep.push(msgs[0].id);
    }
  }

  console.log(`\nKeeping ${toKeep.length} messages, deleting ${toDelete.length} duplicates`);

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('messages')
      .delete()
      .in('id', toDelete);

    if (deleteError) {
      console.error('Error deleting duplicates:', deleteError.message);
    } else {
      console.log(`Deleted ${toDelete.length} duplicate messages`);
    }
  }

  // Verify the cleanup
  const { data: remaining } = await supabase
    .from('messages')
    .select('id, direction, from_email, created_at, body_text')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('\n=== MESSAGES AFTER CLEANUP ===');
  for (const msg of remaining || []) {
    console.log(`${msg.direction}: ${msg.from_email} at ${msg.created_at}`);
    console.log(`  Body preview: ${msg.body_text?.substring(0, 100)}...`);
  }
}

main();
