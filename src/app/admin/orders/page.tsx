import { supabase } from "@/lib/db";
import type { OrderStatus } from "@/lib/orders/types";
import { LocalTimestamp } from "../LocalTimestamp";
import Link from "next/link";

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

type SearchParams = {
  status?: string;
  search?: string;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const statusFilter = params.status || "";
  const searchQuery = params.search || "";


  // Build query
  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  if (searchQuery) {
    query = query.or(
      `order_number.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,customer_email.ilike.%${searchQuery}%`
    );
  }

  const { data: orders, error } = await query.limit(100);

  // Get vendor info for each order
  const orderIds = orders?.map((o) => o.id) || [];
  const { data: orderVendors } = await supabase
    .from("order_vendors")
    .select("order_id, vendor_name, status")
    .in("order_id", orderIds);

  // Group vendors by order
  const vendorsByOrder = new Map<
    string,
    Array<{ vendor_name: string; status: string }>
  >();
  for (const ov of orderVendors || []) {
    const existing = vendorsByOrder.get(ov.order_id) || [];
    existing.push({ vendor_name: ov.vendor_name, status: ov.status });
    vendorsByOrder.set(ov.order_id, existing);
  }

  // Get counts for status filter
  const { data: statusCounts } = await supabase
    .from("orders")
    .select("status")
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      for (const o of data || []) {
        counts[o.status] = (counts[o.status] || 0) + 1;
      }
      return { data: counts };
    });

  const statuses: OrderStatus[] = [
    "new",
    "pending_review",
    "processing",
    "fulfilled",
    "shipped",
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Back to Inbox
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        {/* Search */}
        <form method="GET" className="flex-1 min-w-[200px] max-w-md">
          <input type="hidden" name="status" value={statusFilter} />
          <input
            type="text"
            name="search"
            placeholder="Search orders..."
            defaultValue={searchQuery}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </form>

        {/* Status Filter */}
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/orders"
            className={`px-3 py-1.5 text-sm rounded-lg ${
              !statusFilter
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </Link>
          {statuses.map((status) => {
            const count = statusCounts?.[status] || 0;
            const colors = STATUS_COLORS[status];
            return (
              <Link
                key={status}
                href={`/admin/orders?status=${status}${searchQuery ? `&search=${searchQuery}` : ""}`}
                className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-2 ${
                  statusFilter === status
                    ? "bg-gray-900 text-white"
                    : "hover:bg-gray-100"
                }`}
                style={
                  statusFilter !== status
                    ? { backgroundColor: colors.bg, color: colors.text }
                    : undefined
                }
              >
                {STATUS_LABELS[status]}
                {count > 0 && (
                  <span className="opacity-70">({count})</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Orders Table */}
      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          Error loading orders: {error.message}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor(s)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order) => {
                const statusColors =
                  STATUS_COLORS[order.status as OrderStatus] ||
                  STATUS_COLORS.new;
                const vendors = vendorsByOrder.get(order.id) || [];
                const lineItems = order.line_items as Array<{ title: string }> || [];
                const productTitle = lineItems[0]?.title || "Unknown Product";

                return (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-medium text-gray-900 hover:text-blue-600"
                        >
                          #{order.order_number}
                        </Link>
                        <div className="text-sm text-gray-500 truncate max-w-[200px]">
                          {productTitle}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {order.customer_name || "Unknown"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {order.customer_email}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {vendors.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {vendors.map((v, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              {v.vendor_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: statusColors.bg,
                          color: statusColors.text,
                        }}
                      >
                        {STATUS_LABELS[order.status as OrderStatus] ||
                          order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <LocalTimestamp
                        timestamp={order.last_action_at || order.created_at}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-gray-500 text-lg mb-2">No orders found</div>
          <div className="text-gray-400 text-sm">
            {searchQuery || statusFilter
              ? "Try adjusting your filters"
              : "Orders will appear here when Lina processes them"}
          </div>
        </div>
      )}
    </div>
  );
}
