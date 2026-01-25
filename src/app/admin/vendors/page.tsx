import { supabase } from "@/lib/db";
import Link from "next/link";
import { VendorList } from "./VendorList";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("*")
    .order("name");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="text-gray-500 hover:text-gray-700"
          >
            &larr; Inbox
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
        </div>
      </div>

      {/* Description */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          Manage vendor contacts for order fulfillment. When orders are received,
          Lina matches products to vendors based on product patterns and forwards
          order details to the appropriate contact emails.
        </p>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          Error loading vendors: {error.message}
        </div>
      ) : (
        <VendorList initialVendors={vendors || []} />
      )}
    </div>
  );
}
