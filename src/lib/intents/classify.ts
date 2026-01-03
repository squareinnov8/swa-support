import type { Intent } from "./taxonomy";

const has = (t: string, patterns: RegExp[]) => patterns.some((r) => r.test(t));

export function classifyIntent(subject: string, body: string): { intent: Intent; confidence: number } {
  const text = `${subject}\n${body}`.toLowerCase();

  if (has(text, [/thank you/, /appreciate/, /happy new year/, /thanks!$/])) {
    return { intent: "THANK_YOU_CLOSE", confidence: 0.9 };
  }

  if (has(text, [/chargeback/, /\bbb\b/, /dispute/, /bank/, /fraud/])) {
    return { intent: "CHARGEBACK_THREAT", confidence: 0.9 };
  }

  if (has(text, [/kicking me off/, /can't log in/, /login loop/, /403/, /access denied/])) {
    return { intent: "FIRMWARE_ACCESS_ISSUE", confidence: 0.8 };
  }

  if (has(text, [/firmware/, /update software/, /update file/])) {
    return { intent: "FIRMWARE_UPDATE_REQUEST", confidence: 0.7 };
  }

  if (has(text, [/watched the video/, /didn't get the email/, /didn't get the email/, /email shown in/])) {
    return { intent: "DOCS_VIDEO_MISMATCH", confidence: 0.8 };
  }

  if (has(text, [/since september/, /promises/, /no response/, /still waiting/, /any update/])) {
    return { intent: "FOLLOW_UP_NO_NEW_INFO", confidence: 0.7 };
  }

  if (has(text, [/what is this/, /\b3760\b/, /no idea what that was/, /part number/])) {
    return { intent: "PART_IDENTIFICATION", confidence: 0.7 };
  }

  return { intent: "UNKNOWN", confidence: 0.3 };
}
