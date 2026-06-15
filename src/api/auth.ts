import type { ActivityFeedItem, Business, CAReportSharingData, SettingsData, SupportTicket } from "../types";
import { apiFetch, buildHeaders, cacheAccessToken, clearLegacyStoredTokens, formatApiDate, readJson, API_BASE } from "./core";

export async function sendLoginOtp(input: { mobile: string }) {
  const response = await fetch(`${API_BASE}/auth/send-otp`, {
    method: "POST",
    credentials: "include",
    headers: await buildHeaders(undefined, { method: "POST", json: true }),
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
    credentials: "include",
    headers: await buildHeaders(undefined, { method: "POST", json: true }),
    body: JSON.stringify({
      mobile: input.mobile,
      otp: input.otp
    })
  });
  const data = await readJson<{ tokens: { access: string }; business?: Business }>(response);
  cacheAccessToken(data.tokens.access);
  clearLegacyStoredTokens();
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
    credentials: "include",
    headers: await buildHeaders(undefined, { method: "POST", json: true }),
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
  const data = await readJson<{ tokens: { access: string }; business: Business }>(response);
  cacheAccessToken(data.tokens.access);
  clearLegacyStoredTokens();
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

function mapSupportTicket(data: any): SupportTicket {
  return {
    id: data.id,
    ticketNumber: data.ticket_number || data.ticketNumber || "",
    subject: data.subject || "",
    category: data.category || "billing",
    channel: data.channel || "chat",
    priority: data.priority || "medium",
    message: data.message || "",
    contactName: data.contact_name || data.contactName || "",
    contactMobile: data.contact_mobile || data.contactMobile || "",
    contactEmail: data.contact_email || data.contactEmail || "",
    status: data.status || "open",
    resolvedAt: formatApiDate((data.resolved_at || data.resolvedAt || "").slice(0, 10)),
    createdAt: formatApiDate((data.created_at || data.createdAt || "").slice(0, 10))
  };
}

export async function getSupportTickets(status?: SupportTicket["status"] | "all") {
  const query = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<any[]>(`/settings/support-tickets/${query}`);
  return (Array.isArray(data) ? data : []).map(mapSupportTicket);
}

export async function createSupportTicket(input: {
  subject: string;
  category: SupportTicket["category"];
  channel: SupportTicket["channel"];
  priority: SupportTicket["priority"];
  message: string;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
}) {
  const data = await apiFetch<any>("/settings/support-tickets/", {
    method: "POST",
    body: JSON.stringify({
      subject: input.subject,
      category: input.category,
      channel: input.channel,
      priority: input.priority,
      message: input.message,
      contact_name: input.contactName,
      contact_mobile: input.contactMobile,
      contact_email: input.contactEmail
    })
  });
  return mapSupportTicket(data);
}

export async function resolveSupportTicket(ticketId: string) {
  const data = await apiFetch<{ ticket: any }>(`/settings/support-tickets/${ticketId}/resolve/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapSupportTicket(data.ticket);
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

export async function updateTenantUser(userId: string, input: {
  firstName: string;
  role: string;
  isActive: boolean;
}) {
  return apiFetch<any>(`/auth/users/${userId}/`, {
    method: "PATCH",
    body: JSON.stringify({
      first_name: input.firstName,
      role: input.role,
      is_active: input.isActive
    })
  });
}
