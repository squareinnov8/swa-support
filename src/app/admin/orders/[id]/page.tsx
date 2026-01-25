import { supabase } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/types";
import { LocalTimestamp } from "../../LocalTimestamp";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "./OrderActions";

export const dynamic = "force-dynamic";

// Color palette for order status badges
const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  new: { bg: "#e5f5f8", text: "#0091ae" },
  pending_review: { bg: "#fef6e7", text: "#b36b00" },
  processing: { bg: "#eaf0f6", text: "#516f90" },
  fulfilled: { bg: "#e8f4fd", text: "#2563eb" },
  shipped: { bg: "#e5f8f4", text: "#00a182" },
  delivered: { bg: "#dcfce7", text: "#16a34a" },
  return_requested: { bg: "#fef6e7", text: "#b36b00" },
  return_in_progress: { bg: "#fde8e9", text: "#c93b41" },
  return_delivered: { bg: "#fef6e7", text: "#b36b00" },
  refunded: { bg: "#f3f4f6", text: "#6b7280" },
  cancelled: { bg: "#f3f4f6", text: "#6b7280" },
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  pending_review: "Pending Review",
  processing: "Processing",
  fulfilled: "Fulfilled",
  shipped: "Shipped",
  delivered: "Delivered",
  return_requested: "Return Requested",
  return_in_progress: "Return In Progress",
  return_delivered: "Return Delivered",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch order
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) {
    notFound();
  }

  // Fetch vendors
  const { data: vendors } = await supabase
    .from("order_vendors")
    .select("*")
    .eq("order_id", id);

  // Fetch events
  const { data: events } = await supabase
    .from("order_events")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const statusColors =
    STATUS_COLORS[order.status as OrderStatus] || STATUS_COLORS.new;
  const shippingAddress = order.shipping_address as {
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  } | null;
  const lineItems =
    (order.line_items as Array<{ title: string; quantity?: number }>) || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/orders"
            className="text-gray-500 hover:text-gray-700"
          >
            &larr; Orders
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            Order #{order.order_number}
          </h1>
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
            style={{
              backgroundColor: statusColors.bg,
              color: statusColors.text,
            }}
          >
            {STATUS_LABELS[order.status as OrderStatus] || order.status}
          </span>
        </div>

        {/* Actions for pending_review orders */}
        {order.status === "pending_review" && (
          <OrderActions orderId={order.id} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Customer</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Name</div>
                <div className="font-medium">{order.customer_name || "-"}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Email</div>
                <div className="font-medium">{order.customer_email}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Phone</div>
                <div className="font-medium">{order.customer_phone || "-"}</div>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {shippingAddress && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Shipping Address
              </h2>
              <div className="text-sm">
                {shippingAddress.name && <div>{shippingAddress.name}</div>}
                {shippingAddress.street && <div>{shippingAddress.street}</div>}
                <div>
                  {shippingAddress.city}, {shippingAddress.state}{" "}
                  {shippingAddress.zip}
                </div>
                {shippingAddress.country && <div>{shippingAddress.country}</div>}
              </div>
            </div>
          )}

          {/* Line Items */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Products</h2>
            {lineItems.length > 0 ? (
              <div className="space-y-2">
                {lineItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-sm text-gray-500">
                      Qty: {item.quantity || 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No products listed</div>
            )}
          </div>

          {/* Vendor Assignments */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Vendors</h2>
            {vendors && vendors.length > 0 ? (
              <div className="space-y-4">
                {vendors.map((vendor) => (
                  <div
                    key={vendor.id}
                    className="p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{vendor.vendor_name}</div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          vendor.status === "shipped"
                            ? "bg-green-100 text-green-700"
                            : vendor.status === "forwarded"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {vendor.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {vendor.vendor_emails?.join(", ")}
                    </div>
                    {vendor.tracking_number && (
                      <div className="mt-2 text-sm">
                        <span className="text-gray-500">Tracking:</span>{" "}
                        <span className="font-mono">
                          {vendor.tracking_carrier}: {vendor.tracking_number}
                        </span>
                      </div>
                    )}
                    {vendor.forwarded_at && (
                      <div className="text-xs text-gray-400 mt-1">
                        Forwarded:{" "}
                        <LocalTimestamp
                          timestamp={vendor.forwarded_at}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                No vendor assignments yet
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Events */}
        <div className="space-y-6">
          {/* Risk Assessment */}
          {(order.risk_score !== null || order.risk_reasons?.length > 0) && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Risk Assessment
              </h2>
              {order.risk_score !== null && (
                <div className="mb-3">
                  <div className="text-sm text-gray-500">Score</div>
                  <div className="font-medium text-lg">
                    {(order.risk_score * 100).toFixed(0)}%
                  </div>
                </div>
              )}
              {order.risk_reasons && order.risk_reasons.length > 0 && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">Reasons</div>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {order.risk_reasons.map((reason: string, i: number) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {order.reviewed_by && (
                <div className="mt-3 text-xs text-gray-400">
                  Reviewed by {order.reviewed_by} on{" "}
                  <LocalTimestamp timestamp={order.reviewed_at} />
                </div>
              )}
            </div>
          )}

          {/* Event Timeline */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Activity
            </h2>
            {events && events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {event.event_type.replace(/_/g, " ")}
                      </div>
                      <div className="text-gray-500 text-xs">
                        <LocalTimestamp timestamp={event.created_at} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">No activity yet</div>
            )}
          </div>

          {/* Timestamps */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Timestamps
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Created</span>
                <LocalTimestamp timestamp={order.created_at} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Action</span>
                <LocalTimestamp timestamp={order.last_action_at} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
