import { useEffect, useState } from "react";

/** Returns a human-friendly relative time string, re-rendering every minute. */
export function useRelativeTime(iso: string | null | undefined): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  const remM = mins % 60;
  if (hours < 24) return remM ? `${hours}h ${remM}m ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  if (days < 30) return remH ? `${days}d ${remH}h ago` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
