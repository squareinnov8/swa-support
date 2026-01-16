"use client";

import { useState } from "react";

/**
 * Types for customer context data
 */
export type CustomerContextData = {
  status: "verified" | "flagged" | "pending" | "not_found";
  customerName: string | null;
  customerEmail: string | null;
  totalOrders: number | null;
  totalSpent: number | null;
  likelyProduct: string | null;
  recentOrders: Array<{
    orderNumber: string;
    status: string;
    fulfillmentStatus: string;
    createdAt: string;
    items: string[];
  }> | null;
  flags: string[];
};

export type SupportTicket = {
  id: string;
  subject: string;
  state: string;
  createdAt: string;
};

type Props = {
  customer: CustomerContextData | null;
  previousTickets: SupportTicket[];
};

// Status colors for orders
const ORDER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PAID: { bg: "#dcfce7", text: "#166534" },
  PENDING: { bg: "#fef3c7", text: "#92400e" },
  REFUNDED: { bg: "#fee2e2", text: "#991b1b" },
  PARTIALLY_REFUNDED: { bg: "#fef3c7", text: "#92400e" },
  AUTHORIZED: { bg: "#dbeafe", text: "#1e40af" },
};

const FULFILLMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  FULFILLED: { bg: "#dcfce7", text: "#166534" },
  UNFULFILLED: { bg: "#fef3c7", text: "#92400e" },
  PARTIALLY_FULFILLED: { bg: "#dbeafe", text: "#1e40af" },
  IN_PROGRESS: { bg: "#ede9fe", text: "#6b21a8" },
};

const VERIFICATION_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  verified: { bg: "#dcfce7", text: "#166534" },
  flagged: { bg: "#fee2e2", text: "#991b1b" },
  pending: { bg: "#fef3c7", text: "#92400e" },
  not_found: { bg: "#f3f4f6", text: "#6b7280" },
};

export function CustomerContextPanel({ customer, previousTickets }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!customer || customer.status === "not_found" || customer.status === "pending") {
    return null;
  }

  const statusColors = VERIFICATION_STATUS_COLORS[customer.status] || VERIFICATION_STATUS_COLORS.pending;

  return (
    <div
      style={{
        marginTop: 24,
        border: "1px solid #d1fae5",
        borderRadius: 8,
        backgroundColor: "#f0fdf4",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          backgroundColor: "#dcfce7",
          cursor: "pointer",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>CUSTOMER CONTEXT</span>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: statusColors.bg,
              color: statusColors.text,
              textTransform: "uppercase",
            }}
          >
            {customer.status}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          {isExpanded ? "▼" : "▶"}
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: 16 }}>
          {/* Customer Info */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {customer.customerName || "Unknown Customer"}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              {customer.customerEmail}
            </div>
            <div style={{ fontSize: 13, marginTop: 8, color: "#374151" }}>
              <span style={{ marginRight: 16 }}>
                <strong>{customer.totalOrders ?? 0}</strong> orders
              </span>
              <span>
                <strong>${(customer.totalSpent ?? 0).toLocaleString()}</strong> lifetime value
              </span>
            </div>
          </div>

          {/* Flags Warning */}
          {customer.flags && customer.flags.length > 0 && (
            <div
              style={{
                padding: 12,
                marginBottom: 16,
                backgroundColor: "#fee2e2",
                borderRadius: 6,
                border: "1px solid #fecaca",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <strong style={{ color: "#991b1b", fontSize: 14 }}>
                  Customer Flags: {customer.flags.join(", ")}
                </strong>
              </div>
            </div>
          )}

          {/* Likely Product */}
          {customer.likelyProduct && (
            <div
              style={{
                padding: 12,
                marginBottom: 16,
                backgroundColor: "#dbeafe",
                borderRadius: 6,
                border: "1px solid #bfdbfe",
              }}
            >
              <div style={{ fontSize: 12, color: "#1e40af", fontWeight: 600, marginBottom: 4 }}>
                LIKELY PRODUCT
              </div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {customer.likelyProduct}
              </div>
            </div>
          )}

          {/* Order History */}
          {customer.recentOrders && customer.recentOrders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                ORDER HISTORY
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {customer.recentOrders.map((order, index) => {
                  const statusColor = ORDER_STATUS_COLORS[order.status] || { bg: "#f3f4f6", text: "#6b7280" };
                  const fulfillmentColor = FULFILLMENT_STATUS_COLORS[order.fulfillmentStatus] || { bg: "#f3f4f6", text: "#6b7280" };

                  return (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        backgroundColor: "white",
                        borderRadius: 6,
                        border: "1px solid #e5e7eb",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontWeight: 500 }}>{order.orderNumber}</span>
                        <span style={{ color: "#6b7280" }}>
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            backgroundColor: statusColor.bg,
                            color: statusColor.text,
                          }}
                        >
                          {order.status}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            backgroundColor: fulfillmentColor.bg,
                            color: fulfillmentColor.text,
                          }}
                        >
                          {order.fulfillmentStatus}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Previous Support Tickets */}
          {previousTickets.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#374151" }}>
                PREVIOUS TICKETS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {previousTickets.map((ticket) => (
                  <a
                    key={ticket.id}
                    href={`/admin/thread/${ticket.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      backgroundColor: "white",
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      fontSize: 13,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "#2563eb" }}>
                      {ticket.subject || "(no subject)"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#6b7280", fontSize: 12 }}>
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: ticket.state === "RESOLVED" ? "#dcfce7" : "#f3f4f6",
                          color: ticket.state === "RESOLVED" ? "#166534" : "#6b7280",
                        }}
                      >
                        {ticket.state}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
