"use client";

/**
 * Client-side timestamp component that displays times in the user's local timezone.
 * Server components use the server's timezone (usually UTC), which causes incorrect
 * time display for users in different timezones.
 */

type Props = {
  timestamp: string;
  showDate?: boolean;
};

export function LocalTimestamp({ timestamp, showDate = true }: Props) {
  const date = new Date(timestamp);

  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (showDate) {
    return (
      <>
        {dateStr}
        <span style={{ color: "#99acc2", margin: "0 4px" }}>·</span>
        {timeStr}
      </>
    );
  }

  return <>{timeStr}</>;
}
