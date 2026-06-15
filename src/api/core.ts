const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001/api/v1").replace(/\/$/, "");
const SESSION_MARKER_KEY = "vastrabook_session_active";
const LEGACY_ACCESS_KEY = "csm_silks_access_token";
const LEGACY_REFRESH_KEY = "csm_silks_refresh_token";
const DEMO_SESSION_ENABLED = import.meta.env.VITE_DEMO_SESSION === "true"
  || (import.meta.env.DEV && import.meta.env.VITE_DEMO_SESSION !== "false");
const NO_TENANT_SESSION_MESSAGE = "No tenant session. Login or register a textile business before opening the workspace.";
const SESSION_EXPIRED_MESSAGE = "Your session expired. Login again to continue.";
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
let accessTokenCache: string | null = null;
let csrfTokenCache: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

type ApiEnvelope<T> = T & {
  success?: boolean;
  message?: string;
};

async function readJson<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text();
  let data: ApiEnvelope<T>;

  try {
    data = text ? JSON.parse(text) : ({} as ApiEnvelope<T>);
  } catch {
    throw new Error(`API request failed with ${response.status}: ${text.slice(0, 180)}`);
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `API request failed with ${response.status}`);
  }
  return data;
}

function clearLegacyStoredTokens() {
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

function markTenantSession(active: boolean) {
  if (active) {
    localStorage.setItem(SESSION_MARKER_KEY, "true");
  } else {
    localStorage.removeItem(SESSION_MARKER_KEY);
  }
}

function cacheAccessToken(accessToken: string) {
  accessTokenCache = accessToken;
  markTenantSession(true);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
}

function isUnsafeMethod(method?: string) {
  return !["GET", "HEAD", "OPTIONS", "TRACE"].includes((method || "GET").toUpperCase());
}

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  return document.cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

async function getCsrfToken() {
  if (csrfTokenCache) return csrfTokenCache;

  const cookieToken = readCookie("csrftoken");
  if (cookieToken) {
    csrfTokenCache = decodeURIComponent(cookieToken);
    return csrfTokenCache;
  }

  if (!csrfTokenRequest) {
    csrfTokenRequest = fetch(`${API_BASE}/auth/csrf`, {
      method: "GET",
      credentials: "include",
      headers: { "Accept": "application/json" }
    })
      .then(response => readJson<{ csrfToken: string }>(response))
      .then(data => {
        csrfTokenCache = data.csrfToken || decodeURIComponent(readCookie("csrftoken"));
        return csrfTokenCache || "";
      })
      .finally(() => {
        csrfTokenRequest = null;
      });
  }

  return csrfTokenRequest;
}

async function buildHeaders(baseHeaders?: HeadersInit, options: { method?: string; json?: boolean; authToken?: string } = {}) {
  const headers = new Headers(baseHeaders);
  if (options.json && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.authToken) {
    headers.set("Authorization", `Bearer ${options.authToken}`);
  }
  if (isUnsafeMethod(options.method)) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers.set("X-CSRFToken", csrfToken);
    }
  }
  return headers;
}

async function refreshAccessToken(refreshOverride?: string) {
  const response = await fetch(`${API_BASE}/auth/token/refresh`, {
    method: "POST",
    credentials: "include",
    headers: await buildHeaders(undefined, { method: "POST", json: true }),
    body: JSON.stringify(refreshOverride ? { refresh: refreshOverride } : {})
  });
  const data = await readJson<{ access: string }>(response);
  cacheAccessToken(data.access);
  if (refreshOverride) {
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
  return data.access;
}

async function requestDemoSession() {
  const response = await fetch(`${API_BASE}/auth/demo-session`, {
    method: "POST",
    credentials: "include",
    headers: await buildHeaders(undefined, { method: "POST", json: true }),
    body: JSON.stringify({ mobile: "8608633066" })
  });
  const data = await readJson<{ tokens: { access: string } }>(response);
  cacheAccessToken(data.tokens.access);
  clearLegacyStoredTokens();
  return data.tokens.access;
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && accessTokenCache) {
    return accessTokenCache;
  }

  const legacyAccess = localStorage.getItem(LEGACY_ACCESS_KEY);
  if (!forceRefresh && legacyAccess) {
    cacheAccessToken(legacyAccess);
    return legacyAccess;
  }

  const legacyRefresh = localStorage.getItem(LEGACY_REFRESH_KEY);
  if (legacyRefresh) {
    try {
      return await refreshAccessToken(legacyRefresh);
    } catch {
      clearLegacyStoredTokens();
    }
  }

  // Only probe the refresh endpoint when we believe a session exists. A fresh
  // visitor has no session marker, so skipping this avoids a guaranteed 400 on
  // every landing-page load (the cookie probe would always fail unauthenticated).
  if (hasTenantSession()) {
    try {
      return await refreshAccessToken();
    } catch (error) {
      accessTokenCache = null;
      if (!DEMO_SESSION_ENABLED) {
        markTenantSession(false);
        throw new Error(SESSION_EXPIRED_MESSAGE, { cause: error });
      }
    }
  } else if (!DEMO_SESSION_ENABLED) {
    throw new Error(NO_TENANT_SESSION_MESSAGE);
  }

  try {
    return await requestDemoSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Seeded tenant user not found") || message.includes("Demo session is disabled")) {
      clearTenantSession();
      throw new Error(NO_TENANT_SESSION_MESSAGE, { cause: error });
    }
    throw error;
  }
}

async function recoverAccessTokenAfterUnauthorized() {
  accessTokenCache = null;
  try {
    return await getAccessToken(true);
  } catch (error) {
    clearTenantSession();
    throw new Error(SESSION_EXPIRED_MESSAGE, { cause: error });
  }
}

export function clearTenantSession() {
  accessTokenCache = null;
  csrfTokenCache = null;
  markTenantSession(false);
  clearLegacyStoredTokens();
  void (async () => {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: await buildHeaders(undefined, { method: "POST", json: true }),
      body: JSON.stringify({})
    });
  })().catch(() => undefined);
}

export function hasTenantSession() {
  return Boolean(accessTokenCache || localStorage.getItem(SESSION_MARKER_KEY) || localStorage.getItem(LEGACY_ACCESS_KEY) || localStorage.getItem(LEGACY_REFRESH_KEY));
}

export function isDemoSessionAvailable() {
  return DEMO_SESSION_ENABLED;
}

export async function startDemoSession() {
  accessTokenCache = null;
  markTenantSession(false);
  clearLegacyStoredTokens();
  await requestDemoSession();
}

async function authenticatedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getAccessToken();
  const method = init.method || "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: await buildHeaders(init.headers, { method, authToken: token })
  });

  if (response.status === 401 && retry) {
    const refreshedToken = await recoverAccessTokenAfterUnauthorized();
    cacheAccessToken(refreshedToken);
    return authenticatedFetch(path, init, false);
  }
  if (response.status === 401) {
    clearTenantSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return response;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<ApiEnvelope<T>> {
  const jsonHeaders = new Headers(init.headers);
  if (!jsonHeaders.has("Content-Type")) {
    jsonHeaders.set("Content-Type", "application/json");
  }
  const response = await authenticatedFetch(path, { ...init, headers: jsonHeaders }, retry);
  return readJson<T>(response);
}

export async function publicApiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const method = init.method || "GET";
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: await buildHeaders(init.headers, { method, json: true })
  });
  return readJson<T>(response);
}

export async function apiText(path: string, init: RequestInit = {}, retry = true): Promise<string> {
  const response = await authenticatedFetch(path, init, retry);

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 180) || `API request failed with ${response.status}`);
  }
  return text;
}

export async function apiBlob(path: string, init: RequestInit = {}, retry = true): Promise<{ blob: Blob; filename: string }> {
  const response = await authenticatedFetch(path, init, retry);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 180) || `API request failed with ${response.status}`);
  }

  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] || "report-export"
  };
}

const formatApiDate = (value: string) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatApiDateTime = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const parseDisplayDateForApi = (value?: string) => {
  if (!value || value === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  const months: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12"
  };
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = months[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
};

const paymentModeToApi = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized.includes("bank")) return "bank";
  if (normalized.includes("upi")) return "upi";
  if (normalized.includes("cheque")) return "cheque";
  return "cash";
};

const paymentModeFromApi = (value: string) => {
  if (value === "bank") return "Bank Transfer";
  if (value === "upi") return "UPI";
  if (value === "cheque") return "Cheque";
  return "Cash";
};

import type { Item, PaymentSettlement, SalesRegisterDataRow } from "../types";

export function mapPaymentSettlements(data: any): PaymentSettlement[] {
  return (data.settlements || []).map((settlement: any) => ({
    id: settlement.id,
    invoiceId: settlement.invoice,
    invoiceNumber: settlement.invoice_number || "-",
    settledAmount: Number(settlement.settled_amount ?? 0)
  }));
}

export type SalesRegisterInput = {
  partyId: string;
  item?: Item;
  quantity?: number;
  amount: number;
  paymentMode?: string;
  linkedVoucher?: string;
  settlementInvoiceId?: string;
  validTill?: string;
  notes: string;
};

export function salesRegisterLinePayload(input: SalesRegisterInput) {
  const item = input.item;
  const quantity = Math.max(1, Number(input.quantity) || 1);
  const amount = roundMoney(input.amount);
  return {
    item: item?.id || null,
    item_name: item?.name || "Sales Register Item",
    quantity,
    rate: roundMoney(amount / quantity),
    gst_rate: roundMoney(item?.gstRate ?? 0),
    amount,
    sort_order: 0
  };
}

export function mapSalesRegisterRow(
  data: any,
  input: SalesRegisterInput,
  options: {
    dateField: string;
    numberField: string;
    partyName?: string;
    itemName?: string;
    linkedVoucher?: string;
    validTill?: string;
    status?: string;
    notesField?: string;
    paymentMode?: string;
    receivedAmount?: number;
    settledAmount?: number;
    settlements?: PaymentSettlement[];
    isAdvance?: boolean;
    cancellationReason?: string;
    convertedInvoiceId?: string;
  }
): SalesRegisterDataRow {
  const line = data.line_items?.[0];
  const amount = Number(data.total_amount ?? data.amount_received ?? input.amount);
  const receivedAmount = options.receivedAmount ?? Number(data.amount_received ?? 0);

  return {
    id: data.id,
    date: formatApiDate(data[options.dateField]),
    number: data[options.numberField],
    partyName: String(data.party_name || options.partyName || "").toUpperCase(),
    itemName: options.itemName || line?.item_name || input.item?.name || "Sales Register Item",
    qty: Number(line?.quantity ?? input.quantity ?? 1),
    amount,
    settledAmount: options.settledAmount ?? 0,
    receivedAmount,
    paymentMode: options.paymentMode ?? "-",
    linkedVoucher: options.linkedVoucher ?? "-",
    validTill: options.validTill ?? "-",
    status: options.status ?? String(data.status || "open").replace(/^\w/, char => char.toUpperCase()),
    notes: data[options.notesField || "notes"] || input.notes || "",
    settlements: options.settlements,
    isAdvance: options.isAdvance,
    cancellationReason: options.cancellationReason,
    convertedInvoiceId: options.convertedInvoiceId
  };
}

export type PaymentReceiptDetails = {
  settlements: PaymentSettlement[];
  isAdvance: boolean;
  status: string;
  cancellationReason: string;
  referenceNumber: string;
  notes: string;
};

export { API_BASE, roundMoney, formatApiDate, formatApiDateTime, parseDisplayDateForApi, paymentModeToApi, paymentModeFromApi, readJson, clearLegacyStoredTokens, cacheAccessToken, buildHeaders };
