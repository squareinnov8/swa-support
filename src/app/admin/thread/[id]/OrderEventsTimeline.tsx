/**
 * Order Events Timeline
 *
 * Displays Shopify order events (shipping, returns, refunds) in a timeline format.
 * Can be shown standalone or interleaved with messages.
 */

import type { OrderEvent, OrderEventType } from "@/lib/shopify/types";

interface OrderEventsTimelineProps {
  events: OrderEvent[];
  orderNumber: string;
}

// Event type styling
const EVENT_STYLES: Record<OrderEventType, { bg: string; text: string; icon: string }> = {
  order_created: { bg: "#e5f5f8", text: "#0091ae", icon: "🛒" },
  payment_captured: { bg: "#e5f8f4", text: "#00a182", icon: "💳" },
  fulfillment_created: { bg: "#e5f8f4", text: "#00a182", icon: "📦" },
  in_transit: { bg: "#fef6e7", text: "#b36b00", icon: "🚚" },
  delivered: { bg: "#e5f8f4", text: "#00a182", icon: "✅" },
  return_requested: { bg: "#fef6e7", text: "#b36b00", icon: "↩️" },
  return_in_progress: { bg: "#fef6e7", text: "#b36b00", icon: "📬" },
  return_closed: { bg: "#e5f8f4", text: "#00a182", icon: "✅" },
  refund_processed: { bg: "#e5f8f4", text: "#00a182", icon: "💰" },
  order_cancelled: { bg: "#fde8e9", text: "#c93b41", icon: "❌" },
};

export function OrderEventsTimeline({ events, orderNumber }: OrderEventsTimelineProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: "#ffffff",
      border: "1px solid #cbd6e2",
      borderRadius: 4,
      marginTop: 16,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        backgroundColor: "#f5f8fa",
        borderBottom: "1px solid #cbd6e2",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#33475b", margin: 0 }}>
          Order Activity (
          <a
            href={`https://admin.shopify.com/store/squarewheels/orders?query=${encodeURIComponent(orderNumber)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#0091ae",
              textDecoration: "none",
            }}
          >
            {orderNumber} ↗
          </a>
          )
        </h2>
        <span style={{ fontSize: 12, color: "#7c98b6" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ padding: 16 }}>
        {events.map((event, index) => {
          const style = EVENT_STYLES[event.type];
          const isLast = index === events.length - 1;

          return (
            <div
              key={`${event.type}-${event.timestamp}`}
              style={{
                display: "flex",
                gap: 12,
                paddingBottom: isLast ? 0 : 16,
                marginBottom: isLast ? 0 : 16,
                borderBottom: isLast ? "none" : "1px solid #eaf0f6",
              }}
            >
              {/* Icon */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: style.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                flexShrink: 0,
              }}>
                {style.icon}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: style.text,
                  }}>
                    {event.title}
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: "#7c98b6",
                    whiteSpace: "nowrap",
                  }}>
                    {formatEventDate(event.timestamp)}
                  </span>
                </div>

                <p style={{
                  fontSize: 13,
                  color: "#516f90",
                  margin: 0,
                  lineHeight: 1.5,
                }}>
                  {event.description}
                </p>

                {/* Metadata */}
                {event.metadata && (
                  <div style={{
                    marginTop: 8,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}>
                    {event.metadata.trackingNumber && (
                      <TrackingBadge
                        trackingNumber={event.metadata.trackingNumber}
                        trackingUrl={event.metadata.trackingUrl}
                        carrier={event.metadata.carrier}
                      />
                    )}
                    {event.metadata.returnReason && (
                      <MetadataBadge
                        label="Reason"
                        value={event.metadata.returnReason}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackingBadge({
  trackingNumber,
  trackingUrl,
  carrier,
}: {
  trackingNumber: string;
  trackingUrl?: string;
  carrier?: string;
}) {
  const content = (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "4px 8px",
      borderRadius: 3,
      fontSize: 11,
      backgroundColor: "#eaf0f6",
      color: "#516f90",
    }}>
      <span>📦</span>
      <span>{carrier && `${carrier}: `}{trackingNumber}</span>
    </span>
  );

  if (trackingUrl) {
    return (
      <a
        href={trackingUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          textDecoration: "none",
          color: "inherit",
        }}
      >
        {content}
      </a>
    );
  }

  return content;
}

function MetadataBadge({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "4px 8px",
      borderRadius: 3,
      fontSize: 11,
      backgroundColor: "#fef6e7",
      color: "#b36b00",
    }}>
      <span style={{ fontWeight: 500 }}>{label}:</span>
      <span>{value}</span>
    </span>
  );
}

function formatEventDate(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}

/**
 * Compact version for showing inline with messages
 */
export function OrderEventBadge({ event }: { event: OrderEvent }) {
  const style = EVENT_STYLES[event.type];

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 12px",
      backgroundColor: style.bg,
      borderRadius: 4,
      border: `1px solid ${style.text}22`,
    }}>
      <span style={{ fontSize: 14 }}>{style.icon}</span>
      <div>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: style.text,
        }}>
          {event.title}
        </span>
        <span style={{
          fontSize: 11,
          color: "#7c98b6",
          marginLeft: 8,
        }}>
          {formatEventDate(event.timestamp)}
        </span>
      </div>
    </div>
  );
}
