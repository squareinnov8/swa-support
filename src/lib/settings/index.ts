/**
 * Agent Settings
 *
 * Runtime configuration for agent behavior.
 */

import { supabase } from "@/lib/db";

export type AgentSettings = {
  autoSendEnabled: boolean;
  autoSendConfidenceThreshold: number;
  requireVerificationForSend: boolean;
};

const SETTING_KEYS = {
  autoSendEnabled: "auto_send_enabled",
  autoSendConfidenceThreshold: "auto_send_confidence_threshold",
  requireVerificationForSend: "require_verification_for_send",
} as const;

/**
 * Get all agent settings
 */
export async function getAgentSettings(): Promise<AgentSettings> {
  const { data } = await supabase
    .from("agent_settings")
    .select("key, value")
    .in("key", Object.values(SETTING_KEYS));

  const settings: Record<string, unknown> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  const threshold = settings[SETTING_KEYS.autoSendConfidenceThreshold];

  return {
    autoSendEnabled: settings[SETTING_KEYS.autoSendEnabled] === true,
    autoSendConfidenceThreshold:
      typeof threshold === "number" ? threshold : 0.85,
    requireVerificationForSend:
      settings[SETTING_KEYS.requireVerificationForSend] !== false,
  };
}

/**
 * Get a single setting
 */
export async function getSetting<T>(key: keyof typeof SETTING_KEYS): Promise<T | null> {
  const { data } = await supabase
    .from("agent_settings")
    .select("value")
    .eq("key", SETTING_KEYS[key])
    .single();

  return data?.value ?? null;
}

/**
 * Update a setting
 */
export async function updateSetting(
  key: keyof typeof SETTING_KEYS,
  value: unknown,
  updatedBy?: string
): Promise<void> {
  await supabase
    .from("agent_settings")
    .upsert({
      key: SETTING_KEYS[key],
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    });
}

/**
 * Check if auto-send is enabled
 */
export async function isAutoSendEnabled(): Promise<boolean> {
  const setting = await getSetting<boolean>("autoSendEnabled");
  return setting === true;
}
