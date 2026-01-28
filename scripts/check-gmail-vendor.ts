import 'dotenv/config';
import { createGmailClient, refreshTokenIfNeeded } from '../src/lib/import/gmail/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
  const { data: syncState } = await supabase
    .from('gmail_sync_state')
    .select('refresh_token')
    .eq('email_address', 'support@squarewheelsauto.com')
    .single();
  
  if (!syncState?.refresh_token) {
    console.log('No refresh token found');
    return;
  }
  
  const tokens = await refreshTokenIfNeeded({
    access_token: '',
    refresh_token: syncState.refresh_token,
    scope: '',
    token_type: 'Bearer',
    expiry_date: 0,
  });
  
  const gmail = createGmailClient(tokens);
  
  // Search for messages from Christy
  console.log('Searching for messages from Christy...');
  const christyResponse = await gmail.users.messages.list({
    userId: 'me',
    q: 'from:christy',
    maxResults: 10,
  });
  
  console.log('Messages from Christy:', christyResponse.data.messages?.length || 0);
  for (const m of christyResponse.data.messages || []) {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: m.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const headers = msg.data.payload?.headers || [];
    const from = headers.find(h => h.name === 'From')?.value;
    const subject = headers.find(h => h.name === 'Subject')?.value;
    const date = headers.find(h => h.name === 'Date')?.value;
    console.log('---');
    console.log('From:', from);
    console.log('Subject:', subject);
    console.log('Date:', date);
    console.log('Thread ID:', msg.data.threadId);
  }
  
  // Search specifically for threads matching 4094
  console.log('\n\nSearching for threads with 4094...');
  const threads4094 = await gmail.users.threads.list({
    userId: 'me',
    q: '4094',
    maxResults: 5,
  });
  
  console.log('Threads with 4094:', threads4094.data.threads?.length || 0);
  for (const t of threads4094.data.threads || []) {
    console.log('Thread ID:', t.id, '| Snippet:', t.snippet?.slice(0, 80));
  }
}

test().catch(console.error);
