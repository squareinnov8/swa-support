import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function getGmailClient() {
  const { data: syncState } = await supabase
    .from('gmail_sync_state')
    .select('refresh_token')
    .eq('email_address', 'support@squarewheelsauto.com')
    .single();

  if (!syncState?.refresh_token) {
    throw new Error('No refresh token found');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: syncState.refresh_token });
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function main() {
  const messageId = process.argv[2] || '19bfcef4631d595e';

  console.log('Fetching Gmail message:', messageId);
  const gmail = await getGmailClient();

  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const parts = response.data.payload?.parts || [];
  console.log('\nMessage parts:', parts.length);

  function findAttachments(messageParts: typeof parts, depth = 0) {
    const indent = '  '.repeat(depth);
    for (const part of messageParts) {
      console.log(indent + 'Part: mimeType=' + part.mimeType + ', filename=' + (part.filename || '(none)'));
      if (part.filename && part.body?.attachmentId) {
        console.log(indent + '  -> ATTACHMENT: ' + part.filename + ' (' + part.body.size + ' bytes)');
        console.log(indent + '     attachmentId: ' + part.body.attachmentId);
      }
      if (part.parts) {
        findAttachments(part.parts, depth + 1);
      }
    }
  }

  findAttachments(parts);
}

main().catch(console.error);
