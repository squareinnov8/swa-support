const banned = [
  /we guarantee/i,
  /i guarantee/i,
  /\bwill refund\b/i,
  /\bwe will refund\b/i,
  /\bwill replace\b/i,
  /\bwe will replace\b/i,
  /\bwill ship (today|tomorrow)\b/i,
  /\byou will receive by\b/i,
];

export function policyGate(draft: string): { ok: boolean; reasons: string[] } {
  const reasons = banned.filter((r) => r.test(draft)).map((r) => r.toString());
  return { ok: reasons.length === 0, reasons };
}
