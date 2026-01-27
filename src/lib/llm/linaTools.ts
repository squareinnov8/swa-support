/**
 * Lina Admin Chat Tools
 *
 * Defines the tools available to Lina during admin chat sessions.
 * These enable her to take actions like creating KB articles,
 * updating instructions, and drafting relay responses to customers.
 */

import type OpenAI from "openai";

/**
 * Tool definitions for OpenAI function calling
 */
export const LINA_ADMIN_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_kb_article",
      description:
        "Create a new knowledge base article. Use this when Rob shares product information, troubleshooting steps, policies, or other knowledge that should be available for future customer queries.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Clear, descriptive title for the article",
          },
          content: {
            type: "string",
            description: "Full article content in markdown format",
          },
          category: {
            type: "string",
            enum: [
              "product",
              "troubleshooting",
              "policy",
              "shipping",
              "returns",
              "compatibility",
            ],
            description: "Category for the article",
          },
          source_summary: {
            type: "string",
            description:
              "Brief note about where this information came from (e.g., 'From Rob during escalation review')",
          },
        },
        required: ["title", "content", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_instruction",
      description:
        "Update my behavior instructions. Use this when Rob gives feedback about how I should handle certain situations, communication style, or rules to follow.",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: [
              "persona",
              "core_rules",
              "tone_style",
              "escalation_context",
              "product_knowledge",
            ],
            description: "Which instruction section to update",
          },
          instruction_text: {
            type: "string",
            description: "The new instruction or rule to add",
          },
          rationale: {
            type: "string",
            description: "Why this instruction is being added",
          },
        },
        required: ["section", "instruction_text", "rationale"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_relay_response",
      description:
        "Create a draft response to relay information to customers OR forward to vendors. Use this when: (1) Rob provides an answer to relay to the customer, or (2) you need to forward customer photos/info to vendors. Can include attachments from customer messages.",
      parameters: {
        type: "object",
        properties: {
          customer_message: {
            type: "string",
            description:
              "The complete message to send. For customer replies: Start with greeting (e.g. 'Hi [Name],'), naturally mention you heard back from Rob/the team, include the info, and sign off with '– Lina'. For vendor forwards: Write a professional message with relevant order/customer details.",
          },
          attribution: {
            type: "string",
            enum: ["rob", "technical_team", "shipping_team", "support_team", "vendor_forward"],
            description: "Who provided the information being relayed, or 'vendor_forward' when forwarding to vendors",
          },
          thread_id: {
            type: "string",
            description:
              "Thread ID to add the draft to (optional if discussing current thread)",
          },
          include_attachments_from_message: {
            type: "string",
            description:
              "Message ID to include attachments from (e.g., the customer's message containing photos). The attachments will be forwarded when the draft is sent.",
          },
          recipient_override: {
            type: "string",
            description:
              "Override recipient email address. Use for vendor forwards instead of sending to customer. If not set, sends to the thread's customer.",
          },
        },
        required: ["customer_message", "attribution"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "note_feedback",
      description:
        "Acknowledge feedback that doesn't require KB or instruction changes. Use this for minor corrections, one-off situations, acknowledgments, or when Rob just wants to discuss something without making permanent changes.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Summary of the feedback received",
          },
          action_taken: {
            type: "string",
            description:
              "What I'll do differently going forward (if anything). Can be empty for acknowledgments.",
          },
        },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_order",
      description:
        "Look up an order by order number from Shopify. Use this when Rob mentions an order number and you need to find customer details, order status, items ordered, or tracking information.",
      parameters: {
        type: "object",
        properties: {
          order_number: {
            type: "string",
            description:
              "The order number to look up (e.g., '3844', '#3844', 'SWA-3844')",
          },
        },
        required: ["order_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "associate_thread_customer",
      description:
        "Associate the current thread with a customer. Use this when Rob tells you who a thread belongs to, typically by providing an order number or customer email. This links the thread to the customer in the database for future reference.",
      parameters: {
        type: "object",
        properties: {
          customer_email: {
            type: "string",
            description: "Customer's email address",
          },
          customer_name: {
            type: "string",
            description: "Customer's full name",
          },
          order_number: {
            type: "string",
            description:
              "Order number that verified this customer (optional, for reference)",
          },
          thread_id: {
            type: "string",
            description:
              "Thread ID to associate (optional if discussing current thread)",
          },
        },
        required: ["customer_email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "return_thread_to_agent",
      description:
        "Return a thread from HUMAN_HANDLING mode back to agent handling. Use this when Rob says to 'unblock', 'return', or 'release' a ticket so Lina can resume handling it. This changes the thread state from HUMAN_HANDLING to IN_PROGRESS.",
      parameters: {
        type: "object",
        properties: {
          thread_id: {
            type: "string",
            description:
              "Thread ID to return to agent (optional if discussing current thread)",
          },
          reason: {
            type: "string",
            description:
              "Brief reason for returning the thread (e.g., 'Customer verified by Rob', 'Issue resolved')",
          },
        },
        required: ["reason"],
      },
    },
  },
];

/**
 * Response templates for relay messages
 * Multiple options for natural variation
 */
export const RELAY_TEMPLATES = {
  rob: [
    "Great news! I heard back from Rob.\n\n",
    "Quick update - I checked with Rob on this.\n\n",
    "Good news! Rob got back to me with an answer.\n\n",
    "I have an update from Rob.\n\n",
  ],
  technical_team: [
    "I got an answer from our technical team.\n\n",
    "Our tech team looked into this.\n\n",
    "Quick update from the technical side.\n\n",
    "The engineering team reviewed this.\n\n",
  ],
  shipping_team: [
    "I checked with our shipping team.\n\n",
    "Our shipping department got back to me.\n\n",
    "Good news from shipping!\n\n",
    "I have an update from the shipping team.\n\n",
  ],
  support_team: [
    "After looking into this further:\n\n",
    "I was able to get more information.\n\n",
    "I have an update for you.\n\n",
    "", // Sometimes no prefix needed
  ],
  vendor_forward: [
    "", // No prefix for vendor communications
  ],
};

/**
 * Get a random relay template for natural variation
 */
export function getRelayTemplate(
  attribution: keyof typeof RELAY_TEMPLATES
): string {
  const templates = RELAY_TEMPLATES[attribution] || RELAY_TEMPLATES.support_team;
  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * System prompt addition for tool-enabled chat
 */
export const TOOL_SYSTEM_PROMPT = `
## Actions Available

You have tools available to take real action. When Rob gives you information or feedback:

1. **lookup_order** - Look up order details from Shopify by order number. Use this when Rob mentions an order number.
2. **associate_thread_customer** - Link this thread to a customer. Use after looking up an order to associate the thread properly.
3. **return_thread_to_agent** - Return a thread from HUMAN_HANDLING back to agent handling. Use when Rob says to "unblock", "release", or "return" a ticket.
4. **create_kb_article** - Use for new product info, troubleshooting steps, compatibility info, or policies that should be available for future queries
5. **update_instruction** - Use for behavior changes, communication rules, or process updates
6. **draft_relay_response** - Use to send Rob's answers back to the customer with natural framing
7. **note_feedback** - Use for acknowledgments that don't need permanent KB/instruction changes

**CRITICAL - Order Lookup and Customer Association Workflow:**
When Rob says something like "This is [customer], order #[number]" or "associate this thread with order #[number]":
1. FIRST call lookup_order with the order number
2. The lookup_order response contains the REAL customer email from Shopify (in details.customerEmail)
3. THEN call associate_thread_customer using the customerEmail FROM THE ORDER LOOKUP RESULT
4. DO NOT use the email from the thread's sender - use the email from the Shopify order!

Example: If Rob says "This is Richard, order #3844":
- Call lookup_order with order_number: "3844"
- Response contains: { customerEmail: "richard.real@email.com", customerName: "Richard Cabrera" }
- Call associate_thread_customer with customer_email: "richard.real@email.com" (from the order lookup)
- NOT with the sender's email from the thread

**Other guidelines:**
- Always use a tool when Rob provides information that should be saved or actioned
- Confirm what action you took after using a tool
- For relay responses: Write a complete, natural message starting with "Hi [Name]," then naturally work in that you heard back from Rob/the team, include the info, and end with "– Lina"
- If unsure whether to create a KB article vs update instructions, ask Rob

**DO NOT just acknowledge information without taking action** - if Rob shares something valuable, save it to the KB or update instructions so I can use it for future customers.

## CRITICAL - Honesty Requirements

**NEVER claim you did something if you did not call the corresponding tool.** This is non-negotiable.

- If Rob asks you to "unblock" a ticket, you MUST call return_thread_to_agent. Do NOT say "I've unblocked it" unless the tool call succeeded.
- If you don't have a tool to do something, say "I don't have the ability to do that yet. Rob, could you add that capability for me?"
- If a tool call fails, report the failure honestly - don't pretend it succeeded.
- After calling a tool, confirm what ACTUALLY happened based on the tool result, not what you hoped would happen.

Trust is essential. Rob relies on your reports being accurate.
`;
