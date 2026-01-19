import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkThread() {
  const threadId = '1d418d70-4372-48e0-bd37-7bc0383a6f35';

  // Get thread details
  const { data: thread, error } = await supabase
    .from('threads')
    .select('id, subject, external_thread_id, gmail_thread_id, state, created_at')
    .eq('id', threadId)
    .single();

  console.log('Thread:', JSON.stringify(thread, null, 2));
  if (error) console.log('Error:', error);

  // Get messages for this thread
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  console.log('\nMessages count:', messages?.length);
  if (msgError) console.log('Message error:', msgError);
  if (messages && messages.length > 0) {
    console.log('Message columns:', Object.keys(messages[0]));
    messages.forEach(m => {
      console.log(' -', m.role || m.direction, '|', m.from_email || m.sender, '|', new Date(m.created_at).toISOString());
    });
  }

  // Check if there are other threads from same sender
  if (messages && messages.length > 0) {
    const senderEmail = messages.find(m => m.direction === 'inbound')?.from_email;
    console.log('\nSender email:', senderEmail);

    if (senderEmail) {
      // Find all threads with messages from this sender
      const { data: senderMessages } = await supabase
        .from('messages')
        .select('thread_id, created_at')
        .eq('from_email', senderEmail)
        .neq('thread_id', threadId)
        .order('created_at', { ascending: false });

      const otherThreadIds = [...new Set(senderMessages?.map(m => m.thread_id) || [])];
      console.log('\nOther threads from same sender:', otherThreadIds.length);

      for (const tid of otherThreadIds.slice(0, 5)) {
        const { data: t } = await supabase
          .from('threads')
          .select('id, subject, created_at, state, gmail_thread_id')
          .eq('id', tid)
          .single();
        console.log(' -', t?.subject, '|', t?.state, '|', t?.gmail_thread_id);
      }
    }
  }

  // Check recent processing events
  console.log('\n--- Recent agent_poll_runs ---');
  const { data: runs } = await supabase
    .from('agent_poll_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);

  runs?.forEach(r => {
    console.log(' -', r.started_at, '| messages:', r.messages_processed, '| drafts:', r.drafts_generated);
  });

  // Check agent settings
  console.log('\n--- Agent Settings ---');
  const { data: settings, error: settingsError } = await supabase
    .from('agent_settings')
    .select('*');

  if (settingsError) console.log('Settings error:', settingsError);
  console.log('Settings:', JSON.stringify(settings, null, 2));

  // Check events for this thread
  console.log('\n--- Events for this thread ---');
  const { data: events } = await supabase
    .from('events')
    .select('event_type, payload, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  events?.forEach(e => {
    console.log(' -', e.event_type, '|', new Date(e.created_at).toISOString());
  });
}

checkThread().catch(console.error);
