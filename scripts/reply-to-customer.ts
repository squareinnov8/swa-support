import 'dotenv/config';
import { sendApprovedDraft } from '../src/lib/gmail/sendDraft';

async function main() {
  const threadId = 'fcf98a2a-6b5c-4678-84a2-0a4991ff81b3';

  // The customer's last question: "I chose the right option (piano black) based on the photo correct?"
  // They're asking for confirmation that piano black matches their dashboard

  const reply = `Yes, piano black is the right choice for your R8! Your dashboard has that glossy finish, so it'll be a perfect match.

Your order is all set with:
- Color: Piano Black
- Storage: 8GB+128GB

I've forwarded everything to our fulfillment team. You'll get tracking info once it ships.

Thanks for your patience!

– Lina`;

  console.log('=== SENDING REPLY TO CUSTOMER ===\n');
  console.log(reply);
  console.log('\n---');

  const result = await sendApprovedDraft({
    threadId,
    draftText: reply,
  });

  if (result.success) {
    console.log('SUCCESS! Reply sent to customer');
    console.log('Gmail Message ID:', result.gmailMessageId);
  } else {
    console.error('Failed to send:', result.error);
  }
}

main();
