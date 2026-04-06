import { getConfig } from "./config.js";

export interface CreditsData {
  totalGranted: number;
  remaining: number;
  usedThisMonth: number;
  currency: string;
  expiresAt: string | null;
}

export interface CreditsResult {
  ok: boolean;
  data?: CreditsData;
  error?: string;
  partial?: boolean;
  needsKey?: boolean;
}

interface GrantsResponse {
  total_granted?: number;
  total_used?: number;
  grants?: { expires_at?: string }[];
}

interface UsageResponse {
  total_usage?: number;
}

export async function fetchCredits(): Promise<CreditsResult> {
  const cfg = getConfig();
  const directKey = cfg.openaiDirectKey?.trim();

  if (!directKey) {
    return { ok: false, needsKey: true, error: "No OpenAI API key configured for billing. Please add your OpenAI API Key in Settings." };
  }

  const rootUrl = "https://api.openai.com";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${directKey}`,
    "Content-Type": "application/json",
  };

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const startDate = `${yyyy}-${mm}-01`;
  const endDate = `${yyyy}-${mm}-${dd}`;

  let grants: GrantsResponse | null = null;
  let usedThisMonth: number | null = null;
  let grantError: string | null = null;
  let usageError: string | null = null;

  try {
    const res = await fetch(`${rootUrl}/dashboard/billing/credit_grants`, { headers });
    if (res.ok) {
      grants = (await res.json()) as GrantsResponse;
    } else {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      grantError = body?.error?.message ?? `HTTP ${res.status}`;
    }
  } catch (e) {
    grantError = e instanceof Error ? e.message : "fetch error";
  }

  try {
    const usageUrl = `${rootUrl}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(usageUrl, { headers });
    if (res.ok) {
      const data = (await res.json()) as UsageResponse;
      usedThisMonth = (data.total_usage ?? 0) / 100;
    } else {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      usageError = body?.error?.message ?? `HTTP ${res.status}`;
    }
  } catch (e) {
    usageError = e instanceof Error ? e.message : "fetch error";
  }

  if (grantError && usageError) {
    return { ok: false, error: `Billing API error — grants: ${grantError}; usage: ${usageError}` };
  }

  const totalGranted = grants?.total_granted ?? 0;
  const totalUsedFromGrants = grants?.total_used ?? 0;
  const remaining = Math.max(0, totalGranted - totalUsedFromGrants);
  const expiresAt = grants?.grants?.[0]?.expires_at ?? null;

  return {
    ok: true,
    partial: !!(grantError || usageError),
    data: {
      totalGranted,
      remaining,
      usedThisMonth: usedThisMonth ?? totalUsedFromGrants,
      currency: "usd",
      expiresAt,
    },
  };
}

export function buildCreditsJson(result: CreditsResult): Record<string, unknown> {
  if (!result.ok || !result.data) {
    return {
      error: result.error ?? "unknown error",
      needs_key: result.needsKey ?? false,
      partial: false,
    };
  }
  const d = result.data;
  return {
    total_granted: d.totalGranted,
    remaining: d.remaining,
    used_this_month: d.usedThisMonth,
    currency: d.currency,
    expires_at: d.expiresAt,
    partial: result.partial ?? false,
  };
}
