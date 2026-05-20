/**
 * SIGIL — Plan gating utility
 *
 * Free tier limits (enforced client-side; server will add server-side checks
 * once Stripe is integrated):
 *
 *   Registrations: 3 per wallet (free) / unlimited (pro)
 *   Scans per day:  2 (free) / unlimited (pro)
 *   Alerts stored: 50 (free) / unlimited (pro)
 *   DMCA templates: basic (free) / all variants (pro)
 *   Admin console:  pro only
 *
 * Architecture note:
 *   - Plan is currently determined by wallet address against a hardcoded set.
 *   - Replace `getPlan()` lookup with a server call when Stripe is integrated.
 *   - All limit checks return `{ allowed: boolean; reason?: string }` so UI can
 *     surface a contextual upgrade prompt.
 */

import { Storage } from './storage';
import { Logger } from './logger';

export type Plan = 'free' | 'pro';

// ── Limit constants ───────────────────────────────────────────────────────────

export const LIMITS = {
  free: {
    maxRegistrations: 3,
    maxScansPerDay: 2,
    maxAlerts: 50,
    dmcaVariants: ['generic'] as string[],
    adminAccess: false,
  },
  pro: {
    maxRegistrations: Infinity,
    maxScansPerDay: Infinity,
    maxAlerts: Infinity,
    dmcaVariants: ['generic', 'github', 'cloudflare', 'hosting'] as string[],
    adminAccess: true,
  },
} as const;

const SCAN_COUNT_KEY = 'sigil_daily_scan_count';
const SCAN_DATE_KEY  = 'sigil_daily_scan_date';

// ── Plan resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the plan for a given wallet address.
 *
 * Current implementation: check against env-var allowlist.
 * TODO: Replace with `GET /api/plan?wallet=...` when Stripe is wired up.
 */
export async function getPlan(walletAddress: string): Promise<Plan> {
  if (!walletAddress) return 'free';

  const proWallets = (
    (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_PRO_WALLETS : '') ?? ''
  ).toLowerCase().split(',').filter(Boolean);

  if (proWallets.includes(walletAddress.toLowerCase())) return 'pro';

  // Future: fetch from server
  // try {
  //   const res = await fetch(`${API_BASE}/api/plan?wallet=${walletAddress}`);
  //   const { plan } = await res.json();
  //   return plan === 'pro' ? 'pro' : 'free';
  // } catch { return 'free'; }

  return 'free';
}

// ── Limit checks ──────────────────────────────────────────────────────────────

export interface GateResult {
  allowed: boolean;
  reason?: string;
  upgradePrompt?: string;
}

export async function canRegister(
  walletAddress: string,
  currentCount: number
): Promise<GateResult> {
  const plan = await getPlan(walletAddress);
  const limit = LIMITS[plan].maxRegistrations;
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `Free plan allows ${limit} registrations.`,
      upgradePrompt: 'Upgrade to Pro for unlimited registrations.',
    };
  }
  return { allowed: true };
}

export async function canScan(walletAddress: string): Promise<GateResult> {
  const plan = await getPlan(walletAddress);
  if (plan === 'pro') return { allowed: true };

  const limit = LIMITS.free.maxScansPerDay;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = await Storage.getItem(SCAN_DATE_KEY);
    const storedCount = parseInt((await Storage.getItem(SCAN_COUNT_KEY)) ?? '0', 10);

    const count = storedDate === today ? storedCount : 0;

    if (count >= limit) {
      return {
        allowed: false,
        reason: `Free plan allows ${limit} scan${(limit as number) !== 1 ? 's' : ''} per day.`,
        upgradePrompt: 'Upgrade to Pro for unlimited daily scans.',
      };
    }
  } catch (err: any) {
    Logger.warn('planGating', 'canScan check failed — fail open', { msg: err?.message });
  }

  return { allowed: true };
}

/** Call after a scan actually runs (not just requested) */
export async function recordScan(walletAddress: string): Promise<void> {
  const plan = await getPlan(walletAddress);
  if (plan === 'pro') return;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const storedDate = await Storage.getItem(SCAN_DATE_KEY);
    const storedCount = parseInt((await Storage.getItem(SCAN_COUNT_KEY)) ?? '0', 10);
    const count = storedDate === today ? storedCount : 0;
    await Storage.setItem(SCAN_DATE_KEY, today);
    await Storage.setItem(SCAN_COUNT_KEY, String(count + 1));
  } catch { /* non-critical */ }
}

export async function canAccessAdmin(walletAddress: string): Promise<GateResult> {
  const plan = await getPlan(walletAddress);
  if (LIMITS[plan].adminAccess) return { allowed: true };
  return {
    allowed: false,
    reason: 'Admin console is a Pro feature.',
    upgradePrompt: 'Upgrade to Pro to access the admin dispute console.',
  };
}

export async function getAllowedDMCAVariants(walletAddress: string): Promise<string[]> {
  const plan = await getPlan(walletAddress);
  return [...LIMITS[plan].dmcaVariants];
}

/** Returns human-readable summary of limits for the given plan */
export function getLimitSummary(plan: Plan): Record<string, string> {
  const l = LIMITS[plan];
  return {
    Registrations: l.maxRegistrations === Infinity ? 'Unlimited' : String(l.maxRegistrations),
    'Scans per day': l.maxScansPerDay === Infinity ? 'Unlimited' : String(l.maxScansPerDay),
    'Alerts stored': l.maxAlerts === Infinity ? 'Unlimited' : String(l.maxAlerts),
    'DMCA templates': l.dmcaVariants.join(', '),
    'Admin console': l.adminAccess ? 'Yes' : 'No',
  };
}
