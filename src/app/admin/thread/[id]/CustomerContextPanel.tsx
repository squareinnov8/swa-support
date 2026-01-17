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

// HubSpot-inspired status colors for orders
const ORDER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PAID: { bg: "#e5f8f4", text: "#00a182" },
  PENDING: { bg: "#fef6e7", text: "#b36b00" },
  REFUNDED: { bg: "#fde8e9", text: "#c93b41" },
  PARTIALLY_REFUNDED: { bg: "#fef6e7", text: "#b36b00" },
  AUTHORIZED: { bg: "#e5f5f8", text: "#0091ae" },
};

const FULFILLMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  FULFILLED: { bg: "#e5f8f4", text: "#00a182" },
  UNFULFILLED: { bg: "#fef6e7", text: "#b36b00" },
  PARTIALLY_FULFILLED: { bg: "#e5f5f8", text: "#0091ae" },
  IN_PROGRESS: { bg: "#eaf0f6", text: "#516f90" },
};

const VERIFICATION_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  verified: { bg: "#e5f8f4", text: "#00a182" },
  flagged: { bg: "#fde8e9", text: "#c93b41" },
  pending: { bg: "#fef6e7", text: "#b36b00" },
  not_found: { bg: "#eaf0f6", text: "#7c98b6" },
};

export function CustomerContextPanel({ customer, previousTickets }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Show "Unknown Customer" state when no customer data
  if (!customer) {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid #cbd6e2",
          borderRadius: 4,
          backgroundColor: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#516f90" }}>
            Unknown Customer
          </span>
        </div>
        <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#7c98b6" }}>
          No customer information found. Customer has not been verified via order lookup.
        </p>
      </div>
    );
  }

  // Show pending/not_found state with helpful message
  if (customer.status === "not_found" || customer.status === "pending") {
    return (
      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid #f5c26b",
          borderRadius: 4,
          backgroundColor: "#fef6e7",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#b36b00" }}>
            {customer.status === "pending" ? "Verification Pending" : "Customer Not Found"}
          </span>
        </div>
        <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#b36b00" }}>
          {customer.status === "pending"
            ? "Waiting for order number to verify customer identity."
            : "No matching customer found in Shopify. Email may be new or unregistered."}
        </p>
        {customer.customerEmail && (
          <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#516f90" }}>
            Email: {customer.customerEmail}
          </p>
        )}
      </div>
    );
  }

  const statusColors = VERIFICATION_STATUS_COLORS[customer.status] || VERIFICATION_STATUS_COLORS.pending;

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid #cbd6e2",
        borderRadius: 4,
        backgroundColor: "#ffffff",
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
          backgroundColor: "#f5f8fa",
          borderBottom: isExpanded ? "1px solid #cbd6e2" : "none",
          cursor: "pointer",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontWeight: 500,
            fontSize: 12,
            color: "#516f90",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>Customer Context</span>
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 500,
              backgroundColor: statusColors.bg,
              color: statusColors.text,
              textTransform: "uppercase",
            }}
          >
            {customer.status}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#7c98b6" }}>
          {isExpanded ? "▼" : "▶"}
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: 16 }}>
          {/* Customer Info */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#33475b", marginBottom: 4 }}>
              {customer.customerName || "Unknown Customer"}
            </div>
            <div style={{ fontSize: 14, color: "#516f90" }}>
              {customer.customerEmail}
            </div>
            <div style={{ fontSize: 13, marginTop: 10, color: "#33475b" }}>
              <span style={{ marginRight: 20 }}>
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
                backgroundColor: "#fde8e9",
                borderRadius: 4,
                border: "1px solid #f2545b",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: "#c93b41", fontSize: 13 }}>
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
                backgroundColor: "#e5f5f8",
                borderRadius: 4,
                border: "1px solid #b0d6e0",
              }}
            >
              <div style={{ fontSize: 11, color: "#0091ae", fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Likely Product
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#33475b" }}>
                {customer.likelyProduct}
              </div>
            </div>
          )}

          {/* Order History */}
          {customer.recentOrders && customer.recentOrders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Order History
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {customer.recentOrders.map((order, index) => {
                  const statusColor = ORDER_STATUS_COLORS[order.status] || { bg: "#eaf0f6", text: "#7c98b6" };
                  const fulfillmentColor = FULFILLMENT_STATUS_COLORS[order.fulfillmentStatus] || { bg: "#eaf0f6", text: "#7c98b6" };

                  return (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        backgroundColor: "#f5f8fa",
                        borderRadius: 4,
                        border: "1px solid #eaf0f6",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontWeight: 500, color: "#33475b" }}>{order.orderNumber}</span>
                        <span style={{ color: "#7c98b6" }}>
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 3,
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
                            borderRadius: 3,
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
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8, color: "#516f90", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Previous Tickets
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {previousTickets.map((ticket) => (
                  <a
                    key={ticket.id}
                    href={`/admin/thread/${ticket.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      backgroundColor: "#f5f8fa",
                      borderRadius: 4,
                      border: "1px solid #eaf0f6",
                      fontSize: 13,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "#0091ae" }}>
                      {ticket.subject || "(no subject)"}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#7c98b6", fontSize: 12 }}>
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </span>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: ticket.state === "RESOLVED" ? "#e5f8f4" : "#eaf0f6",
                          color: ticket.state === "RESOLVED" ? "#00a182" : "#7c98b6",
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
