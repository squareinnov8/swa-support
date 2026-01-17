import { supabase } from "@/lib/db";
import { InstructionEditor } from "./InstructionEditor";

export const dynamic = "force-dynamic";

export default async function InstructionsPage() {
  const { data: instructions, error } = await supabase
    .from("agent_instructions")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ color: "#33475b" }}>Agent Instructions</h1>
        <p style={{ color: "#c93b41" }}>Error loading instructions: {error.message}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 1000 }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "#33475b" }}>
          Agent Instructions
        </h1>
        <a
          href="/admin"
          style={{
            color: "#0091ae",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ← Back to Inbox
        </a>
      </div>

      <p style={{ color: "#7c98b6", marginTop: 8, fontSize: 14, marginBottom: 24 }}>
        Edit these instructions to control how the agent responds. Changes are applied immediately.
        Feedback from draft reviews will automatically integrate into the relevant sections.
      </p>

      <div>
        {instructions?.map((instruction) => (
          <InstructionEditor
            key={instruction.id}
            id={instruction.id}
            sectionKey={instruction.section_key}
            title={instruction.title}
            content={instruction.content}
            version={instruction.version}
            updatedAt={instruction.updated_at}
          />
        ))}
      </div>
    </div>
  );
}
