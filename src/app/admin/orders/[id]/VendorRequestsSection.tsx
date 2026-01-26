"use client";

import { useState } from "react";
import type { VendorRequestType, VendorRequestStatus } from "@/lib/orders/types";

// Type for the vendor request record from database
interface VendorRequestRecord {
  id: string;
  order_id: string;
  order_vendor_id: string;
  request_type: VendorRequestType;
  description: string;
  options?: string[];
  status: VendorRequestStatus;
  customer_contacted_at?: string;
  customer_response_at?: string;
  forwarded_at?: string;
  response_data?: {
    requestType: VendorRequestType;
    answer?: string;
    attachments?: Array<{
      filename: string;
      mimeType: string;
      size: number;
      gmailAttachmentId: string;
      validated: boolean;
      validationResult?: {
        isValid: boolean;
        description: string;
        confidence: number;
        issues?: string[];
      };
    }>;
    validated: boolean;
    validationNotes?: string;
  };
  customer_message_id?: string;
  created_at: string;
  updated_at: string;
}

const REQUEST_TYPE_LABELS: Record<VendorRequestType, string> = {
  dashboard_photo: "Dashboard Photo",
  color_confirmation: "Color Confirmation",
  memory_confirmation: "Memory/Storage",
  address_validation: "Address Validation",
  vehicle_confirmation: "Vehicle Confirmation",
  other: "Other",
};

const REQUEST_TYPE_ICONS: Record<VendorRequestType, string> = {
  dashboard_photo: "📷",
  color_confirmation: "🎨",
  memory_confirmation: "💾",
  address_validation: "📍",
  vehicle_confirmation: "🚗",
  other: "📝",
};

const STATUS_STYLES: Record<VendorRequestStatus, { bg: string; text: string }> = {
  pending: { bg: "#fef6e7", text: "#b36b00" },
  received: { bg: "#e8f4fd", text: "#2563eb" },
  validated: { bg: "#e5f8f4", text: "#00a182" },
  forwarded: { bg: "#dcfce7", text: "#16a34a" },
  rejected: { bg: "#fde8e9", text: "#c93b41" },
};

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

function AttachmentImage({
  messageId,
  attachmentId,
  filename,
  validationResult
}: {
  messageId: string;
  attachmentId: string;
  filename: string;
  validationResult?: {
    isValid: boolean;
    description: string;
    confidence: number;
    issues?: string[];
  };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const imageUrl = `/api/admin/attachments?messageId=${encodeURIComponent(messageId)}&attachmentId=${encodeURIComponent(attachmentId)}`;

  if (hasError) {
    return (
      <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs text-center p-2">
        Failed to load image
      </div>
    );
  }

  return (
    <>
      <div
        className="relative cursor-pointer group"
        onClick={() => setIsExpanded(true)}
      >
        <img
          src={imageUrl}
          alt={filename}
          className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:border-blue-400 transition-colors"
          onError={() => setHasError(true)}
        />
        {validationResult && (
          <div
            className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              validationResult.isValid
                ? "bg-green-500 text-white"
                : "bg-red-500 text-white"
            }`}
            title={validationResult.isValid ? "Validated" : "Validation failed"}
          >
            {validationResult.isValid ? "✓" : "✕"}
          </div>
        )}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-colors flex items-center justify-center">
          <span className="text-white opacity-0 group-hover:opacity-100 text-xs font-medium">
            Click to expand
          </span>
        </div>
      </div>

      {/* Expanded modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <div className="font-medium">{filename}</div>
                {validationResult && (
                  <div className={`text-sm ${validationResult.isValid ? "text-green-600" : "text-red-600"}`}>
                    {validationResult.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              <img
                src={imageUrl}
                alt={filename}
                className="max-w-full max-h-[70vh] object-contain mx-auto"
              />
            </div>
            {validationResult && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`font-medium ${validationResult.isValid ? "text-green-600" : "text-red-600"}`}>
                      {validationResult.isValid ? "✓ Validated" : "✕ Validation Failed"}
                    </span>
                    <span className="text-gray-500">
                      ({Math.round(validationResult.confidence * 100)}% confidence)
                    </span>
                  </div>
                  {validationResult.issues && validationResult.issues.length > 0 && (
                    <div className="mt-2">
                      <div className="text-gray-500 mb-1">Issues:</div>
                      <ul className="list-disc list-inside text-gray-700">
                        {validationResult.issues.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function VendorRequestsSection({
  requests
}: {
  requests: VendorRequestRecord[];
}) {
  if (!requests || requests.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">
        Vendor Requests
      </h2>
      <div className="space-y-4">
        {requests.map((request) => {
          const statusStyle = STATUS_STYLES[request.status] || STATUS_STYLES.pending;
          const icon = REQUEST_TYPE_ICONS[request.request_type] || "📝";
          const label = REQUEST_TYPE_LABELS[request.request_type] || request.request_type;

          return (
            <div
              key={request.id}
              className="p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{icon}</span>
                  <span className="font-medium">{label}</span>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded font-medium"
                  style={{
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.text,
                  }}
                >
                  {request.status}
                </span>
              </div>

              {/* Description */}
              <div className="text-sm text-gray-600 mb-3">
                {request.description}
              </div>

              {/* Options (for confirmations) */}
              {request.options && request.options.length > 0 && (
                <div className="text-sm mb-3">
                  <span className="text-gray-500">Options: </span>
                  {request.options.join(" / ")}
                </div>
              )}

              {/* Timeline */}
              <div className="text-xs text-gray-400 space-y-1 mb-3">
                <div>Created: {formatDate(request.created_at)}</div>
                {request.customer_contacted_at && (
                  <div>Customer contacted: {formatDate(request.customer_contacted_at)}</div>
                )}
                {request.customer_response_at && (
                  <div>Customer responded: {formatDate(request.customer_response_at)}</div>
                )}
                {request.forwarded_at && (
                  <div>Forwarded to vendor: {formatDate(request.forwarded_at)}</div>
                )}
              </div>

              {/* Response Data */}
              {request.response_data && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Customer Response
                  </div>

                  {/* Text answer */}
                  {request.response_data.answer && (
                    <div className="text-sm bg-white p-2 rounded border border-gray-200 mb-2">
                      <span className="text-gray-500">Answer: </span>
                      <span className="font-medium">{request.response_data.answer}</span>
                    </div>
                  )}

                  {/* Attachments */}
                  {request.response_data.attachments &&
                   request.response_data.attachments.length > 0 &&
                   request.customer_message_id && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-2">
                        Attachments ({request.response_data.attachments.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {request.response_data.attachments.map((att, i) => (
                          <AttachmentImage
                            key={i}
                            messageId={request.customer_message_id!}
                            attachmentId={att.gmailAttachmentId}
                            filename={att.filename}
                            validationResult={att.validationResult}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation notes */}
                  {request.response_data.validationNotes && (
                    <div className="mt-2 text-xs text-gray-500 italic">
                      {request.response_data.validationNotes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
