"use client";

import { useState, useEffect, useRef } from "react";

type KBDoc = {
  id: string;
  title: string;
};

type AgentReasoningProps = {
  threadId: string;
  intent: string | null;
  confidence: number | null;
  kbDocs: KBDoc[];
  verification: {
    status: string;
    orderNumber: string | null;
    flags: string[];
  } | null;
  draftInfo: {
    policyGatePassed: boolean;
    policyViolations: string[];
    promptTokens: number;
    completionTokens: number;
    citations: Array<{ title: string }>;
  } | null;
};

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type PersistedMessage = {
  id: string;
  role: "admin" | "lina";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export function AgentReasoning({
  threadId,
  intent,
  confidence,
  kbDocs,
  verification,
  draftInfo,
}: AgentReasoningProps) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load persisted chat history when chat is opened
  useEffect(() => {
    if (showChat && !historyLoaded) {
      loadChatHistory();
    }
  }, [showChat, historyLoaded, threadId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  async function loadChatHistory() {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/admin/thread-chat/messages?threadId=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          // Convert persisted messages to chat format
          const converted: ChatMessage[] = data.messages.map((msg: PersistedMessage) => ({
            id: msg.id,
            role: msg.role === "admin" ? "user" : "assistant",
            content: msg.content,
            created_at: msg.created_at,
          }));
          setChatMessages(converted);
        }
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    } finally {
      setIsLoadingHistory(false);
      setHistoryLoaded(true);
    }
  }

  async function clearChatHistory() {
    if (!confirm("Clear all chat history with Lina for this thread?")) return;

    try {
      const res = await fetch(`/api/admin/thread-chat/messages?threadId=${threadId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setChatMessages([]);
        setHistoryLoaded(false);
      }
    } catch (error) {
      console.error("Failed to clear chat history:", error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setShowFeedbackPrompt(false);

    try {
      const res = await fetch("/api/admin/thread-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          message: userMessage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);

        // Check if Lina acknowledged a feedback instruction
        const feedbackKeywords = [
          "feedback entry",
          "create feedback",
          "instruction permanent",
          "make it permanent",
          "won't remember",
          "will forget",
        ];
        const hasFeebbackMention = feedbackKeywords.some(
          (kw) => data.response.toLowerCase().includes(kw)
        );
        if (hasFeebbackMention) {
          setShowFeedbackPrompt(true);
        }
      } else {
        const error = await res.json();
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${error.error}` },
        ]);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error - could not reach agent" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCreateFeedback() {
    // Get the last few messages as context for the feedback
    const recentMessages = chatMessages.slice(-4);
    const context = recentMessages
      .map((m) => `${m.role === "user" ? "Admin" : "Lina"}: ${m.content}`)
      .join("\n\n");

    // Open feedback form in a new tab with pre-filled context
    const feedbackUrl = `/admin/feedback/new?threadId=${threadId}&context=${encodeURIComponent(context)}`;
    window.open(feedbackUrl, "_blank");
    setShowFeedbackPrompt(false);
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 16 }}>Agent Reasoning</h2>

      {/* Quick Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {/* Intent */}
        <div
          style={{
            padding: 16,
            backgroundColor: "#f0f9ff",
            borderRadius: 8,
            border: "1px solid #bae6fd",
          }}
        >
          <div style={{ fontSize: 12, color: "#0369a1", marginBottom: 4 }}>
            Intent Classification
          </div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{intent || "—"}</div>
          {confidence !== null && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              Confidence: {Math.round(confidence * 100)}%
            </div>
          )}
        </div>

        {/* Verification */}
        <div
          style={{
            padding: 16,
            backgroundColor: verification?.status === "verified" ? "#f0fdf4" : "#fef3c7",
            borderRadius: 8,
            border: `1px solid ${verification?.status === "verified" ? "#86efac" : "#fcd34d"}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: verification?.status === "verified" ? "#166534" : "#92400e",
              marginBottom: 4,
            }}
          >
            Customer Verification
          </div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {verification?.status || "Not verified"}
          </div>
          {verification?.orderNumber && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              Order: #{verification.orderNumber}
            </div>
          )}
          {verification?.flags && verification.flags.length > 0 && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
              Flags: {verification.flags.join(", ")}
            </div>
          )}
        </div>

        {/* KB Docs Used */}
        <div
          style={{
            padding: 16,
            backgroundColor: "#faf5ff",
            borderRadius: 8,
            border: "1px solid #d8b4fe",
          }}
        >
          <div style={{ fontSize: 12, color: "#7c3aed", marginBottom: 4 }}>
            Knowledge Base
          </div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {kbDocs.length} doc{kbDocs.length !== 1 ? "s" : ""} used
          </div>
          {kbDocs.length > 0 && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
              {kbDocs.map((d) => d.title).join(", ")}
            </div>
          )}
        </div>

        {/* Policy Gate */}
        <div
          style={{
            padding: 16,
            backgroundColor: draftInfo?.policyGatePassed ? "#f0fdf4" : "#fef2f2",
            borderRadius: 8,
            border: `1px solid ${draftInfo?.policyGatePassed ? "#86efac" : "#fecaca"}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: draftInfo?.policyGatePassed ? "#166534" : "#991b1b",
              marginBottom: 4,
            }}
          >
            Policy Gate
          </div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {draftInfo?.policyGatePassed ? "✓ Passed" : "✗ Blocked"}
          </div>
          {draftInfo?.policyViolations && draftInfo.policyViolations.length > 0 && (
            <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
              {draftInfo.policyViolations.join(", ")}
            </div>
          )}
        </div>
      </div>

      {/* Token Usage */}
      {draftInfo && (draftInfo.promptTokens > 0 || draftInfo.completionTokens > 0) && (
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Tokens: {draftInfo.promptTokens} prompt + {draftInfo.completionTokens} completion
        </div>
      )}

      {/* Chat with Agent Section */}
      <div
        style={{
          marginTop: 24,
          border: "2px solid #8b5cf6",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setShowChat(!showChat)}
          style={{
            width: "100%",
            padding: 16,
            backgroundColor: "#8b5cf6",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            💬 Chat with Lina about this thread
            {chatMessages.length > 0 && (
              <span style={{ opacity: 0.7, marginLeft: 8, fontSize: 14 }}>
                ({chatMessages.length} messages)
              </span>
            )}
          </span>
          <span>{showChat ? "▼" : "▶"}</span>
        </button>

        {showChat && (
          <div style={{ backgroundColor: "#faf5ff" }}>
            {/* Chat Header with Actions */}
            {chatMessages.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "8px 12px",
                  borderBottom: "1px solid #e5e7eb",
                  gap: 8,
                }}
              >
                <button
                  onClick={clearChatHistory}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "transparent",
                    color: "#6b7280",
                    border: "1px solid #d1d5db",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Clear History
                </button>
              </div>
            )}

            {/* Feedback Prompt Banner */}
            {showFeedbackPrompt && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: 12,
                  backgroundColor: "#fef3c7",
                  borderBottom: "1px solid #fcd34d",
                }}
              >
                <span style={{ color: "#92400e", fontSize: 14 }}>
                  💡 Want to make this instruction permanent?
                </span>
                <button
                  onClick={handleCreateFeedback}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#f59e0b",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Create Feedback Entry
                </button>
              </div>
            )}

            {/* Chat Messages */}
            <div
              ref={chatContainerRef}
              style={{
                padding: 16,
                maxHeight: 400,
                overflowY: "auto",
                minHeight: 100,
              }}
            >
              {isLoadingHistory ? (
                <div style={{ color: "#64748b", fontStyle: "italic" }}>
                  Loading conversation history...
                </div>
              ) : chatMessages.length === 0 ? (
                <div style={{ color: "#64748b", fontStyle: "italic" }}>
                  Ask Lina anything about this thread - why she responded this way,
                  what KB docs she used, how to handle the case differently...
                  <br /><br />
                  <strong>Tip:</strong> Lina now uses your real agent instructions and will cite
                  sources. If you give her feedback, she&apos;ll suggest creating a feedback entry
                  to make it permanent.
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={msg.id || i}
                    style={{
                      marginBottom: 12,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        maxWidth: "80%",
                        backgroundColor: msg.role === "user" ? "#8b5cf6" : "white",
                        color: msg.role === "user" ? "white" : "#1f2937",
                        border: msg.role === "user" ? "none" : "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: 11, marginBottom: 4, opacity: 0.7 }}>
                        {msg.role === "user" ? "You" : "Lina"}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div style={{ color: "#64748b", fontStyle: "italic" }}>
                  Lina is thinking...
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSendMessage}
              style={{
                display: "flex",
                gap: 8,
                padding: 12,
                borderTop: "1px solid #e5e7eb",
                backgroundColor: "white",
              }}
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask Lina about this thread..."
                style={{
                  flex: 1,
                  padding: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 6,
                  fontFamily: "inherit",
                }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                style={{
                  padding: "12px 20px",
                  backgroundColor: isLoading ? "#d1d5db" : "#8b5cf6",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
