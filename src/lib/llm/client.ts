/**
 * OpenAI Client
 *
 * Wrapper for OpenAI API with support for structured outputs.
 * Switched from Anthropic Claude to OpenAI GPT for cost efficiency.
 */

import OpenAI from "openai";

/**
 * Default model configuration
 */
export const DEFAULT_MODEL = "gpt-4o-mini"; // Cost-effective and fast
export const MAX_TOKENS = 2048;

/**
 * Create OpenAI client instance
 */
export function createClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  return new OpenAI({
    apiKey,
  });
}

/**
 * Singleton client instance
 */
let clientInstance: OpenAI | null = null;

export function getClient(): OpenAI {
  if (!clientInstance) {
    clientInstance = createClient();
  }
  return clientInstance;
}

/**
 * Check if LLM is configured
 */
export function isLLMConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Message role types
 */
export type MessageRole = "user" | "assistant";

/**
 * Chat message format
 */
export type ChatMessage = {
  role: MessageRole;
  content: string;
};

/**
 * Generation options
 */
export type GenerateOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stopSequences?: string[];
};

/**
 * Generation result
 */
export type GenerateResult = {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
};

/**
 * Generate a completion with OpenAI
 */
export async function generate(
  prompt: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const client = getClient();

  const {
    model = DEFAULT_MODEL,
    maxTokens = MAX_TOKENS,
    temperature = 0.7,
    systemPrompt,
    stopSequences,
  } = options;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
    stop: stopSequences,
  });

  const content = response.choices[0]?.message?.content ?? "";

  return {
    content,
    model: response.model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    stopReason: response.choices[0]?.finish_reason ?? "unknown",
  };
}

/**
 * Generate with chat history
 */
export async function chat(
  messages: ChatMessage[],
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const client = getClient();

  const {
    model = DEFAULT_MODEL,
    maxTokens = MAX_TOKENS,
    temperature = 0.7,
    systemPrompt,
    stopSequences,
  } = options;

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    openaiMessages.push({ role: "system", content: systemPrompt });
  }

  for (const m of messages) {
    openaiMessages.push({
      role: m.role,
      content: m.content,
    });
  }

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: openaiMessages,
    stop: stopSequences,
  });

  const content = response.choices[0]?.message?.content ?? "";

  return {
    content,
    model: response.model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    stopReason: response.choices[0]?.finish_reason ?? "unknown",
  };
}

/**
 * Stream a completion (returns async iterator)
 */
export async function* stream(
  prompt: string,
  options: GenerateOptions = {}
): AsyncGenerator<string, void, unknown> {
  const client = getClient();

  const {
    model = DEFAULT_MODEL,
    maxTokens = MAX_TOKENS,
    temperature = 0.7,
    systemPrompt,
  } = options;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const stream = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}
