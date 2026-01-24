/**
 * Re-import Gmail threads with full context
 *
 * This script:
 * 1. Fetches threads from the last 5 days
 * 2. For each thread, imports ALL messages (inbound AND outbound)
 * 3. Classifies based on full conversation context
 * 4. Generates drafts considering Rob's previous responses
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { gmail_v1 } from 'googleapis';
import { classifyWithLLM } from '../src/lib/intents/llmClassify';
import { isProtectedIntent } from '../src/lib/verification/types';
import { createGmailClient, createOAuth2Client, type GmailTokens } from '../src/lib/import/gmail/auth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type GmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  date: Date;
  isIncoming: boolean;
};

type ThreadSummary = {
  gmailThreadId: string;
  subject: string;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  latestIntent: string;
  hasRobResponse: boolean;
  draft: string | null;
  state: string;
};

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  // Get tokens from sync state
  const { data: syncState } = await supabase
    .from('gmail_sync_state')
    .select('refresh_token')
    .eq('email_address', 'support@squarewheelsauto.com')
    .single();

  if (!syncState?.refresh_token) {
    throw new Error('No Gmail refresh token found. Run Gmail setup first.');
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: syncState.refresh_token,
  });

  // Refresh the access token
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);

  const tokens: GmailTokens = {
    access_token: credentials.access_token!,
    refresh_token: syncState.refresh_token,
    scope: credentials.scope || '',
    token_type: credentials.token_type || 'Bearer',
    expiry_date: credentials.expiry_date || undefined,
  };

  return createGmailClient(tokens);
}

function parseEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/) || header.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase() : header.toLowerCase();
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function decodeBody(payload: gmail_v1.Schema$MessagePart): string {
  // Try to get plain text body
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Check parts
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        // Strip HTML tags for basic text
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = decodeBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

async function fetchThreadMessages(gmail: gmail_v1.Gmail, threadId: string): Promise<GmailMessage[]> {
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const messages: GmailMessage[] = [];
  const supportEmail = 'support@squarewheelsauto.com';

  for (const msg of thread.data.messages || []) {
    const headers = msg.payload?.headers || [];
    const from = parseEmailAddress(getHeader(headers, 'From'));
    const to = getHeader(headers, 'To').split(',').map(e => parseEmailAddress(e.trim()));
    const cc = getHeader(headers, 'Cc').split(',').map(e => parseEmailAddress(e.trim())).filter(e => e);
    const subject = getHeader(headers, 'Subject');
    const dateStr = getHeader(headers, 'Date');
    const body = decodeBody(msg.payload!);

    // Determine if incoming (from customer) or outgoing (from support)
    const isIncoming = from !== supportEmail && !from.includes('squarewheels');

    messages.push({
      id: msg.id!,
      threadId: threadId,
      from,
      to,
      cc,
      subject,
      body,
      date: new Date(dateStr),
      isIncoming,
    });
  }

  // Sort by date
  messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  return messages;
}

async function importThread(gmail: gmail_v1.Gmail, gmailThreadId: string): Promise<ThreadSummary | null> {
  const messages = await fetchThreadMessages(gmail, gmailThreadId);

  if (messages.length === 0) {
    return null;
  }

  const subject = messages[0].subject;
  const inboundMessages = messages.filter(m => m.isIncoming);
  const outboundMessages = messages.filter(m => !m.isIncoming);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Thread: ${subject}`);
  console.log(`Messages: ${messages.length} (${inboundMessages.length} inbound, ${outboundMessages.length} outbound)`);
  console.log(`${'='.repeat(80)}`);

  // Create thread in database
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .insert({
      gmail_thread_id: gmailThreadId,
      external_thread_id: gmailThreadId,
      subject,
      state: 'NEW',
      channel: 'email',
    })
    .select('id')
    .single();

  if (threadError) {
    console.error('Error creating thread:', threadError.message);
    return null;
  }

  const threadId = thread.id;

  // Import ALL messages to build full context
  for (const msg of messages) {
    console.log(`  ${msg.isIncoming ? '📥 CUSTOMER' : '📤 SUPPORT'}: ${msg.from}`);
    console.log(`     ${msg.body.substring(0, 100).replace(/\n/g, ' ')}...`);

    await supabase.from('messages').insert({
      thread_id: threadId,
      direction: msg.isIncoming ? 'inbound' : 'outbound',
      from_email: msg.from,
      to_email: msg.to[0] || null,
      body_text: msg.body,
      channel: 'email',
      channel_metadata: {
        gmail_thread_id: gmailThreadId,
        gmail_message_id: msg.id,
        gmail_date: msg.date.toISOString(),
      },
      created_at: msg.date.toISOString(),
    });
  }

  // Now classify based on FULL context
  // Combine all customer messages for classification
  const customerContext = inboundMessages.map(m => m.body).join('\n\n---\n\n');
  const classification = await classifyWithLLM(subject, customerContext);
  const intent = classification.primary_intent;
  const confidence = classification.intents[0]?.confidence ?? 0.5;

  console.log(`\n  🎯 INTENT: ${intent} (confidence: ${confidence})`);

  // Check if Rob has already responded
  const hasRobResponse = outboundMessages.length > 0;
  if (hasRobResponse) {
    console.log(`  ✅ Rob has already responded (${outboundMessages.length} outbound messages)`);
  }

  // Determine state based on conversation flow
  let state = 'NEW';
  let draft: string | null = null;

  if (intent === 'VENDOR_SPAM') {
    state = 'RESOLVED';
    draft = null;
    console.log(`  🚫 VENDOR_SPAM - Auto-closed`);
  } else if (intent === 'THANK_YOU_CLOSE') {
    state = 'RESOLVED';
    draft = null;
    console.log(`  ✅ Customer thanked us - Resolved`);
  } else if (hasRobResponse) {
    // Rob has responded - check if customer replied after
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.isIncoming) {
      // Customer replied after Rob's response - needs attention
      state = 'IN_PROGRESS';
      console.log(`  ⚠️ Customer replied after Rob's response - needs follow-up`);

      // Generate draft based on latest customer message and Rob's last response
      const latestCustomerMsg = lastMessage;
      const robLastResponse = [...outboundMessages].pop();

      draft = generateContextualDraft(intent, latestCustomerMsg, robLastResponse);
    } else {
      // Last message was from support - awaiting customer
      state = 'AWAITING_INFO';
      console.log(`  ⏳ Awaiting customer response`);
    }
  } else {
    // No Rob response yet - generate draft
    const latestInbound = inboundMessages[inboundMessages.length - 1];
    state = 'NEW';

    if (isProtectedIntent(intent)) {
      // Extract order number from message to avoid asking for it again
      const orderNumberMatch = latestInbound.body.match(/order\s*(?:number|#|no\.?)?\s*(\d{4,})/i) ||
                               latestInbound.body.match(/#\s?(\d{4,})/i);

      if (orderNumberMatch) {
        const orderNum = orderNumberMatch[1];
        console.log(`  🔐 Protected intent - Order #${orderNum} found in message`);
        draft = generateContextualDraft(intent, latestInbound, undefined);
        // Add note that order was extracted
        if (draft && !draft.includes(orderNum)) {
          draft = draft.replace(/Hi there,/, `Hi there,\n\nThank you for including your order number (#${orderNum}).`);
        }
      } else {
        draft = `Hi there,\n\nThanks for reaching out! To help you with this, could you please provide your order number? You can find it in your confirmation email.\n\n– Lina`;
        console.log(`  🔒 Protected intent - asking for verification (no order # found)`);
      }
    } else {
      draft = generateContextualDraft(intent, latestInbound, undefined);
    }
  }

  // Update thread with classification
  await supabase
    .from('threads')
    .update({
      state,
      last_intent: intent,
      updated_at: new Date().toISOString(),
    })
    .eq('id', threadId);

  // Log event
  await supabase.from('events').insert({
    thread_id: threadId,
    type: 'auto_triage',
    payload: {
      intent,
      confidence,
      action: hasRobResponse ? 'CONTEXT_AWARE' : 'NEW_THREAD',
      draft,
      channel: 'email',
      contextSummary: {
        totalMessages: messages.length,
        inboundCount: inboundMessages.length,
        outboundCount: outboundMessages.length,
        hasRobResponse,
      },
      stateTransition: {
        from: 'NEW',
        to: state,
        reason: hasRobResponse ? 'has_prior_response' : 'new_thread',
      },
    },
  });

  if (draft) {
    console.log(`\n  📝 DRAFT RESPONSE:`);
    console.log(`  ${'-'.repeat(60)}`);
    console.log(`  ${draft.split('\n').join('\n  ')}`);
    console.log(`  ${'-'.repeat(60)}`);
  }

  return {
    gmailThreadId,
    subject,
    messageCount: messages.length,
    inboundCount: inboundMessages.length,
    outboundCount: outboundMessages.length,
    latestIntent: intent,
    hasRobResponse,
    draft,
    state,
  };
}

function generateContextualDraft(
  intent: string,
  latestCustomerMsg: GmailMessage,
  robLastResponse: GmailMessage | undefined
): string {
  const customerText = latestCustomerMsg.body.toLowerCase();

  // If Rob already responded, acknowledge that context
  const contextPrefix = robLastResponse
    ? `Thanks for following up! `
    : `Hi there,\n\nThanks for reaching out! `;

  switch (intent) {
    case 'ORDER_STATUS':
      return `${contextPrefix}I'd be happy to check on your order status. Could you please provide your order number so I can look that up for you?\n\n– Lina`;

    case 'PRODUCT_SUPPORT':
      if (customerText.includes('screen') || customerText.includes('display')) {
        return `${contextPrefix}I'm sorry to hear you're having screen issues. Let me help troubleshoot:\n\n1. Can you confirm which product model you have?\n2. Does the screen show anything at all, or is it completely black?\n3. Have you tried a hard reset (holding power for 10+ seconds)?\n\nOnce I know more, I can point you to the right solution.\n\n– Lina`;
      }
      if (customerText.includes('audio') || customerText.includes('sound') || customerText.includes('noise')) {
        return `${contextPrefix}I understand you're experiencing audio issues. To help troubleshoot:\n\n1. Is this a new installation or did it work previously?\n2. Does the noise occur with all audio sources (radio, CarPlay, etc.)?\n3. Have you checked the audio cable connections?\n\nLet me know and we'll get this sorted out.\n\n– Lina`;
      }
      return `${contextPrefix}I'd like to help troubleshoot this issue. Could you provide:\n\n1. Your product model\n2. A detailed description of the problem\n3. Any error messages you're seeing\n\n– Lina`;

    case 'FIRMWARE_UPDATE_REQUEST':
      return `${contextPrefix}I can help you get the latest firmware. To send you the correct files, I'll need:\n\n1. Your order number (for verification)\n2. Your product model (e.g., APEX MK7)\n\nOnce confirmed, I'll send you the download link right away.\n\n– Lina`;

    case 'FIRMWARE_ACCESS_ISSUE':
      return `${contextPrefix}I'm sorry you're having trouble accessing the firmware portal. Let me help:\n\n1. Try clearing your browser cache and cookies\n2. Use a different browser (Chrome works best)\n3. If you're still getting kicked off, I can send you a direct download link\n\nWhat's your order number so I can verify your account?\n\n– Lina`;

    case 'RETURN_REFUND_REQUEST':
      return `${contextPrefix}I understand you'd like to return your product. Our return policy allows returns within 30 days of delivery.\n\nTo process your return, please provide:\n1. Your order number\n2. Reason for the return\n\nOnce I have this info, I'll send you the return instructions.\n\n– Lina`;

    case 'COMPATIBILITY_QUESTION':
      return `${contextPrefix}Great question! I'd be happy to confirm compatibility. Could you tell me:\n\n1. Your vehicle year, make, and model\n2. Which product you're interested in\n\nI'll check our compatibility database and let you know.\n\n– Lina`;

    case 'FOLLOW_UP_NO_NEW_INFO':
      return `Hi there,\n\nThanks for following up! I'm checking on this and will get back to you shortly.\n\n– Lina`;

    default:
      return `${contextPrefix}I'd be happy to help with your inquiry. Could you provide a bit more detail about what you need assistance with?\n\n– Lina`;
  }
}

async function main() {
  console.log('🔄 Re-importing Gmail threads with full context...\n');

  const gmail = await getGmailClient();

  // Fetch threads from last 5 days
  console.log('📬 Fetching threads from last 5 days...');
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'newer_than:5d',
    maxResults: 100,
  });

  const threadIds = new Set<string>();
  for (const msg of response.data.messages || []) {
    if (msg.threadId) {
      threadIds.add(msg.threadId);
    }
  }

  console.log(`Found ${threadIds.size} unique threads\n`);

  const results: ThreadSummary[] = [];

  for (const gmailThreadId of threadIds) {
    try {
      const summary = await importThread(gmail, gmailThreadId);
      if (summary) {
        results.push(summary);
      }
    } catch (err) {
      console.error(`Error processing thread ${gmailThreadId}:`, err);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(80));

  const byIntent: Record<string, number> = {};
  const byState: Record<string, number> = {};
  let withRobResponse = 0;
  let withDraft = 0;

  for (const r of results) {
    byIntent[r.latestIntent] = (byIntent[r.latestIntent] || 0) + 1;
    byState[r.state] = (byState[r.state] || 0) + 1;
    if (r.hasRobResponse) withRobResponse++;
    if (r.draft) withDraft++;
  }

  console.log(`\nTotal threads imported: ${results.length}`);
  console.log(`Threads with Rob's response: ${withRobResponse}`);
  console.log(`Threads needing draft: ${withDraft}`);

  console.log('\nBy Intent:');
  for (const [intent, count] of Object.entries(byIntent).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${intent}: ${count}`);
  }

  console.log('\nBy State:');
  for (const [state, count] of Object.entries(byState).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${state}: ${count}`);
  }

  // Update history ID to prevent re-processing
  const profile = await gmail.users.getProfile({ userId: 'me' });
  await supabase
    .from('gmail_sync_state')
    .update({
      last_history_id: profile.data.historyId,
      last_sync_at: new Date().toISOString(),
    })
    .eq('email_address', 'support@squarewheelsauto.com');

  console.log('\n✅ Import complete! Gmail sync state updated.');
}

main().catch(console.error);
