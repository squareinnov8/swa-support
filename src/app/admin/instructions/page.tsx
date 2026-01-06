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
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Agent Instructions</h1>
        <p style={{ color: "red" }}>Error loading instructions: {error.message}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Agent Instructions</h1>
        <a href="/admin" style={{ color: "#3b82f6" }}>← Back to Inbox</a>
      </div>

      <p style={{ color: "#666", marginTop: 8 }}>
        Edit these instructions to control how the agent responds. Changes are applied immediately.
        Feedback from draft reviews will automatically integrate into the relevant sections.
      </p>

      <div style={{ marginTop: 24 }}>
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
