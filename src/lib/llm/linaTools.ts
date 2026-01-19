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
        "Create a draft response to relay information from Rob or the team to the customer. Use this when Rob provides an answer to an escalated question that should be communicated to the customer.",
      parameters: {
        type: "object",
        properties: {
          customer_message: {
            type: "string",
            description:
              "The complete message body to send - include greeting (e.g. 'Hi [Name],'), the information, and sign off with '– Lina'. Do NOT include a relay intro - that will be added automatically.",
          },
          attribution: {
            type: "string",
            enum: ["rob", "technical_team", "shipping_team", "support_team"],
            description: "Who provided the information being relayed",
          },
          thread_id: {
            type: "string",
            description:
              "Thread ID to add the draft to (optional if discussing current thread)",
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

1. **create_kb_article** - Use for new product info, troubleshooting steps, compatibility info, or policies that should be available for future queries
2. **update_instruction** - Use for behavior changes, communication rules, or process updates
3. **draft_relay_response** - Use to send Rob's answers back to the customer with natural framing
4. **note_feedback** - Use for acknowledgments that don't need permanent KB/instruction changes

**Important guidelines:**
- Always use a tool when Rob provides information that should be saved or actioned
- Confirm what action you took after using a tool
- For relay responses: Write the complete customer message with greeting and "– Lina" signature. A natural intro like "Great news! I heard back from Rob." will be added automatically before your message.
- If unsure whether to create a KB article vs update instructions, ask Rob

**DO NOT just acknowledge information without taking action** - if Rob shares something valuable, save it to the KB or update instructions so I can use it for future customers.
`;
