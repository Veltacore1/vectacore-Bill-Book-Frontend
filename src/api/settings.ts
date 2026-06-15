import type { BusinessNotification, NotificationCenterData, PendingNotifications, ReferralInvite } from "../types";
import { apiFetch, formatApiDate } from "./core";

function mapReferralInvite(data: any): ReferralInvite {
  return {
    id: data.id,
    referralCode: data.referral_code || data.referralCode || "",
    businessName: data.business_name || data.businessName || "",
    contactName: data.contact_name || data.contactName || "",
    mobile: data.mobile || "",
    status: data.status || "invited",
    rewardLabel: data.reward_label || data.rewardLabel || "Pending",
    notes: data.notes || "",
    activatedAt: formatApiDate((data.activated_at || data.activatedAt || "").slice(0, 10)),
    createdAt: formatApiDate((data.created_at || data.createdAt || "").slice(0, 10))
  };
}

export async function getReferralInvites() {
  const data = await apiFetch<any[]>("/settings/referral-invites/");
  return (Array.isArray(data) ? data : []).map(mapReferralInvite);
}

export async function createReferralInvite(input: {
  businessName: string;
  contactName: string;
  mobile: string;
  notes: string;
}) {
  const data = await apiFetch<any>("/settings/referral-invites/", {
    method: "POST",
    body: JSON.stringify({
      business_name: input.businessName,
      contact_name: input.contactName,
      mobile: input.mobile,
      notes: input.notes
    })
  });
  return mapReferralInvite(data);
}

export async function markReferralInviteActivated(inviteId: string) {
  const data = await apiFetch<{ invite: any }>(`/settings/referral-invites/${inviteId}/mark_activated/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapReferralInvite(data.invite);
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
