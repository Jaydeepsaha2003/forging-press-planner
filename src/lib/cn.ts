import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '–';
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '–';
  return `${n.toFixed(decimals)}%`;
}

/**
 * Formats an INR amount with lakh / crore short suffix when large, otherwise
 * plain Indian-style thousands grouping. Always prefixes with ₹.
 */
export function fmtCurrency(n: number | null | undefined, opts: { short?: boolean } = {}): string {
  if (n === null || n === undefined || isNaN(n)) return '–';
  if (opts.short !== false) {
    const abs = Math.abs(n);
    if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  }
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function timeAgo(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
