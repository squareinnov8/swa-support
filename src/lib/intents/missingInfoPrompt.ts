/**
 * Generate missing info prompts from LLM classification results.
 * This is a pure function with no external dependencies.
 */

export interface MissingInfoField {
  id: string;
  label: string;
  required: boolean;
}

/**
 * Generate a clarifying question prompt from LLM-detected missing info
 */
export function generateMissingInfoPromptFromClassification(
  missingInfo: MissingInfoField[] | undefined | null
): string {
  if (!missingInfo || missingInfo.length === 0) return "";

  // Filter to required items first, then include helpful ones
  const required = missingInfo.filter((i) => i.required);
  const optional = missingInfo.filter((i) => !i.required);

  // Prioritize required, add optionals if we have room
  const toAsk = [...required, ...optional].slice(0, 3);

  if (toAsk.length === 0) return "";

  const items = toAsk.map((f, i) => `${i + 1}. ${f.label}`).join("\n");

  return `Hey! I'd love to help with this. Just need a quick bit of info:

${items}

Once I have that, I can dig into this for you!

– Lina`;
}
