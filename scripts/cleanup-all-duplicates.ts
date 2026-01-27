import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function main() {
  console.log('=== CLEANING UP ALL DUPLICATE MESSAGES ===\n');

  // Find all duplicate gmail_message_ids
  const { data: duplicates, error } = await supabase.rpc('find_duplicate_gmail_messages');

  if (error) {
    console.log('RPC not available, using raw query approach...');

    // Get all messages with gmail_message_id
    const { data: messages } = await supabase
      .from('messages')
      .select('id, thread_id, created_at, channel_metadata')
      .not('channel_metadata', 'is', null)
      .order('created_at', { ascending: true });

    if (!messages) {
      console.error('Failed to fetch messages');
      return;
    }

    // Group by gmail_message_id
    const byGmailId: Map<string, Array<{id: string; thread_id: string; created_at: string}>> = new Map();

    for (const msg of messages) {
      const metadata = msg.channel_metadata as Record<string, unknown> | null;
      const gmailId = metadata?.gmail_message_id as string | undefined;

      if (gmailId) {
        if (!byGmailId.has(gmailId)) {
          byGmailId.set(gmailId, []);
        }
        byGmailId.get(gmailId)!.push({
          id: msg.id,
          thread_id: msg.thread_id,
          created_at: msg.created_at
        });
      }
    }

    // Find duplicates and delete them
    let totalDeleted = 0;
    const toDelete: string[] = [];

    for (const [gmailId, msgs] of byGmailId.entries()) {
      if (msgs.length > 1) {
        console.log(`Gmail ID ${gmailId}: ${msgs.length} copies`);
        // Keep the first one (oldest), delete the rest
        for (let i = 1; i < msgs.length; i++) {
          toDelete.push(msgs[i].id);
        }
      }
    }

    console.log(`\nFound ${toDelete.length} duplicate messages to delete`);

    if (toDelete.length > 0) {
      // Delete in batches to avoid hitting limits
      const batchSize = 100;
      for (let i = 0; i < toDelete.length; i += batchSize) {
        const batch = toDelete.slice(i, i + batchSize);
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .in('id', batch);

        if (deleteError) {
          console.error(`Error deleting batch ${i}:`, deleteError.message);
        } else {
          totalDeleted += batch.length;
          console.log(`Deleted batch ${Math.floor(i/batchSize) + 1}: ${batch.length} messages`);
        }
      }
    }

    console.log(`\nTotal deleted: ${totalDeleted} duplicate messages`);
  }
}

main();
