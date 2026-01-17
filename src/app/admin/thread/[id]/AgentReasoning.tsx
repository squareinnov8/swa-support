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
    <div
      style={{
        marginTop: 24,
        border: "1px solid #cbd6e2",
        borderRadius: 4,
        backgroundColor: "#ffffff",
        overflow: "hidden",
      }}
    >
      {/* Section Header */}
      <div
        style={{
          padding: "12px 16px",
          backgroundColor: "#f5f8fa",
          borderBottom: "1px solid #cbd6e2",
        }}
      >
        <span
          style={{
            fontWeight: 500,
            fontSize: 12,
            color: "#516f90",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Agent Reasoning
        </span>
      </div>

      <div style={{ padding: 16 }}>
        {/* Quick Stats Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {/* Intent */}
          <div
            style={{
              padding: 14,
              backgroundColor: "#e5f5f8",
              borderRadius: 4,
              border: "1px solid #b0d6e0",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#0091ae",
                marginBottom: 4,
                textTransform: "uppercase",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              Intent Classification
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#33475b" }}>{intent || "—"}</div>
            {confidence !== null && (
              <div style={{ fontSize: 12, color: "#7c98b6", marginTop: 4 }}>
                Confidence: {Math.round(confidence * 100)}%
              </div>
            )}
          </div>

          {/* Verification */}
          <div
            style={{
              padding: 14,
              backgroundColor: verification?.status === "verified" ? "#e5f8f4" : "#fef6e7",
              borderRadius: 4,
              border: `1px solid ${verification?.status === "verified" ? "#a8e4d0" : "#f5c26b"}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: verification?.status === "verified" ? "#00a182" : "#b36b00",
                marginBottom: 4,
                textTransform: "uppercase",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              Customer Verification
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#33475b" }}>
              {verification?.status || "Not verified"}
            </div>
            {verification?.orderNumber && (
              <div style={{ fontSize: 12, color: "#7c98b6", marginTop: 4 }}>
                Order: #{verification.orderNumber}
              </div>
            )}
            {verification?.flags && verification.flags.length > 0 && (
              <div style={{ fontSize: 12, color: "#c93b41", marginTop: 4 }}>
                Flags: {verification.flags.join(", ")}
              </div>
            )}
          </div>

          {/* KB Docs Used */}
          <div
            style={{
              padding: 14,
              backgroundColor: "#eaf0f6",
              borderRadius: 4,
              border: "1px solid #cbd6e2",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#516f90",
                marginBottom: 4,
                textTransform: "uppercase",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              Knowledge Base
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#33475b" }}>
              {kbDocs.length} doc{kbDocs.length !== 1 ? "s" : ""} used
            </div>
            {kbDocs.length > 0 && (
              <div style={{ fontSize: 12, color: "#7c98b6", marginTop: 4 }}>
                {kbDocs.map((d) => d.title).join(", ")}
              </div>
            )}
          </div>

          {/* Policy Gate */}
          <div
            style={{
              padding: 14,
              backgroundColor: draftInfo?.policyGatePassed ? "#e5f8f4" : "#fde8e9",
              borderRadius: 4,
              border: `1px solid ${draftInfo?.policyGatePassed ? "#a8e4d0" : "#f2545b"}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: draftInfo?.policyGatePassed ? "#00a182" : "#c93b41",
                marginBottom: 4,
                textTransform: "uppercase",
                fontWeight: 500,
                letterSpacing: "0.5px",
              }}
            >
              Policy Gate
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#33475b" }}>
              {draftInfo?.policyGatePassed ? "✓ Passed" : "✗ Blocked"}
            </div>
            {draftInfo?.policyViolations && draftInfo.policyViolations.length > 0 && (
              <div style={{ fontSize: 12, color: "#c93b41", marginTop: 4 }}>
                {draftInfo.policyViolations.join(", ")}
              </div>
            )}
          </div>
        </div>

        {/* Token Usage */}
        {draftInfo && (draftInfo.promptTokens > 0 || draftInfo.completionTokens > 0) && (
          <div style={{ fontSize: 12, color: "#7c98b6", marginBottom: 16 }}>
            Tokens: {draftInfo.promptTokens} prompt + {draftInfo.completionTokens} completion
          </div>
        )}

      {/* Chat with Agent Section */}
      <div
        style={{
          marginTop: 16,
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setShowChat(!showChat)}
          style={{
            width: "100%",
            padding: "12px 16px",
            backgroundColor: "#0091ae",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            💬 Chat with Lina about this thread
            {chatMessages.length > 0 && (
              <span style={{ opacity: 0.8, marginLeft: 8, fontSize: 13 }}>
                ({chatMessages.length} messages)
              </span>
            )}
          </span>
          <span style={{ fontSize: 12 }}>{showChat ? "▼" : "▶"}</span>
        </button>

        {showChat && (
          <div style={{ backgroundColor: "#f5f8fa" }}>
            {/* Chat Header with Actions */}
            {chatMessages.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "8px 12px",
                  borderBottom: "1px solid #cbd6e2",
                  gap: 8,
                }}
              >
                <button
                  onClick={clearChatHistory}
                  style={{
                    padding: "6px 12px",
                    backgroundColor: "transparent",
                    color: "#516f90",
                    border: "1px solid #cbd6e2",
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
                  backgroundColor: "#fef6e7",
                  borderBottom: "1px solid #f5c26b",
                }}
              >
                <span style={{ color: "#b36b00", fontSize: 14 }}>
                  💡 Want to make this instruction permanent?
                </span>
                <button
                  onClick={handleCreateFeedback}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#f5c26b",
                    color: "#33475b",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 13,
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
                <div style={{ color: "#7c98b6", fontStyle: "italic" }}>
                  Loading conversation history...
                </div>
              ) : chatMessages.length === 0 ? (
                <div style={{ color: "#7c98b6", fontStyle: "italic", fontSize: 14 }}>
                  Ask Lina anything about this thread - why she responded this way,
                  what KB docs she used, how to handle the case differently...
                  <br /><br />
                  <strong style={{ color: "#516f90" }}>Tip:</strong> Lina now uses your real agent instructions and will cite
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
                        borderRadius: 4,
                        maxWidth: "80%",
                        backgroundColor: msg.role === "user" ? "#0091ae" : "white",
                        color: msg.role === "user" ? "white" : "#33475b",
                        border: msg.role === "user" ? "none" : "1px solid #cbd6e2",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          marginBottom: 4,
                          opacity: 0.8,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {msg.role === "user" ? "You" : "Lina"}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{msg.content}</div>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div style={{ color: "#7c98b6", fontStyle: "italic" }}>
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
                borderTop: "1px solid #cbd6e2",
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
                  padding: 10,
                  border: "1px solid #cbd6e2",
                  borderRadius: 4,
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputMessage.trim()}
                style={{
                  padding: "10px 20px",
                  backgroundColor: isLoading ? "#cbd6e2" : "#0091ae",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  fontWeight: 500,
                  fontSize: 14,
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
