import type {
  ActivityFeedItem,
  Business,
  CAReportSharingData,
  BusinessNotification,
  InvoiceItem,
  Item,
  ItemPartyPrice,
  OnlineOrder,
  Party,
  PartyLedgerEntry,
  SharedLedgerPortalData,
  SharedLedgerRow,
  EInvoiceRecord,
  EInvoiceLog,
  GodownTransfer,
  NotificationCenterData,
  PendingNotifications,
  PaymentGatewayOrder,
  PaymentSettlement,
  PurchaseRegisterRow,
  ReportDefinition,
  SalesRegisterDataRow,
  SMSCampaign,
  SalesInvoice,
  SettingsData,
  Staff,
  StaffPayrollReport,
  StaffPayrollRow,
  StockMovement,
  WorkspaceData
} from "./types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001/api/v1").replace(/\/$/, "");
const ACCESS_KEY = "csm_silks_access_token";
const REFRESH_KEY = "csm_silks_refresh_token";
const DEMO_SESSION_ENABLED = import.meta.env.VITE_DEMO_SESSION === "true"
  || (import.meta.env.DEV && import.meta.env.VITE_DEMO_SESSION !== "false");
const NO_TENANT_SESSION_MESSAGE = "No tenant session. Login or register a textile business before opening the workspace.";
const SESSION_EXPIRED_MESSAGE = "Your session expired. Login again to continue.";
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

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

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = localStorage.getItem(ACCESS_KEY);
    if (cached) return cached;
  }

  const refresh = localStorage.getItem(REFRESH_KEY);
  if (refresh) {
    try {
      const response = await fetch(`${API_BASE}/auth/token/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh })
      });
      const data = await readJson<{ access: string; refresh?: string }>(response);
      localStorage.setItem(ACCESS_KEY, data.access);
      if (data.refresh) {
        localStorage.setItem(REFRESH_KEY, data.refresh);
      }
      return data.access;
    } catch {
      clearTenantSession();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
  }

  if (!DEMO_SESSION_ENABLED) {
    throw new Error(NO_TENANT_SESSION_MESSAGE);
  }

  try {
    const response = await fetch(`${API_BASE}/auth/demo-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile: "8608633066" })
    });
    const data = await readJson<{ tokens: { access: string; refresh: string } }>(response);
    localStorage.setItem(ACCESS_KEY, data.tokens.access);
    localStorage.setItem(REFRESH_KEY, data.tokens.refresh);
    return data.tokens.access;
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
  localStorage.removeItem(ACCESS_KEY);
  if (!localStorage.getItem(REFRESH_KEY)) {
    clearTenantSession();
    throw new Error("Your session expired. Login again to continue.");
  }
  return getAccessToken(true);
}

export function clearTenantSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function hasTenantSession() {
  return Boolean(localStorage.getItem(ACCESS_KEY) || localStorage.getItem(REFRESH_KEY));
}

export function isDemoSessionAvailable() {
  return DEMO_SESSION_ENABLED;
}

export async function startDemoSession() {
  clearTenantSession();
  await getAccessToken(true);
}

async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<ApiEnvelope<T>> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });

  if (response.status === 401 && retry) {
    const refreshedToken = await recoverAccessTokenAfterUnauthorized();
    localStorage.setItem(ACCESS_KEY, refreshedToken);
    return apiFetch<T>(path, init, false);
  }
  if (response.status === 401) {
    clearTenantSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  return readJson<T>(response);
}

async function publicApiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  return readJson<T>(response);
}

async function apiText(path: string, init: RequestInit = {}, retry = true): Promise<string> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });

  if (response.status === 401 && retry) {
    const refreshedToken = await recoverAccessTokenAfterUnauthorized();
    localStorage.setItem(ACCESS_KEY, refreshedToken);
    return apiText(path, init, false);
  }
  if (response.status === 401) {
    clearTenantSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 180) || `API request failed with ${response.status}`);
  }
  return text;
}

async function apiBlob(path: string, init: RequestInit = {}, retry = true): Promise<{ blob: Blob; filename: string }> {
  const token = await getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });

  if (response.status === 401 && retry) {
    const refreshedToken = await recoverAccessTokenAfterUnauthorized();
    localStorage.setItem(ACCESS_KEY, refreshedToken);
    return apiBlob(path, init, false);
  }
  if (response.status === 401) {
    clearTenantSession();
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

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

export async function getWorkspace() {
  return apiFetch<WorkspaceData>("/auth/workspace");
}

export async function sendLoginOtp(input: { mobile: string }) {
  const response = await fetch(`${API_BASE}/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mobile: input.mobile })
  });
  return readJson<{
    provider?: string;
    expiresInMinutes?: number;
    otp_simulated?: string;
  }>(response);
}

export async function verifyLoginOtp(input: { mobile: string; otp: string }) {
  const response = await fetch(`${API_BASE}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mobile: input.mobile,
      otp: input.otp
    })
  });
  const data = await readJson<{ tokens: { access: string; refresh: string }; business?: Business }>(response);
  localStorage.setItem(ACCESS_KEY, data.tokens.access);
  localStorage.setItem(REFRESH_KEY, data.tokens.refresh);
  return data;
}

export async function registerTextileTenant(input: {
  businessName: string;
  ownerName: string;
  mobile: string;
  email?: string;
  gstin?: string;
  state?: string;
  city?: string;
  pincode?: string;
  address?: string;
  invoicePrefix?: string;
  password?: string;
}) {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: input.businessName,
      owner_name: input.ownerName,
      mobile: input.mobile,
      email: input.email || "",
      gstin: input.gstin || "",
      state: input.state || "Tamil Nadu",
      city: input.city || "",
      pincode: input.pincode || "",
      address: input.address || "",
      invoice_prefix: input.invoicePrefix || "INV",
      password: input.password || ""
    })
  });
  const data = await readJson<{ tokens: { access: string; refresh: string }; business: Business }>(response);
  localStorage.setItem(ACCESS_KEY, data.tokens.access);
  localStorage.setItem(REFRESH_KEY, data.tokens.refresh);
  return data;
}

export async function getActivityFeed(limit = 40) {
  return apiFetch<{ activities: ActivityFeedItem[]; activityLogs: unknown[] }>(`/auth/activity?limit=${limit}`);
}

export async function updateAccountSettings(input: Partial<SettingsData["account"]>) {
  return apiFetch<{ user: any }>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      mobile: input.mobile
    })
  });
}

export async function updateBusinessSettings(input: Partial<SettingsData["businessProfile"]>) {
  const businessPayload: Partial<Business> & {
    upi_id?: string;
    bank_account_details?: Record<string, unknown>;
  } = {};
  const preferencePayload: Record<string, unknown> = {};

  if (input.name !== undefined) businessPayload.name = input.name;
  if (input.phone !== undefined) businessPayload.phone = input.phone;
  if (input.gstin !== undefined) businessPayload.gstin = input.gstin;
  if (input.state !== undefined) businessPayload.state = input.state;
  if (input.address !== undefined) businessPayload.address = input.address;
  if (input.city !== undefined) businessPayload.city = input.city;
  if (input.pincode !== undefined) businessPayload.pincode = input.pincode;
  if (input.email !== undefined) businessPayload.email = input.email;
  if (input.upiId !== undefined) businessPayload.upi_id = input.upiId;
  if (input.bankAccountDetails !== undefined) businessPayload.bank_account_details = input.bankAccountDetails;

  if (input.category !== undefined) preferencePayload.business_category = input.category;
  if (input.showInOnlineStore !== undefined) preferencePayload.show_in_online_store = input.showInOnlineStore;
  if (input.enableGstBilling !== undefined) preferencePayload.enable_gst_billing = input.enableGstBilling;
  if (input.showLogoOnInvoice !== undefined) preferencePayload.show_logo_on_invoice = input.showLogoOnInvoice;
  if (input.branchBilling !== undefined) preferencePayload.branch_billing = input.branchBilling;
  if (input.showUpiOnInvoice !== undefined) preferencePayload.show_upi_on_invoice = input.showUpiOnInvoice;
  if (input.printPreview !== undefined) preferencePayload.print_preview = input.printPreview;
  if (input.hideZeroStockBarcodes !== undefined) preferencePayload.hide_zero_stock_barcodes = input.hideZeroStockBarcodes;
  if (input.printOriginalDuplicate !== undefined) preferencePayload.print_original_duplicate = input.printOriginalDuplicate;
  if (input.autoPrintAfterSale !== undefined) preferencePayload.auto_print_after_sale = input.autoPrintAfterSale;
  if (input.caReportsEnabled !== undefined) preferencePayload.ca_reports_enabled = input.caReportsEnabled;
  if (input.caName !== undefined) preferencePayload.ca_name = input.caName;
  if (input.caEmail !== undefined) preferencePayload.ca_email = input.caEmail;
  if (input.caMobile !== undefined) preferencePayload.ca_mobile = input.caMobile;
  if (input.planName !== undefined) preferencePayload.plan_name = input.planName;
  if (input.planValidTill !== undefined) preferencePayload.plan_valid_till = input.planValidTill || null;
  if (input.referralCode !== undefined) preferencePayload.referral_code = input.referralCode;
  if (input.supportEmail !== undefined) preferencePayload.support_email = input.supportEmail;
  if (input.supportPhone !== undefined) preferencePayload.support_phone = input.supportPhone;

  const requests = [];
  if (Object.keys(businessPayload).length) {
    requests.push(apiFetch<{ data: unknown }>("/auth/business/my_business/", {
      method: "PATCH",
      body: JSON.stringify(businessPayload)
    }));
  }
  if (Object.keys(preferencePayload).length) {
    requests.push(apiFetch<{ data: unknown }>("/settings/business-preferences/active_preferences/", {
      method: "PATCH",
      body: JSON.stringify(preferencePayload)
    }));
  }
  await Promise.all(requests);
}

export async function updateInvoiceSettings(input: Partial<SettingsData["invoice"]>) {
  return apiFetch<{ data: unknown }>("/settings/invoice-layout/active_settings/", {
    method: "PATCH",
    body: JSON.stringify({
      theme: input.theme,
      theme_color: input.themeColor,
      theme_style: input.themeStyle || null,
      show_mrp: input.showMrp,
      show_hsn: input.showHsn,
      show_discount: input.showDiscount,
      show_color: input.showColor,
      show_cin_date: input.showCinDate,
      show_grn_date: input.showGrnDate,
      show_free_qty: input.showFreeQty,
      show_party_balance: input.showPartyBalance,
      show_item_description: input.showItemDescription,
      show_time_on_invoice: input.showTimeOnInvoice,
      show_discount_on_mrp: input.showDiscountOnMrp,
      paper_size: input.paperSize,
      thermal_paper_size: input.thermalPaperSize,
      thermal_theme: input.thermalTheme,
      logo_url: input.logoUrl || null,
      signature_url: input.signatureUrl || null,
      custom_fields: input.customFields,
      invoice_prefix: input.invoicePrefix,
      reset_each_year: input.resetEachYear
    })
  });
}

export async function updateReminderSettings(input: Partial<SettingsData["reminders"]>) {
  return apiFetch<{ data: unknown }>("/settings/reminder-preferences/active_reminders/", {
    method: "PATCH",
    body: JSON.stringify({
      payment_due: input.paymentDue,
      sale_invoice: input.saleInvoice,
      low_stock: input.lowStock,
      customer_occasions: input.customerOccasions,
      daily_summary: input.dailySummary
    })
  });
}

function mapCAReportSharing(data: any): CAReportSharingData {
  return {
    enabled: Boolean(data.enabled),
    caName: data.caName || "",
    caEmail: data.caEmail || "",
    caMobile: data.caMobile || "",
    bundleReports: data.bundleReports || [],
    summary: {
      totalShares: Number(data.summary?.totalShares ?? 0),
      activeShares: Number(data.summary?.activeShares ?? 0),
      revokedShares: Number(data.summary?.revokedShares ?? 0),
      lastSharedAt: data.summary?.lastSharedAt || "",
      lastRecipient: data.summary?.lastRecipient || ""
    },
    shares: (data.shares || []).map((share: any) => ({
      id: share.id,
      reportId: share.reportId || share.report_id || "",
      reportName: share.reportName || share.report_name || "",
      recipient: share.recipient || "",
      dateRange: share.dateRange || share.date_range || "",
      status: share.status || "prepared",
      shareToken: share.shareToken || share.share_token || "",
      createdAt: share.createdAt || share.created_at || "",
      updatedAt: share.updatedAt || share.updated_at || ""
    }))
  };
}

export async function getCAReportSharing() {
  const response = await apiFetch<{ data: any }>("/settings/business-preferences/ca_report_sharing/");
  return mapCAReportSharing(response.data);
}

export async function shareCAReports(input: {
  caName: string;
  caEmail: string;
  caMobile: string;
  dateRange?: string;
  reportIds?: string[];
}) {
  const response = await apiFetch<{ data: any; shares: any[]; message: string }>("/settings/business-preferences/share_ca_reports/", {
    method: "POST",
    body: JSON.stringify({
      ca_name: input.caName,
      ca_email: input.caEmail,
      ca_mobile: input.caMobile,
      date_range: input.dateRange || "This Month",
      report_ids: input.reportIds || []
    })
  });
  return {
    data: mapCAReportSharing(response.data),
    shares: response.shares,
    message: response.message
  };
}

export async function revokeCAReportSharing(input: { recipient?: string } = {}) {
  const response = await apiFetch<{ data: any; revokedCount: number; message: string }>("/settings/business-preferences/revoke_ca_reports/", {
    method: "POST",
    body: JSON.stringify({
      recipient: input.recipient || ""
    })
  });
  return {
    data: mapCAReportSharing(response.data),
    revokedCount: Number(response.revokedCount ?? 0),
    message: response.message
  };
}

export async function getPendingNotifications() {
  const response = await apiFetch<{ data: PendingNotifications }>("/settings/reminders/pending_actions/");
  return response.data;
}

export async function dispatchDueReminders() {
  const response = await apiFetch<{
    message: string;
    data: {
      sentCount: number;
      failedCount: number;
      provider: string;
      reminders: Array<{
        id: string;
        status: string;
        attempt_count: number;
        delivery_message: string;
      }>;
    };
  }>("/settings/reminders/dispatch_due/", {
    method: "POST",
    body: JSON.stringify({})
  });
  return response;
}

function mapBusinessNotification(data: any): BusinessNotification {
  return {
    id: data.id,
    sourceType: data.source_type || data.sourceType || "",
    sourceId: data.source_id || data.sourceId || null,
    title: data.title || "",
    message: data.message || "",
    priority: data.priority || "medium",
    target: data.target || "",
    status: data.status || "unread",
    metadata: data.metadata || {},
    createdAt: data.created_at || data.createdAt || "",
    updatedAt: data.updated_at || data.updatedAt || "",
    readAt: data.read_at || data.readAt || null
  };
}

function mapNotificationCenter(data: { notifications: any[]; counts: NotificationCenterData["counts"]; serverTime?: string }): NotificationCenterData {
  return {
    notifications: (data.notifications || []).map(mapBusinessNotification),
    counts: data.counts || { total: 0, unread: 0, read: 0, dismissed: 0 },
    serverTime: data.serverTime
  };
}

export async function getBusinessNotifications(status: "all" | "unread" | "read" | "dismissed" = "all") {
  const response = await apiFetch<{ notifications: any[]; counts: NotificationCenterData["counts"]; serverTime?: string }>(`/settings/notifications/?status=${status}`);
  return mapNotificationCenter(response);
}

export async function syncBusinessNotifications() {
  const response = await apiFetch<{
    notifications: any[];
    counts: NotificationCenterData["counts"];
    pending: PendingNotifications;
    serverTime?: string;
  }>("/settings/notifications/sync_pending/", {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    ...mapNotificationCenter(response),
    pending: response.pending
  };
}

export async function waitForBusinessNotificationUpdates(input: {
  since: string;
  status?: "all" | "unread" | "read" | "dismissed";
  timeoutSeconds?: number;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({
    since: input.since,
    status: input.status || "all",
    timeout: String(input.timeoutSeconds ?? 20)
  });
  const response = await apiFetch<{
    hasUpdates: boolean;
    notifications: any[];
    counts: NotificationCenterData["counts"];
    pending?: PendingNotifications;
    serverTime?: string;
  }>(`/settings/notifications/wait_updates/?${params.toString()}`, {
    signal: input.signal
  });
  return {
    ...mapNotificationCenter(response),
    hasUpdates: Boolean(response.hasUpdates),
    pending: response.pending
  };
}

export async function markBusinessNotificationRead(notificationId: string) {
  const response = await apiFetch<{ notification: any; counts: NotificationCenterData["counts"] }>(`/settings/notifications/${notificationId}/mark_read/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    notification: mapBusinessNotification(response.notification),
    counts: response.counts
  };
}

export async function markAllBusinessNotificationsRead() {
  const response = await apiFetch<{ notifications: any[]; counts: NotificationCenterData["counts"] }>("/settings/notifications/mark_all_read/", {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapNotificationCenter(response);
}

export type ReportsQuery = {
  dateRange?: string;
  from?: string;
  to?: string;
  partyId?: string;
  itemId?: string;
};

export type ReportDirectoryOption = {
  id: string;
  name: string;
  type?: string;
  code?: string;
};

export type ReportExportFormat = "csv" | "excel" | "pdf";

export type ReportShareReceipt = {
  id: string;
  reportId: string;
  reportName: string;
  recipient: string;
  status: "prepared" | "sent" | "failed";
  shareToken: string;
  createdAt: string;
};

function buildReportsParams(filters: ReportsQuery = {}) {
  const params = new URLSearchParams();
  if (filters.dateRange) params.set("date_range", filters.dateRange);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.partyId) params.set("party", filters.partyId);
  if (filters.itemId) params.set("item", filters.itemId);
  return params;
}

export async function getReports(filters: ReportsQuery = {}) {
  const query = buildReportsParams(filters).toString();

  return apiFetch<{
    reports: ReportDefinition[];
    dateRanges: string[];
    activeFilters?: Record<string, string>;
    generatedAt?: string;
    parties?: ReportDirectoryOption[];
    items?: ReportDirectoryOption[];
  }>(`/accounting/reports/${query ? `?${query}` : ""}`);
}

export async function getReportExportHtml(reportId: string, filters: ReportsQuery = {}) {
  const params = buildReportsParams(filters);
  params.set("report", reportId);
  params.set("export_format", "html");
  return apiText(`/accounting/reports/export/?${params.toString()}`);
}

export async function getReportExportFile(reportId: string, format: ReportExportFormat, filters: ReportsQuery = {}) {
  const params = buildReportsParams(filters);
  params.set("report", reportId);
  params.set("export_format", format);
  const extension = format === "excel" ? "xls" : format;
  const result = await apiBlob(`/accounting/reports/export/?${params.toString()}`);
  return {
    blob: result.blob,
    filename: result.filename === "report-export" ? `${reportId}.${extension}` : result.filename
  };
}

export async function shareReport(reportId: string, recipient: string, filters: ReportsQuery = {}) {
  const params = buildReportsParams(filters);
  params.set("report", reportId);
  const response = await apiFetch<{ share: ReportShareReceipt }>(`/accounting/reports/share/?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      report: reportId,
      recipient
    })
  });
  return response.share;
}

type PartyUpsertInput = {
  id?: string;
  name: string;
  mobile: string;
  type: "customer" | "supplier";
  balance: number;
  category?: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  creditLimit?: number;
  creditDays?: number;
};

function mapParty(data: any, fallbackBalance = 0): Party {
  return {
    id: data.id,
    name: data.name,
    mobile: data.mobile || "-",
    type: data.party_type === "supplier" ? "supplier" : "customer",
    balance: Number(data.net_balance ?? fallbackBalance),
    opening_balance_type: data.opening_balance_type,
    state: data.state || "",
    category: data.category_details?.name || "-",
    email: data.email || "",
    gstin: data.gstin || "",
    address: data.address || "",
    city: data.city || "",
    pincode: data.pincode || "",
    creditLimit: data.credit_limit === null || data.credit_limit === undefined ? undefined : Number(data.credit_limit),
    creditDays: data.credit_days === null || data.credit_days === undefined ? undefined : Number(data.credit_days),
    sharedLedgerToken: data.shared_ledger_token || ""
  };
}

async function resolvePartyCategoryId(name?: string) {
  const cleanName = (name || "").trim();
  if (!cleanName || cleanName === "-") return null;

  const categories = await apiFetch<any[]>("/parties/categories/");
  const match = categories.find(category => category.name.toLowerCase() === cleanName.toLowerCase());
  if (match) return match.id;

  const created = await apiFetch<any>("/parties/categories/", {
    method: "POST",
    body: JSON.stringify({ name: cleanName })
  });
  return created.id;
}

async function partyPayload(input: PartyUpsertInput) {
  const openingBalanceType = input.type === "supplier" ? "credit" : "debit";
  const categoryId = await resolvePartyCategoryId(input.category);
  return {
    name: input.name,
    mobile: input.mobile || null,
    email: input.email || null,
    gstin: input.gstin || null,
    address: input.address || null,
    city: input.city || null,
    state: input.state || "Tamil Nadu",
    pincode: input.pincode || null,
    party_type: input.type,
    category: categoryId,
    opening_balance: Math.abs(input.balance),
    opening_balance_type: openingBalanceType,
    credit_limit: input.creditLimit ?? null,
    credit_days: input.creditDays ?? null
  };
}

export async function createParty(input: PartyUpsertInput) {
  const data = await apiFetch<any>("/parties/parties/", {
    method: "POST",
    body: JSON.stringify(await partyPayload(input))
  });

  return mapParty(data, input.balance);
}

export async function updateParty(input: PartyUpsertInput & { id: string }) {
  const data = await apiFetch<any>(`/parties/parties/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(await partyPayload(input))
  });

  return mapParty(data, input.balance);
}

export async function deleteParty(partyId: string) {
  await apiFetch<Record<string, never>>(`/parties/parties/${partyId}/`, {
    method: "DELETE"
  });
}

export async function getPartyLedger(partyId: string) {
  const data = await apiFetch<{ party: any; ledger: PartyLedgerEntry[] }>(`/parties/parties/${partyId}/ledger_statement/`);
  return {
    party: mapParty(data.party),
    ledger: data.ledger.map(row => ({
      date: row.date,
      type: row.type,
      number: row.number,
      description: row.description,
      debit: Number(row.debit),
      credit: Number(row.credit),
      amount: Number(row.amount ?? 0),
      status: row.status || "",
      balance: Number(row.balance)
    }))
  };
}

export async function generateSharedLedger(partyId: string) {
  const data = await apiFetch<{ url: string; shared_ledger_token: string; summary?: unknown; party?: unknown }>(`/parties/parties/${partyId}/generate_shared_ledger/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return data;
}

export async function getSharedLedgers() {
  return apiFetch<{ rows: SharedLedgerRow[]; summary: { linkedParties: number; transactions: number; viewOnlyMode: boolean } }>("/parties/parties/shared-ledgers/");
}

export async function getSharedLedgerPortal(token: string): Promise<SharedLedgerPortalData> {
  const data = await publicApiFetch<SharedLedgerPortalData>(`/parties/shared-ledger/${encodeURIComponent(token)}/`);
  return {
    ...data,
    party: mapParty(data.party),
    ledger: data.ledger.map(row => ({
      ...row,
      debit: Number(row.debit),
      credit: Number(row.credit),
      amount: Number(row.amount ?? 0),
      balance: Number(row.balance)
    }))
  };
}

function mapItem(data: any): Item {
  return {
    id: data.id,
    name: data.name,
    hsn: data.hsn_code || "",
    categoryId: data.category || "",
    godownId: data.godown || "",
    itemCode: data.item_code || data.barcode || "",
    mrp: Number(data.mrp ?? 0),
    price: Number(data.selling_price ?? 0),
    purchasePrice: Number(data.purchase_price ?? 0),
    stock: Number(data.current_stock ?? data.opening_stock ?? 0),
    lowStockQuantity: data.low_stock_qty === null || data.low_stock_qty === undefined ? undefined : Number(data.low_stock_qty),
    godown: data.godown_details?.name || "-",
    onlineStore: Boolean(data.show_online_store ?? data.onlineStore),
    secondaryUnit: data.secondary_unit || data.secondaryUnit || "-",
    serialisationEnabled: Boolean(data.serialisation_enabled ?? data.serialisationEnabled),
    godownStocks: (data.godown_stocks || data.godownStocks || []).map((stock: any) => ({
      godownId: stock.godown || stock.godownId || "",
      godownName: stock.godown_name || stock.godownName || "-",
      openingStock: Number(stock.opening_stock ?? stock.openingStock ?? 0),
      currentStock: Number(stock.current_stock ?? stock.currentStock ?? 0)
    })),
    category: data.category_details?.name || "-",
    gstRate: Number(data.gst_rate ?? 0),
    color: data.color || "",
    cinDate: data.cin_date || data.cinDate || "",
    grn: data.grn_date || data.grnDate || data.grn || "",
    grnDate: data.grn_date || data.grnDate || data.grn || "",
    billNo: data.bill_no || data.billNo || "",
    description: data.description || ""
  };
}

function mapItemPartyPrice(data: any): ItemPartyPrice {
  return {
    id: data.id,
    itemId: data.item || data.itemId || "",
    partyId: data.party || data.partyId || "",
    partyName: data.party_name || data.partyName || "",
    partyMobile: data.party_mobile || data.partyMobile || "",
    salesPrice: Number(data.sales_price ?? data.salesPrice ?? 0),
    taxInclusive: Boolean(data.tax_inclusive ?? data.taxInclusive ?? true)
  };
}

function mapGodown(data: any) {
  return {
    id: data.id,
    name: data.name,
    location: data.address || data.location || "",
    isDefault: Boolean(data.is_default ?? data.isDefault),
    stockQty: data.stockQty === undefined ? undefined : Number(data.stockQty),
    stockValue: data.stockValue === undefined ? undefined : Number(data.stockValue),
    itemCount: data.itemCount === undefined ? undefined : Number(data.itemCount)
  };
}

function mapGodownTransfer(data: any): GodownTransfer {
  return {
    id: data.id,
    date: formatApiDate(data.transfer_date || data.date || ""),
    itemId: data.item || data.itemId || "",
    itemName: data.item_name || data.itemName || "-",
    fromGodownId: data.from_godown || data.fromGodownId || "",
    fromGodownName: data.from_godown_name || data.fromGodownName || "-",
    toGodownId: data.to_godown || data.toGodownId || "",
    toGodownName: data.to_godown_name || data.toGodownName || "-",
    quantity: Number(data.quantity ?? 0),
    notes: data.notes || ""
  };
}

function mapStockMovement(data: any): StockMovement {
  return {
    id: data.id,
    date: formatApiDate(data.movement_date || data.created_at?.slice(0, 10) || ""),
    itemId: data.item || "",
    itemName: data.item_name || "",
    godownId: data.godown || "",
    godownName: data.godown_name || "-",
    movementType: data.movement_type,
    referenceType: data.reference_type || "",
    referenceId: data.reference_id || "",
    quantity: Number(data.quantity ?? 0),
    rate: Number(data.rate ?? 0),
    balanceAfter: Number(data.balance_after ?? 0),
    notes: data.notes || ""
  };
}

async function resolveItemCategoryId(name: string, existingId?: string) {
  const cleanName = name.trim();
  if (existingId || !cleanName || cleanName === "-") {
    return existingId || null;
  }

  const categories = await apiFetch<any[]>("/items/categories/");
  const match = categories.find(category => category.name.toLowerCase() === cleanName.toLowerCase());
  if (match) {
    return match.id;
  }

  const created = await apiFetch<any>("/items/categories/", {
    method: "POST",
    body: JSON.stringify({ name: cleanName })
  });
  return created.id;
}

function itemPayload(input: Item, categoryId: string | null, includeOpeningStock: boolean) {
  const customFields = input.customFields;
  return {
    name: input.name,
    item_code: input.itemCode || null,
    barcode: input.itemCode || null,
    hsn_code: input.hsn || null,
    category: categoryId,
    unit: "PCS",
    selling_price: input.price,
    purchase_price: input.purchasePrice,
    mrp: input.mrp ?? null,
    gst_rate: input.gstRate,
    low_stock_qty: input.lowStockQuantity ?? null,
    godown: input.godownId || null,
    show_online_store: Boolean(input.onlineStore),
    secondary_unit: input.secondaryUnit && input.secondaryUnit !== "-" ? input.secondaryUnit : null,
    serialisation_enabled: Boolean(input.serialisationEnabled),
    color: customFields?.color ?? input.color ?? "",
    cin_date: customFields?.cinDate ?? input.cinDate ?? "",
    grn_date: customFields?.grnDate ?? input.grnDate ?? input.grn ?? "",
    bill_no: customFields?.billNo ?? input.billNo ?? "",
    description: input.description || "",
    ...(includeOpeningStock ? { opening_stock: input.stock } : {})
  };
}

export async function createItem(input: Item) {
  const categoryId = await resolveItemCategoryId(input.category, input.categoryId);
  const data = await apiFetch<any>("/items/items/", {
    method: "POST",
    body: JSON.stringify(itemPayload(input, categoryId, true))
  });
  return mapItem(data);
}

export async function updateItem(input: Item) {
  const categoryId = await resolveItemCategoryId(input.category, input.categoryId);
  const data = await apiFetch<any>(`/items/items/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(itemPayload(input, categoryId, false))
  });
  return mapItem(data);
}

export async function deleteItem(itemId: string) {
  await apiFetch<Record<string, never>>(`/items/items/${itemId}/`, {
    method: "DELETE"
  });
}

export async function getItemPartyPrices(itemId: string) {
  const query = itemId ? `?item=${encodeURIComponent(itemId)}` : "";
  const data = await apiFetch<any[]>(`/items/party-prices/${query}`);
  return data.map(mapItemPartyPrice);
}

export async function upsertItemPartyPrice(input: {
  itemId: string;
  partyId: string;
  salesPrice: number;
  taxInclusive: boolean;
}) {
  const data = await apiFetch<any>("/items/party-prices/", {
    method: "POST",
    body: JSON.stringify({
      item: input.itemId,
      party: input.partyId,
      sales_price: input.salesPrice,
      tax_inclusive: input.taxInclusive
    })
  });
  return mapItemPartyPrice(data);
}

export async function deleteItemPartyPrice(priceId: string) {
  await apiFetch<Record<string, never>>(`/items/party-prices/${priceId}/`, {
    method: "DELETE"
  });
}

export type BarcodeLabelResult = {
  id: string;
  item: string;
  item_name: string;
  item_code: string;
  barcode_value: string;
  label_size: string;
  copies: number;
  barcode_svg: string;
};

export type BarcodeLabelSize = {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  columns: number;
  gap_mm: number;
  description: string;
};

export type BarcodeLabelPriceSource = "selling" | "mrp" | "none";

export type BarcodeLabelOptions = {
  labelSize?: string;
  copies?: number;
  priceSource?: BarcodeLabelPriceSource;
  includeBusinessName?: boolean;
  includeItemName?: boolean;
  includePrice?: boolean;
  includeMrp?: boolean;
};

const barcodeLabelPayload = (input: BarcodeLabelOptions) => ({
  copies: input.copies ?? 1,
  label_size: input.labelSize ?? "50x25",
  price_source: input.priceSource ?? "selling",
  include_business_name: input.includeBusinessName ?? true,
  include_item_name: input.includeItemName ?? true,
  include_price: input.includePrice ?? true,
  include_mrp: input.includeMrp ?? true
});

export async function getBarcodeLabelSizes() {
  return apiFetch<{ sizes: BarcodeLabelSize[] }>("/items/barcode-labels/label_sizes/");
}

export async function createBarcodeLabel(input: {
  itemId: string;
} & BarcodeLabelOptions) {
  return apiFetch<BarcodeLabelResult>("/items/barcode-labels/", {
    method: "POST",
    body: JSON.stringify({
      item: input.itemId,
      ...barcodeLabelPayload(input)
    })
  });
}

export async function createBulkBarcodeLabels(input: {
  itemIds: string[];
} & BarcodeLabelOptions) {
  return apiFetch<{ labels: BarcodeLabelResult[] }>("/items/barcode-labels/bulk_create/", {
    method: "POST",
    body: JSON.stringify({
      item_ids: input.itemIds,
      ...barcodeLabelPayload(input)
    })
  });
}

export async function getBarcodeLabelPrintHtml(labelIds: string[]) {
  const ids = labelIds.map(encodeURIComponent).join(",");
  return apiText(`/items/barcode-labels/print_sheet/?ids=${ids}`);
}

export type InvoicePrintTemplate = "a4" | "thermal";

export async function getSalesInvoicePrintHtml(invoiceId: string, template: InvoicePrintTemplate = "a4") {
  return apiText(`/sales/invoices/${encodeURIComponent(invoiceId)}/print_pdf/?template=${encodeURIComponent(template)}`);
}

function mapInvoiceLineItem(data: any, fallbackLines: InvoiceItem[] = []): InvoiceItem {
  const fallbackLine = fallbackLines.find(line => String(line.item.id) === String(data.item || ""));
  const item: Item = fallbackLine?.item ?? {
    id: String(data.item || ""),
    name: data.item_name || "Invoice item",
    hsn: data.hsn_code || "",
    itemCode: data.item_code || "",
    mrp: data.mrp === null || data.mrp === undefined ? undefined : Number(data.mrp),
    price: Number(data.rate ?? 0),
    purchasePrice: 0,
    stock: 0,
    godown: "",
    category: "",
    gstRate: Number(data.gst_rate ?? 0),
    color: data.color || "",
    grn: data.grn_no || ""
  };

  return {
    item,
    quantity: Number(data.quantity ?? fallbackLine?.quantity ?? 0),
    freeQuantity: Number(data.free_quantity ?? fallbackLine?.freeQuantity ?? 0),
    rate: Number(data.rate ?? fallbackLine?.rate ?? 0),
    discountPct: Number(data.discount_pct ?? fallbackLine?.discountPct ?? 0)
  };
}

function mapSalesInvoice(data: any, fallbackLines: InvoiceItem[] = [], fallbackPaymentMode = "cash"): SalesInvoice {
  const lineItems = Array.isArray(data.line_items) && data.line_items.length
    ? data.line_items.map((line: any) => mapInvoiceLineItem(line, fallbackLines))
    : fallbackLines;

  return {
    id: data.id,
    invoiceNumber: data.invoice_number,
    party: {
      id: data.party,
      name: data.party_name,
      mobile: data.party_mobile || "-",
      type: "customer",
      balance: 0
    },
    date: formatApiDate(data.invoice_date),
    items: lineItems,
    subtotal: Number(data.subtotal ?? 0),
    total: Number(data.total_amount ?? 0),
    paidAmount: Number(data.paid_amount ?? 0),
    paymentMode: fallbackPaymentMode,
    status: data.status || "unpaid",
    irn: data.irn || "",
    ackNumber: data.ack_number || "",
    ackDate: data.ack_date || "",
    qrCodeData: data.qr_code_data || "",
    eInvoiceStatus: data.einvoice_status || "pending",
    eInvoiceProvider: data.einvoice_provider || "",
    eInvoiceRetryCount: Number(data.einvoice_retry_count ?? 0),
    eInvoiceLastError: data.einvoice_last_error || "",
    eInvoiceCancelReason: data.einvoice_cancel_reason || "",
    eInvoiceCancelledAt: data.einvoice_cancelled_at || ""
  };
}

export async function cancelSalesInvoice(invoiceId: string, reason = "Cancelled from sales invoice workspace") {
  const data = await apiFetch<{ message: string; invoice: any }>(`/sales/invoices/${encodeURIComponent(invoiceId)}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return {
    message: data.message,
    invoice: mapSalesInvoice(data.invoice)
  };
}

export async function adjustItemStock(input: {
  itemId: string;
  quantity: number;
  movementType: "adjustment_in" | "adjustment_out";
  godownId?: string;
  notes: string;
}) {
  const data = await apiFetch<{ current_stock: number }>(`/items/items/${input.itemId}/stock_adjustment/`, {
    method: "POST",
    body: JSON.stringify({
      quantity: input.quantity,
      movement_type: input.movementType,
      godown: input.godownId || null,
      notes: input.notes
    })
  });
  return Number(data.current_stock);
}

export async function createGodown(input: {
  name: string;
  location: string;
}) {
  const data = await apiFetch<any>("/items/godowns/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      address: input.location || null
    })
  });
  return mapGodown(data);
}

export async function updateGodown(input: {
  id: string;
  name: string;
  location: string;
  isDefault?: boolean;
}) {
  const data = await apiFetch<any>(`/items/godowns/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      address: input.location || null,
      is_default: Boolean(input.isDefault)
    })
  });
  return mapGodown(data);
}

export async function setDefaultGodown(godownId: string) {
  const data = await apiFetch<{ godown: any }>(`/items/godowns/${godownId}/set_default/`, {
    method: "POST"
  });
  return mapGodown(data.godown);
}

export async function deleteGodown(godownId: string) {
  await apiFetch<Record<string, never>>(`/items/godowns/${godownId}/`, {
    method: "DELETE"
  });
}

export async function getGodownSummary() {
  const data = await apiFetch<{ godowns: any[] }>("/items/godowns/summary/");
  return data.godowns.map(mapGodown);
}

export async function getStockMovements(itemId?: string) {
  const query = itemId ? `?item=${encodeURIComponent(itemId)}` : "";
  const data = await apiFetch<any[]>(`/items/movements/${query}`);
  return data.map(mapStockMovement);
}

export async function getGodownTransfers(filters: { itemId?: string; godownId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.itemId) params.set("item", filters.itemId);
  if (filters.godownId) params.set("godown", filters.godownId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<any[]>(`/items/transfers/${query}`);
  return data.map(mapGodownTransfer);
}

export async function transferItemStock(input: {
  itemId: string;
  fromGodownId: string;
  toGodownId: string;
  quantity: number;
  notes?: string;
}) {
  return apiFetch<{ message: string }>(`/items/items/${input.itemId}/transfer/`, {
    method: "POST",
    body: JSON.stringify({
      from_godown: input.fromGodownId,
      to_godown: input.toGodownId,
      quantity: input.quantity,
      notes: input.notes || "Godown transfer"
    })
  });
}

export async function createSalesInvoice(input: {
  partyId: string;
  items: InvoiceItem[];
  subtotal: number;
  total: number;
  paidAmount: number;
  paymentMode: string;
  isPos?: boolean;
  discountAmount?: number;
  additionalCharge?: number;
  additionalChargeLabel?: string;
  taxAmount?: number;
}) {
  const lineItems = input.items.map((line, index) => {
    const gross = roundMoney(line.rate * line.quantity);
    const discountAmount = roundMoney(gross * ((line.discountPct || 0) / 100));
    const taxable = roundMoney(Math.max(0, gross - discountAmount));
    const tax = roundMoney(taxable * (line.item.gstRate / 100));
    const amount = roundMoney(taxable + tax);
    return {
      item: line.item.id,
      item_name: line.item.name,
      item_code: line.item.itemCode || "",
      hsn_code: line.item.hsn,
      unit: "PCS",
      quantity: line.quantity,
      free_quantity: line.freeQuantity,
      mrp: line.item.mrp ?? line.rate,
      rate: line.rate,
      discount_pct: line.discountPct,
      discount_amount: discountAmount,
      gst_rate: line.item.gstRate,
      taxable_amount: taxable,
      tax_amount: tax,
      amount,
      sort_order: index
    };
  });
  const subtotal = roundMoney(input.subtotal);
  const total = roundMoney(input.total);
  const discountAmount = roundMoney(input.discountAmount || 0);
  const additionalCharge = roundMoney(input.additionalCharge || 0);
  const taxableAmount = roundMoney(Math.max(0, subtotal - discountAmount));
  const taxTotal = roundMoney(input.taxAmount ?? Math.max(0, total - taxableAmount - additionalCharge));

  const data = await apiFetch<any>("/sales/invoices/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      subtotal,
      discount_amount: discountAmount,
      discount_pct: subtotal > 0 ? roundMoney((discountAmount / subtotal) * 100) : 0,
      taxable_amount: taxableAmount,
      cgst_amount: roundMoney(taxTotal / 2),
      sgst_amount: roundMoney(taxTotal / 2),
      igst_amount: 0,
      cess_amount: 0,
      additional_charges: additionalCharge,
      additional_charges_label: input.additionalChargeLabel || "",
      total_amount: total,
      paid_amount: roundMoney(input.paidAmount),
      payment_mode: paymentModeToApi(input.paymentMode),
      place_of_supply: "Tamil Nadu",
      notes: input.isPos ? "Created from POS billing" : "Created from sales invoice workspace",
      is_pos: Boolean(input.isPos),
      line_items: lineItems
    })
  });

  return mapSalesInvoice(data, input.items, input.paymentMode);
}

export async function triggerEInvoice(invoiceId: string) {
  const data = await apiFetch<{ irn: string; qr_code_data: string; message: string; invoice: any }>(`/sales/invoices/${invoiceId}/trigger_einvoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    irn: data.irn,
    qrCodeData: data.qr_code_data,
    message: data.message,
    invoice: mapEInvoiceRecord(data.invoice)
  };
}

function mapEInvoiceLog(data: any): EInvoiceLog {
  return {
    id: data.id,
    event: data.event,
    status: data.status,
    provider: data.provider,
    message: data.message || "",
    createdAt: data.created_at || "",
    createdByName: data.created_by_name || ""
  };
}

function mapEInvoiceRecord(data: any): EInvoiceRecord {
  return {
    id: data.id,
    invoiceNumber: data.invoice_number || "-",
    partyName: data.party_name || "-",
    partyGstin: data.party_gstin || "",
    invoiceDate: formatApiDate(data.invoice_date || ""),
    totalAmount: Number(data.total_amount ?? 0),
    invoiceStatus: data.invoice_status || "-",
    irn: data.irn || "",
    ackNumber: data.ack_number || "",
    ackDate: data.ack_date || "",
    qrCodeData: data.qr_code_data || "",
    eInvoiceStatus: data.einvoice_status || "pending",
    eInvoiceProvider: data.einvoice_provider || "",
    eInvoiceRetryCount: Number(data.einvoice_retry_count ?? 0),
    eInvoiceLastError: data.einvoice_last_error || "",
    eInvoiceCancelReason: data.einvoice_cancel_reason || "",
    eInvoiceCancelledAt: data.einvoice_cancelled_at || "",
    logs: (data.logs || []).map(mapEInvoiceLog)
  };
}

export async function getEInvoiceRegister(status?: string) {
  const query = status && status !== "all" ? `?einvoice_status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<{ invoices: any[] }>(`/sales/invoices/einvoice_register/${query}`);
  return (data.invoices || []).map(mapEInvoiceRecord);
}

export async function retryEInvoice(invoiceId: string) {
  const data = await apiFetch<{ message: string; invoice: any }>(`/sales/invoices/${invoiceId}/retry_einvoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return { message: data.message, invoice: mapEInvoiceRecord(data.invoice) };
}

export async function cancelEInvoice(invoiceId: string, reason: string) {
  const data = await apiFetch<{ message: string; invoice: any }>(`/sales/invoices/${invoiceId}/cancel_einvoice/`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return { message: data.message, invoice: mapEInvoiceRecord(data.invoice) };
}

export async function getEInvoiceLogs(invoiceId: string) {
  const data = await apiFetch<{ logs: any[] }>(`/sales/invoices/${invoiceId}/einvoice_logs/`);
  return (data.logs || []).map(mapEInvoiceLog);
}

export async function getEInvoiceQrSvg(invoiceId: string) {
  return apiText(`/sales/invoices/${invoiceId}/einvoice_qr/`);
}

type SalesRegisterInput = {
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

const formatApiDate = (value: string) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

function mapPaymentSettlements(data: any): PaymentSettlement[] {
  return (data.settlements || []).map((settlement: any) => ({
    id: settlement.id,
    invoiceId: settlement.invoice,
    invoiceNumber: settlement.invoice_number || "-",
    settledAmount: Number(settlement.settled_amount ?? 0)
  }));
}

function mapPaymentGatewayOrder(data: any): PaymentGatewayOrder {
  return {
    id: data.id,
    provider: data.provider || "",
    providerOrderId: data.provider_order_id || "",
    providerPaymentId: data.provider_payment_id || "",
    providerStatus: data.provider_status || "",
    receipt: data.receipt || "",
    amount: Number(data.amount ?? 0),
    amountSubunits: Number(data.amount_subunits ?? 0),
    currency: data.currency || "INR",
    status: data.status || "created",
    signatureVerified: Boolean(data.signature_verified),
    partyId: data.party || "",
    partyName: data.party_name || "",
    invoiceId: data.invoice || "",
    invoiceNumber: data.invoice_number || "",
    paymentInId: data.payment_in || "",
    paymentNumber: data.payment_number || "",
    createdAt: data.created_at || "",
    updatedAt: data.updated_at || "",
    paidAt: data.paid_at || ""
  };
}

export async function createPaymentGatewayOrder(input: {
  partyId: string;
  invoiceId?: string;
  amount: number;
  notes?: Record<string, string>;
}) {
  const data = await apiFetch<any>("/payments/gateway/orders/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      invoice: input.invoiceId || null,
      amount: roundMoney(input.amount),
      notes: input.notes || {}
    })
  });
  return {
    order: mapPaymentGatewayOrder(data.order),
    checkout: data.checkout as {
      keyId: string;
      providerOrderId: string;
      amountSubunits: number;
      currency: string;
      businessName: string;
      customerName: string;
    }
  };
}

function salesRegisterLinePayload(input: SalesRegisterInput) {
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

function mapSalesRegisterRow(
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

export async function createPaymentIn(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/payments/payment-in/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      amount_received: roundMoney(input.amount),
      payment_mode: paymentModeToApi(input.paymentMode || "Cash"),
      reference_number: input.linkedVoucher || null,
      settlement_allocations: input.settlementInvoiceId
        ? [{ invoice: input.settlementInvoiceId, settled_amount: roundMoney(input.amount) }]
        : undefined,
      notes: input.notes || "Created from sales register workspace"
    })
  });
  const amount = Number(data.amount_received ?? input.amount);
  const settlements = mapPaymentSettlements(data);
  const settledAmount = settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0);

  return mapSalesRegisterRow(data, input, {
    dateField: "payment_date",
    numberField: "payment_number",
    itemName: "Customer Payment Receipt",
    linkedVoucher: data.reference_number || input.linkedVoucher || "-",
    validTill: "-",
    status: data.status === "void" ? "Void" : "Received",
    paymentMode: paymentModeFromApi(data.payment_mode),
    settledAmount,
    receivedAmount: amount,
    settlements,
    isAdvance: Boolean(data.is_advance),
    cancellationReason: data.cancellation_reason || ""
  });
}

export async function createQuotation(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/quotations/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      valid_till: parseDisplayDateForApi(input.validTill),
      subtotal: roundMoney(input.amount),
      total_amount: roundMoney(input.amount),
      notes: input.notes || "Created from sales register workspace",
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "quotation_date",
    numberField: "quotation_number",
    linkedVoucher: data.converted_invoice ? String(data.converted_invoice) : "-",
    validTill: formatApiDate(data.valid_till)
  });
}

export async function createDeliveryChallan(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/challans/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      total_amount: roundMoney(input.amount),
      notes: input.notes || "Created from sales register workspace",
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "challan_date",
    numberField: "challan_number",
    linkedVoucher: data.converted_invoice ? String(data.converted_invoice) : "-",
    validTill: "-"
  });
}

export async function createProformaInvoice(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/proforma-invoices/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      valid_till: parseDisplayDateForApi(input.validTill),
      total_amount: roundMoney(input.amount),
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "proforma_date",
    numberField: "proforma_number",
    linkedVoucher: data.converted_invoice ? String(data.converted_invoice) : "-",
    validTill: formatApiDate(data.valid_till),
    notesField: "notes"
  });
}

export async function createSalesReturn(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/sales-returns/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      total_amount: roundMoney(input.amount),
      reason: input.notes || input.linkedVoucher || "Created from sales register workspace",
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "return_date",
    numberField: "return_number",
    linkedVoucher: data.original_invoice_number || input.linkedVoucher || "-",
    validTill: "-",
    notesField: "reason"
  });
}

export async function createCreditNote(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/credit-notes/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      total_amount: roundMoney(input.amount),
      reason: input.notes || input.linkedVoucher || "Created from sales register workspace"
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "note_date",
    numberField: "credit_note_number",
    itemName: "Credit Adjustment",
    linkedVoucher: input.linkedVoucher || "-",
    validTill: "-",
    notesField: "reason"
  });
}

export type SalesVoucherLifecycleView =
  | "quotation"
  | "payment-in"
  | "sales-return"
  | "credit-note"
  | "delivery-challan"
  | "proforma-invoice";

export type PurchaseVoucherLifecycleView =
  | "purchases"
  | "payment-out"
  | "purchase-return"
  | "debit-note"
  | "purchase-orders";

export type ConvertedSalesInvoiceResult = {
  id: string;
  invoiceNumber: string;
  date: string;
  partyName: string;
  total: number;
  status: string;
};

const salesVoucherPaths: Record<SalesVoucherLifecycleView, string> = {
  quotation: "/sales/quotations",
  "payment-in": "/payments/payment-in",
  "sales-return": "/sales/sales-returns",
  "credit-note": "/sales/credit-notes",
  "delivery-challan": "/sales/challans",
  "proforma-invoice": "/sales/proforma-invoices"
};

const purchaseVoucherPaths: Record<PurchaseVoucherLifecycleView, string> = {
  purchases: "/purchases/invoices",
  "payment-out": "/payments/payment-out",
  "purchase-return": "/purchases/returns",
  "debit-note": "/purchases/debit-notes",
  "purchase-orders": "/purchases/orders"
};

export async function updateSalesVoucher(input: {
  view: SalesVoucherLifecycleView;
  id: string;
  notes?: string;
  linkedVoucher?: string;
  validTill?: string;
}) {
  const payload: Record<string, unknown> = {};

  if (input.view === "payment-in") {
    payload.notes = input.notes || "";
    payload.reference_number = input.linkedVoucher || null;
  } else if (input.view === "sales-return" || input.view === "credit-note") {
    payload.reason = input.notes || "";
  } else if (input.view === "proforma-invoice") {
    payload.valid_till = parseDisplayDateForApi(input.validTill);
  } else {
    payload.notes = input.notes || "";
    if (input.view === "quotation") {
      payload.valid_till = parseDisplayDateForApi(input.validTill);
    }
  }

  return apiFetch<any>(`${salesVoucherPaths[input.view]}/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function cancelSalesVoucher(input: {
  view: SalesVoucherLifecycleView;
  id: string;
  reason?: string;
}) {
  if (input.view === "payment-in") {
    return apiFetch<any>(`${salesVoucherPaths[input.view]}/${input.id}/void/`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason || "Voided from register workspace" })
    });
  }

  return apiFetch<any>(`${salesVoucherPaths[input.view]}/${input.id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason: input.reason || "Cancelled from register workspace" })
  });
}

export type PaymentReceiptDetails = {
  settlements: PaymentSettlement[];
  isAdvance: boolean;
  status: string;
  cancellationReason: string;
  referenceNumber: string;
  notes: string;
};

export async function getSalesPaymentReceipt(paymentId: string): Promise<PaymentReceiptDetails> {
  const data = await apiFetch<any>(`${salesVoucherPaths["payment-in"]}/${paymentId}/`);
  return {
    settlements: mapPaymentSettlements(data),
    isAdvance: Boolean(data.is_advance),
    status: data.status === "void" ? "Void" : "Received",
    cancellationReason: data.cancellation_reason || "",
    referenceNumber: data.reference_number || "-",
    notes: data.notes || ""
  };
}

export async function getSalesPaymentReceiptHtml(paymentId: string) {
  return apiText(`${salesVoucherPaths["payment-in"]}/${paymentId}/receipt/?export_format=html`);
}

export async function getSalesPaymentReceiptShareText(paymentId: string) {
  return apiText(`${salesVoucherPaths["payment-in"]}/${paymentId}/receipt/?export_format=text`);
}

function mapConvertedSalesInvoice(data: any): ConvertedSalesInvoiceResult {
  const invoice = data.invoice || data;
  if (!invoice?.id) {
    throw new Error(data.message || "The voucher was not converted because the invoice response was incomplete.");
  }
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number || invoice.invoiceNumber || "-",
    date: formatApiDate(invoice.invoice_date || invoice.date || ""),
    partyName: String(invoice.party_name || invoice.party?.name || "").toUpperCase(),
    total: Number(invoice.total_amount ?? invoice.total ?? 0),
    status: String(invoice.status || "unpaid").replace(/^\w/, char => char.toUpperCase())
  };
}

export async function convertSalesVoucherToInvoice(view: SalesVoucherLifecycleView, id: string) {
  if (view !== "quotation" && view !== "delivery-challan" && view !== "proforma-invoice") {
    throw new Error("This voucher cannot be converted to an invoice.");
  }

  const data = await apiFetch<{ invoice: any }>(`${salesVoucherPaths[view]}/${id}/convert_to_invoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapConvertedSalesInvoice(data);
}

function purchaseLinePayload(input: { item: Item; quantity: number; amount: number }) {
  const quantity = Math.max(1, Number(input.quantity) || 1);
  const taxable = roundMoney(input.amount);
  const tax = roundMoney(taxable * (input.item.gstRate / 100));
  const total = roundMoney(taxable + tax);

  return {
    item: input.item.id,
    item_name: input.item.name,
    quantity,
    rate: roundMoney(taxable / quantity),
    discount_pct: 0,
    gst_rate: roundMoney(input.item.gstRate),
    taxable_amount: taxable,
    amount: total,
    sort_order: 0
  };
}

export async function createPurchaseInvoice(input: {
  partyId: string;
  item: Item;
  quantity: number;
  amount: number;
  notes: string;
  paymentMode?: string;
  paidAmount?: number;
  supplierInvoiceNumber?: string;
}) {
  const line = purchaseLinePayload(input);
  const taxable = roundMoney(input.amount);
  const total = roundMoney(line.amount);
  const taxTotal = roundMoney(total - taxable);
  const data = await apiFetch<any>("/purchases/invoices/", {
    method: "POST",
    body: JSON.stringify({
      supplier_invoice_number: input.supplierInvoiceNumber || null,
      party: input.partyId,
      subtotal: taxable,
      taxable_amount: taxable,
      cgst_amount: roundMoney(taxTotal / 2),
      sgst_amount: roundMoney(taxTotal / 2),
      igst_amount: 0,
      cess_amount: 0,
      total_amount: total,
      paid_amount: roundMoney(input.paidAmount ?? 0),
      payment_mode: paymentModeToApi(input.paymentMode || "Cash"),
      notes: input.notes || "Created from purchase workspace",
      line_items: [line]
    })
  });
  const firstLine = data.line_items?.[0];

  return {
    id: data.id,
    date: formatApiDate(data.invoice_date),
    number: data.invoice_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: data.due_date ? formatApiDate(data.due_date) : "-",
    itemName: firstLine?.item_name || input.item.name,
    qty: Number(firstLine?.quantity ?? input.quantity),
    amount: Number(data.total_amount),
    paidAmount: Number(data.paid_amount),
    settledAmount: Number(data.paid_amount),
    paymentMode: "-",
    linkedVoucher: data.supplier_invoice_number || "-",
    expectedDate: "-",
    status: String(data.status || "unpaid").replace(/^\w/, char => char.toUpperCase()),
    notes: data.notes || ""
  } satisfies PurchaseRegisterRow;
}

export async function createPaymentOut(input: {
  partyId: string;
  amount: number;
  paymentMode: string;
  linkedVoucher: string;
  settlementInvoiceId?: string;
  notes: string;
}) {
  const data = await apiFetch<any>("/payments/payment-out/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      amount_paid: roundMoney(input.amount),
      payment_mode: paymentModeToApi(input.paymentMode),
      reference_number: input.linkedVoucher || null,
      settlement_allocations: input.settlementInvoiceId
        ? [{ invoice: input.settlementInvoiceId, settled_amount: roundMoney(input.amount) }]
        : undefined,
      notes: input.notes || "Created from purchase workspace"
    })
  });
  const settlements = mapPaymentSettlements(data);
  const amountPaid = Number(data.amount_paid);

  return {
    id: data.id,
    date: formatApiDate(data.payment_date),
    number: data.payment_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: "-",
    itemName: "Supplier Payment Settlement",
    qty: 1,
    amount: amountPaid,
    paidAmount: amountPaid,
    settledAmount: settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0),
    paymentMode: paymentModeFromApi(data.payment_mode),
    linkedVoucher: data.reference_number || "-",
    expectedDate: "-",
    status: data.status === "void" ? "Void" : "Paid",
    notes: data.notes || "",
    settlements,
    isAdvance: Boolean(data.is_advance),
    cancellationReason: data.cancellation_reason || ""
  } satisfies PurchaseRegisterRow;
}

export async function createPurchaseOrder(input: {
  partyId: string;
  item: Item;
  quantity: number;
  amount: number;
  notes: string;
}) {
  const line = purchaseLinePayload(input);
  const orderLine = {
    item: line.item,
    item_name: line.item_name,
    quantity: line.quantity,
    rate: line.rate,
    gst_rate: line.gst_rate,
    amount: line.amount,
    sort_order: line.sort_order
  };
  const data = await apiFetch<any>("/purchases/orders/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      total_amount: line.amount,
      notes: input.notes || "Created from purchase workspace",
      line_items: [orderLine]
    })
  });
  const firstLine = data.line_items?.[0];

  return {
    id: data.id,
    date: formatApiDate(data.order_date),
    number: data.order_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: "-",
    itemName: firstLine?.item_name || input.item.name,
    qty: Number(firstLine?.quantity ?? input.quantity),
    amount: Number(data.total_amount),
    paidAmount: 0,
    settledAmount: 0,
    paymentMode: "-",
    linkedVoucher: "-",
    expectedDate: "-",
    status: String(data.status || "open").replace(/^\w/, char => char.toUpperCase()),
    notes: data.notes || ""
  } satisfies PurchaseRegisterRow;
}

export async function createDebitNote(input: {
  partyId: string;
  amount: number;
  linkedVoucher: string;
  notes: string;
}) {
  const data = await apiFetch<any>("/purchases/debit-notes/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      total_amount: roundMoney(input.amount),
      reason: input.notes || "Created from purchase workspace"
    })
  });

  return {
    id: data.id,
    date: formatApiDate(data.note_date),
    number: data.debit_note_number,
    partyName: "",
    dueIn: "-",
    itemName: "Debit Note",
    qty: 1,
    amount: Number(data.total_amount),
    paidAmount: 0,
    settledAmount: 0,
    paymentMode: "-",
    linkedVoucher: input.linkedVoucher || "-",
    expectedDate: "-",
    status: String(data.status || "unpaid").replace(/^\w/, char => char.toUpperCase()),
    notes: data.reason || ""
  } satisfies PurchaseRegisterRow;
}

export async function createPurchaseReturn(input: {
  partyId: string;
  item: Item;
  quantity: number;
  amount: number;
  linkedVoucher: string;
  notes: string;
}) {
  const line = purchaseLinePayload(input);
  const data = await apiFetch<any>("/purchases/returns/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      reference_number: input.linkedVoucher || null,
      total_amount: roundMoney(line.amount),
      reason: input.notes || "Created from purchase return workspace",
      line_items: [{
        item: line.item,
        item_name: line.item_name,
        quantity: line.quantity,
        rate: line.rate,
        gst_rate: line.gst_rate,
        taxable_amount: line.taxable_amount,
        amount: line.amount,
        sort_order: line.sort_order
      }]
    })
  });
  const firstLine = data.line_items?.[0];

  return {
    id: data.id,
    date: formatApiDate(data.return_date),
    number: data.return_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: "-",
    itemName: firstLine?.item_name || input.item.name,
    qty: Number(firstLine?.quantity ?? input.quantity),
    amount: Number(data.total_amount),
    paidAmount: 0,
    settledAmount: 0,
    paymentMode: "-",
    linkedVoucher: data.original_invoice_number || data.reference_number || "-",
    expectedDate: "-",
    status: String(data.status || "adjusted").replace(/_/g, " ").replace(/^\w/, char => char.toUpperCase()),
    notes: data.reason || ""
  } satisfies PurchaseRegisterRow;
}

export async function convertPurchaseOrder(orderId: string) {
  const data = await apiFetch<{ invoice: any }>(`/purchases/orders/${orderId}/convert_to_invoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return data.invoice;
}

export async function updatePurchaseVoucher(input: {
  view: PurchaseVoucherLifecycleView;
  id: string;
  notes?: string;
  linkedVoucher?: string;
}) {
  const payload: Record<string, unknown> = {};

  if (input.view === "payment-out") {
    payload.notes = input.notes || "";
    payload.reference_number = input.linkedVoucher || null;
  } else if (input.view === "purchase-return") {
    payload.reason = input.notes || "";
    payload.reference_number = input.linkedVoucher || null;
  } else if (input.view === "debit-note") {
    payload.reason = input.notes || "";
  } else if (input.view === "purchases") {
    payload.notes = input.notes || "";
    payload.supplier_invoice_number = input.linkedVoucher || null;
  } else {
    payload.notes = input.notes || "";
  }

  return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function cancelPurchaseVoucher(input: {
  view: PurchaseVoucherLifecycleView;
  id: string;
  reason?: string;
}) {
  if (input.view === "purchases") {
    return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/cancel/`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason || "Cancelled from purchase workspace" })
    });
  }

  if (input.view === "payment-out") {
    return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/void/`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason || "Voided from purchase workspace" })
    });
  }

  return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason: input.reason || "Cancelled from purchase workspace" })
  });
}

export async function getPurchasePaymentReceipt(paymentId: string): Promise<PaymentReceiptDetails> {
  const data = await apiFetch<any>(`${purchaseVoucherPaths["payment-out"]}/${paymentId}/`);
  return {
    settlements: mapPaymentSettlements(data),
    isAdvance: Boolean(data.is_advance),
    status: data.status === "void" ? "Void" : "Paid",
    cancellationReason: data.cancellation_reason || "",
    referenceNumber: data.reference_number || "-",
    notes: data.notes || ""
  };
}

export async function getPurchasePaymentReceiptHtml(paymentId: string) {
  return apiText(`${purchaseVoucherPaths["payment-out"]}/${paymentId}/receipt/?export_format=html`);
}

export async function getPurchasePaymentReceiptShareText(paymentId: string) {
  return apiText(`${purchaseVoucherPaths["payment-out"]}/${paymentId}/receipt/?export_format=text`);
}

export async function createBankAccount(input: {
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  openingBalance: number;
}) {
  return apiFetch<any>("/accounting/accounts/", {
    method: "POST",
    body: JSON.stringify({
      account_name: input.accountName,
      bank_name: input.bankName,
      account_number: input.accountNumber,
      ifsc_code: input.ifscCode,
      branch: input.branch || null,
      opening_balance: roundMoney(input.openingBalance)
    })
  });
}

export async function createBankTransaction(input: {
  accountId: string;
  transactionType: "deposit" | "withdrawal";
  amount: number;
  description: string;
  referenceNumber?: string;
}) {
  return apiFetch<any>("/accounting/transactions/", {
    method: "POST",
    body: JSON.stringify({
      bank_account: input.accountId,
      transaction_type: input.transactionType,
      amount: roundMoney(input.amount),
      description: input.description || "Manual cash and bank adjustment",
      reference_number: input.referenceNumber || null
    })
  });
}

export async function transferMoney(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  referenceNumber?: string;
}) {
  return apiFetch<any>("/accounting/accounts/transfer/", {
    method: "POST",
    body: JSON.stringify({
      from_account: input.fromAccountId,
      to_account: input.toAccountId,
      amount: roundMoney(input.amount),
      description: input.description || "Cash and bank transfer",
      reference_number: input.referenceNumber || null
    })
  });
}

export async function createExpense(input: {
  category: string;
  amount: number;
  paidAmount: number;
  paymentMode: string;
  referenceNumber?: string;
  notes: string;
}) {
  return apiFetch<any>("/accounting/expenses/", {
    method: "POST",
    body: JSON.stringify({
      expense_category: input.category,
      total_amount: roundMoney(input.amount),
      paid_amount: roundMoney(input.paidAmount),
      payment_mode: paymentModeToApi(input.paymentMode),
      reference_number: input.referenceNumber || null,
      notes: input.notes || "Created from expense workspace"
    })
  });
}

export async function createAutomatedBill(input: {
  name: string;
  amount: number;
  frequency: string;
  nextDueDate: string;
}) {
  return apiFetch<any>("/accounting/recurring-bills/", {
    method: "POST",
    body: JSON.stringify({
      bill_name: input.name,
      amount: roundMoney(input.amount),
      frequency: input.frequency,
      next_due_date: input.nextDueDate
    })
  });
}

export async function createStaffMember(input: {
  name: string;
  phone: string;
  designation: string;
  salary: number;
}) {
  const data = await apiFetch<any>("/staff/directory/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone || null,
      designation: input.designation,
      monthly_salary: roundMoney(input.salary)
    })
  });

  return {
    id: data.id,
    name: data.name,
    designation: data.designation || "",
    salary: Number(data.monthly_salary),
    attendance: {}
  } satisfies Staff;
}

export async function markStaffAttendance(input: {
  date: string;
  records: Array<{ staffId: string; status: "present" | "absent" | "half_day" }>;
}) {
  return apiFetch<any>("/staff/attendance/bulk_mark/", {
    method: "POST",
    body: JSON.stringify({
      date: input.date,
      records: input.records.map(record => ({
        staff_id: record.staffId,
        status: record.status
      }))
    })
  });
}

export async function getStaffPayrollReport(input: { month: number; year: number }) {
  const params = new URLSearchParams({
    month: String(input.month),
    year: String(input.year)
  });
  const response = await apiFetch<{ data: StaffPayrollReport }>(`/staff/payroll/monthly_report/?${params.toString()}`);
  return response.data;
}

export async function generateStaffPayroll(input: { month: number; year: number }) {
  const response = await apiFetch<{ data: StaffPayrollReport }>("/staff/payroll/generate_monthly/", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.data;
}

export async function markStaffPayrollPaid(input: { payrollId: string; paymentDate?: string; notes?: string }) {
  const response = await apiFetch<{ data: StaffPayrollRow }>(`/staff/payroll/${input.payrollId}/mark_paid/`, {
    method: "POST",
    body: JSON.stringify({
      payment_date: input.paymentDate,
      notes: input.notes
    })
  });
  return response.data;
}

export async function createTenantUser(input: {
  firstName: string;
  mobile: string;
  role: string;
}) {
  return apiFetch<any>("/auth/users/", {
    method: "POST",
    body: JSON.stringify({
      first_name: input.firstName,
      mobile: input.mobile,
      role: input.role
    })
  });
}

export async function deleteTenantUser(userId: string) {
  return apiFetch<any>(`/auth/users/${userId}/`, {
    method: "DELETE"
  });
}

function mapOnlineOrder(data: any): OnlineOrder {
  return {
    id: data.id,
    orderNumber: data.order_number || data.orderNumber,
    orderDate: formatApiDate(data.order_date || data.orderDate),
    customerName: data.customer_name || data.customerName || "",
    customerMobile: data.customer_mobile || data.customerMobile || "-",
    partyId: data.party || data.partyId || "",
    itemId: data.item || data.itemId || "",
    itemName: data.item_name || data.itemName || "",
    itemCode: data.item_code || data.itemCode || "",
    quantity: Number(data.quantity ?? 0),
    unitPrice: Number(data.unit_price ?? data.unitPrice ?? 0),
    taxableAmount: Number(data.taxable_amount ?? data.taxableAmount ?? 0),
    taxAmount: Number(data.tax_amount ?? data.taxAmount ?? 0),
    totalAmount: Number(data.total_amount ?? data.totalAmount ?? 0),
    paymentStatus: data.payment_status || data.paymentStatus || "pending",
    dispatchStatus: data.dispatch_status || data.dispatchStatus || "new",
    source: data.source || "online_store",
    stockDeducted: Boolean(data.stock_deducted ?? data.stockDeducted),
    deliveryAddress: data.delivery_address || data.deliveryAddress || "",
    notes: data.notes || "",
    currentStock: Number(data.current_stock ?? data.currentStock ?? 0)
  };
}

export async function createOnlineOrder(input: {
  partyId: string;
  itemId: string;
  customerName: string;
  customerMobile: string;
  deliveryAddress: string;
  quantity: number;
  paymentStatus: "pending" | "paid" | "cod";
  source: "online_store" | "whatsapp" | "manual";
  notes: string;
}) {
  const data = await apiFetch<any>("/business-tools/online-orders/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId || null,
      item: input.itemId,
      customer_name: input.customerName,
      customer_mobile: input.customerMobile || null,
      delivery_address: input.deliveryAddress || null,
      quantity: input.quantity,
      payment_status: input.paymentStatus,
      source: input.source,
      notes: input.notes || "Created from online orders workspace"
    })
  });
  return mapOnlineOrder(data);
}

export async function updateOnlineOrderStatus(input: {
  orderId: string;
  dispatchStatus?: OnlineOrder["dispatchStatus"];
  paymentStatus?: OnlineOrder["paymentStatus"];
}) {
  const data = await apiFetch<{ order: any }>(`/business-tools/online-orders/${input.orderId}/set_status/`, {
    method: "POST",
    body: JSON.stringify({
      dispatch_status: input.dispatchStatus,
      payment_status: input.paymentStatus
    })
  });
  return mapOnlineOrder(data.order);
}

function mapSmsCampaign(data: any): SMSCampaign {
  return {
    id: data.id,
    campaignNumber: data.campaign_number || data.campaignNumber,
    name: data.name || "",
    templateId: data.template || data.templateId || "",
    templateName: data.template_name || data.templateName || "-",
    audience: data.audience || "all_customers",
    message: data.message || "",
    recipientCount: Number(data.recipient_count ?? data.recipientCount ?? 0),
    deliveredCount: Number(data.delivered_count ?? data.deliveredCount ?? 0),
    failedCount: Number(data.failed_count ?? data.failedCount ?? 0),
    creditCost: Number(data.credit_cost ?? data.creditCost ?? 0),
    status: data.status || "draft",
    queuedAt: formatApiDate((data.queued_at || data.queuedAt || "").slice(0, 10)),
    completedAt: formatApiDate((data.completed_at || data.completedAt || "").slice(0, 10)),
    createdAt: formatApiDate((data.created_at || data.createdAt || "").slice(0, 10))
  };
}

export async function createSmsCampaign(input: {
  name: string;
  templateId: string;
  audience: "all_customers" | "manual";
  message: string;
  partyIds: string[];
  sendNow: boolean;
}) {
  const data = await apiFetch<any>("/business-tools/sms-campaigns/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      template: input.templateId || null,
      audience: input.audience,
      message: input.message,
      party_ids: input.partyIds,
      send_now: input.sendNow
    })
  });
  return mapSmsCampaign(data);
}

export async function syncSmsCampaignDelivery(campaignId: string) {
  const data = await apiFetch<{ campaign: any }>(`/business-tools/sms-campaigns/${campaignId}/sync_delivery/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapSmsCampaign(data.campaign);
}
