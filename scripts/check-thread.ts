import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const threadId = process.argv[2] || '85ccd857-da8e-4b13-89cc-7c64ff1a6bb0';

  const { data: thread } = await supabase
    .from('threads')
    .select('id, subject, state, last_intent, human_handling_mode, verification_status')
    .eq('id', threadId)
    .single();

  console.log('Thread:', JSON.stringify(thread, null, 2));

  const { data: messages } = await supabase
    .from('messages')
    .select('id, direction, from_email, body_text, channel_metadata, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('\nMessages:', messages?.length);
  for (const m of messages || []) {
    const meta = m.channel_metadata as Record<string, unknown> | null;
    console.log('\n[' + m.direction + '] ' + m.from_email + ' - ' + new Date(m.created_at).toLocaleString());
    const bodyPreview = m.body_text?.substring(0, 300) || '(empty)';
    console.log('  Body: ' + bodyPreview + '...');
    console.log('  Full metadata: ' + JSON.stringify(meta, null, 2));
  }
}

main();
