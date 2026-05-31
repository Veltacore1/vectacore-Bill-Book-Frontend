import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  FileText,
  Gift,
  HelpCircle,
  Keyboard,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings as SettingsIcon,
  Share2,
  Shield,
  ToggleLeft,
  UserCog,
  Users
} from "lucide-react";
import {
  dispatchDueReminders,
  getActivityFeed,
  getBusinessNotifications,
  getCAReportSharing,
  getPendingNotifications,
  markAllBusinessNotificationsRead,
  markBusinessNotificationRead,
  revokeCAReportSharing,
  shareCAReports,
  syncBusinessNotifications,
  updateAccountSettings,
  updateBusinessSettings,
  updateInvoiceSettings,
  updateReminderSettings,
  waitForBusinessNotificationUpdates
} from "../api";
import type {
  ActivityFeedItem,
  Business,
  CAReportSharingData,
  Item,
  NotificationCenterData,
  PendingNotifications,
  ProviderStatus,
  SalesInvoice,
  SettingsData
} from "../types";
import { getModulePermission, roleModulePermissions } from "../types";

interface SettingsProps {
  business: Business;
  settings: SettingsData | null;
  providerStatus: Partial<Record<string, ProviderStatus>>;
  users: Array<{ id: string; name: string; mobile: string; role: string; isActive: boolean }>;
  items: Item[];
  invoices: SalesInvoice[];
  onWorkspaceRefresh: () => Promise<unknown>;
  onNavigate: (tab: string) => void;
  onBack: () => void;
  onLogout: () => void;
}

type SettingsView =
  | "account"
  | "business"
  | "invoice"
  | "print"
  | "users"
  | "activity"
  | "reminders"
  | "ca-reports"
  | "pricing"
  | "refer"
  | "help";

type Notice = { kind: "success" | "error"; text: string } | null;
type SavingKey = "account" | "business" | "invoice" | "reminders" | null;

const RUPEE = "\u20b9";
const emptyPendingNotifications: PendingNotifications = {
  actions: [],
  pendingReminders: [],
  counts: { actions: 0, pendingReminders: 0 }
};
const emptyNotificationCenter: NotificationCenterData = {
  notifications: [],
  counts: { total: 0, unread: 0, read: 0, dismissed: 0 }
};
const emptyCAReportSharing: CAReportSharingData = {
  enabled: false,
  caName: "",
  caEmail: "",
  caMobile: "",
  bundleReports: [],
  summary: {
    totalShares: 0,
    activeShares: 0,
    revokedShares: 0,
    lastSharedAt: "",
    lastRecipient: ""
  },
  shares: []
};

const settingsItems: Array<{
  id: SettingsView;
  label: string;
  Icon: typeof Users;
  badge?: string;
}> = [
  { id: "account", label: "Account", Icon: Users },
  { id: "business", label: "Manage Business", Icon: BriefcaseBusiness },
  { id: "invoice", label: "Invoice Settings", Icon: ReceiptText },
  { id: "print", label: "Print Settings", Icon: Printer, badge: "New" },
  { id: "users", label: "Manage Users", Icon: UserCog },
  { id: "activity", label: "Activity Log", Icon: FileText },
  { id: "reminders", label: "Reminders", Icon: Bell },
  { id: "ca-reports", label: "CA Reports Sharing", Icon: BarChart3 },
  { id: "pricing", label: "Pricing", Icon: CircleHelp },
  { id: "refer", label: "Refer & Earn", Icon: Gift },
  { id: "help", label: "Help And Support", Icon: HelpCircle }
];

const defaultSettings = (business: Business): SettingsData => ({
  account: {
    id: "",
    name: "",
    firstName: "",
    lastName: "",
    mobile: business.phone || "",
    email: business.email || "",
    role: "admin"
  },
  businessProfile: {
    id: business.id || "",
    name: business.name || "",
    phone: business.phone || "",
    gstin: business.gstin || "",
    category: "",
    state: business.state || "",
    address: business.address || "",
    city: business.city || "",
    pincode: business.pincode || "",
    email: business.email || "",
    upiId: "",
    bankAccountDetails: {},
    showInOnlineStore: false,
    enableGstBilling: Boolean(business.gstin),
    showLogoOnInvoice: true,
    branchBilling: false,
    showUpiOnInvoice: false,
    printPreview: true,
    hideZeroStockBarcodes: false,
    printOriginalDuplicate: true,
    autoPrintAfterSale: false,
    caReportsEnabled: false,
    caName: "",
    caEmail: "",
    caMobile: "",
    planName: "Free Plan",
    planValidTill: "",
    referralCode: "",
    supportEmail: "",
    supportPhone: ""
  },
  invoice: {
    id: "",
    theme: "advanced_gst",
    themeColor: "#5B48F5",
    themeStyle: "",
    showMrp: true,
    showHsn: true,
    showDiscount: true,
    showColor: true,
    showCinDate: true,
    showGrnDate: true,
    showFreeQty: false,
    showPartyBalance: false,
    showItemDescription: false,
    showTimeOnInvoice: true,
    showDiscountOnMrp: false,
    paperSize: "A4",
    thermalPaperSize: "2inch",
    thermalTheme: "compact",
    logoUrl: "",
    signatureUrl: "",
    customFields: [],
    invoicePrefix: business.prefix || "INV",
    resetEachYear: true
  },
  reminders: {
    paymentDue: true,
    saleInvoice: true,
    lowStock: false,
    customerOccasions: false,
    dailySummary: true
  }
});

const formatMoney = (value: number) =>
  `${RUPEE} ${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const formatIsoDate = (value: string) => {
  if (!value) return "Not configured";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const latestNotificationTimestamp = (center: NotificationCenterData) => {
  return center.notifications.reduce((latest, notification) => {
    const value = notification.updatedAt || notification.createdAt;
    const timestamp = value ? new Date(value).getTime() : 0;
    return timestamp > latest.timestamp ? { value, timestamp } : latest;
  }, { value: "", timestamp: 0 }).value;
};

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    admin: "Admin",
    partner: "Partner",
    salesman: "Salesman (Without edit access)",
    accountant: "Accountant",
    stock_manager: "Stock Manager"
  };
  return labels[role] || role;
};

const initialsFor = (name: string) =>
  (name || "Business")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

export default function Settings({
  business,
  settings,
  providerStatus,
  users,
  items,
  invoices,
  onWorkspaceRefresh,
  onNavigate,
  onBack,
  onLogout
}: SettingsProps) {
  const source = useMemo(() => settings ?? defaultSettings(business), [business, settings]);
  const modulePermissions = useMemo(() => roleModulePermissions(source.account.role), [source.account.role]);
  const settingsPermission = getModulePermission(modulePermissions, "settings");
  const usersPermission = getModulePermission(modulePermissions, "users");
  const auditPermission = getModulePermission(modulePermissions, "audit");
  const businessPermission = getModulePermission(modulePermissions, "business");
  const canWriteSettings = settingsPermission.create || settingsPermission.manage;
  const canCreateUsers = usersPermission.create;
  const canManageCaAccess = canWriteSettings && usersPermission.create;
  const [view, setView] = useState<SettingsView>("invoice");
  const [accountDraft, setAccountDraft] = useState(source.account);
  const [businessDraft, setBusinessDraft] = useState(source.businessProfile);
  const [invoiceDraft, setInvoiceDraft] = useState(source.invoice);
  const [reminderDraft, setReminderDraft] = useState(source.reminders);
  const [themeMode, setThemeMode] = useState<"a4" | "thermal">("a4");
  const [saving, setSaving] = useState<SavingKey>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [activityRows, setActivityRows] = useState<ActivityFeedItem[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [reminderQueue, setReminderQueue] = useState<PendingNotifications>(emptyPendingNotifications);
  const [isReminderLoading, setIsReminderLoading] = useState(false);
  const [isDispatchingReminders, setIsDispatchingReminders] = useState(false);
  const [notificationCenter, setNotificationCenter] = useState<NotificationCenterData>(emptyNotificationCenter);
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<"all" | "unread" | "read" | "dismissed">("all");
  const [notificationLiveStatus, setNotificationLiveStatus] = useState<"connecting" | "live" | "updating" | "offline">("connecting");
  const [caReportSharing, setCAReportSharing] = useState<CAReportSharingData>(emptyCAReportSharing);
  const [isCALoading, setIsCALoading] = useState(false);
  const [isCAPreparing, setIsCAPreparing] = useState(false);
  const notificationCursorRef = useRef(new Date().toISOString());

  useEffect(() => {
    setAccountDraft(source.account);
    setBusinessDraft(source.businessProfile);
    setInvoiceDraft(source.invoice);
    setReminderDraft(source.reminders);
  }, [source]);

  const resetDrafts = () => {
    setAccountDraft(source.account);
    setBusinessDraft(source.businessProfile);
    setInvoiceDraft(source.invoice);
    setReminderDraft(source.reminders);
    setNotice(null);
  };

  const visibleSettingsItems = useMemo(() => {
    return settingsItems.filter(item => {
      if (item.id === "users") return usersPermission.view;
      if (item.id === "activity") return auditPermission.view;
      if (item.id === "business") return businessPermission.view;
      return settingsPermission.view;
    });
  }, [auditPermission.view, businessPermission.view, settingsPermission.view, usersPermission.view]);

  useEffect(() => {
    if (!visibleSettingsItems.some(item => item.id === view)) {
      setView(visibleSettingsItems[0]?.id ?? "invoice");
    }
  }, [view, visibleSettingsItems]);

  const runSave = async (key: SavingKey, label: string, action: () => Promise<unknown>) => {
    if (!canWriteSettings) {
      setNotice({ kind: "error", text: "Your role can view settings but cannot save tenant changes." });
      return;
    }
    setSaving(key);
    setNotice(null);
    try {
      await action();
      await onWorkspaceRefresh();
      setNotice({ kind: "success", text: `${label} saved to Postgres for this tenant.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : `${label} could not be saved`
      });
    } finally {
      setSaving(null);
    }
  };

  const saveAccount = () => runSave("account", "Account settings", () => updateAccountSettings(accountDraft));
  const saveBusiness = () => runSave("business", "Business settings", () => updateBusinessSettings(businessDraft));
  const saveInvoice = () => runSave("invoice", "Invoice settings", () => updateInvoiceSettings(invoiceDraft));
  const saveReminders = () => runSave("reminders", "Reminder settings", () => updateReminderSettings(reminderDraft));
  const recordNotificationCursor = useCallback((data: NotificationCenterData) => {
    notificationCursorRef.current = latestNotificationTimestamp(data) || data.serverTime || new Date().toISOString();
  }, []);

  const refreshReminderQueue = useCallback(async () => {
    setIsReminderLoading(true);
    try {
      const data = await getPendingNotifications();
      setReminderQueue(data);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Reminder queue could not be loaded"
      });
    } finally {
      setIsReminderLoading(false);
    }
  }, []);

  const refreshNotificationCenter = useCallback(async (status = notificationStatus) => {
    setIsNotificationLoading(true);
    try {
      const data = await getBusinessNotifications(status);
      setNotificationCenter(data);
      recordNotificationCursor(data);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Notification inbox could not be loaded"
      });
    } finally {
      setIsNotificationLoading(false);
    }
  }, [notificationStatus, recordNotificationCursor]);

  const syncNotificationCenter = useCallback(async () => {
    setIsNotificationLoading(true);
    try {
      const data = await syncBusinessNotifications();
      const nextCenter = { notifications: data.notifications, counts: data.counts, serverTime: data.serverTime };
      setNotificationCenter(nextCenter);
      recordNotificationCursor(nextCenter);
      setReminderQueue(data.pending);
      setNotice({ kind: "success", text: `${data.counts.unread} unread notifications synced from live tenant data.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Notifications could not be synced"
      });
    } finally {
      setIsNotificationLoading(false);
    }
  }, [recordNotificationCursor]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    try {
      const data = await markBusinessNotificationRead(notificationId);
      setNotificationCenter(previous => ({
        notifications: previous.notifications.map(notification =>
          notification.id === notificationId ? data.notification : notification
        ),
        counts: data.counts
      }));
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Notification could not be marked as read"
      });
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setIsNotificationLoading(true);
    try {
      const data = await markAllBusinessNotificationsRead();
      setNotificationCenter(data);
      recordNotificationCursor(data);
      setNotice({ kind: "success", text: "All notifications marked as read." });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Notifications could not be marked as read"
      });
    } finally {
      setIsNotificationLoading(false);
    }
  }, [recordNotificationCursor]);

  const refreshCAReportSharing = useCallback(async () => {
    setIsCALoading(true);
    try {
      const data = await getCAReportSharing();
      setCAReportSharing(data);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "CA report sharing could not be loaded"
      });
    } finally {
      setIsCALoading(false);
    }
  }, []);

  const prepareCAReportBundle = useCallback(async () => {
    if (!canWriteSettings) {
      setNotice({ kind: "error", text: "Your role can view CA reports but cannot prepare access." });
      return;
    }
    setIsCAPreparing(true);
    setNotice(null);
    try {
      const result = await shareCAReports({
        caName: businessDraft.caName,
        caEmail: businessDraft.caEmail,
        caMobile: businessDraft.caMobile,
        dateRange: "This Month",
        reportIds: caReportSharing.bundleReports.map(report => report.reportId)
      });
      setCAReportSharing(result.data);
      await onWorkspaceRefresh();
      setNotice({ kind: "success", text: result.message || `${result.shares.length} CA report links prepared.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "CA report links could not be prepared"
      });
    } finally {
      setIsCAPreparing(false);
    }
  }, [
    businessDraft.caEmail,
    businessDraft.caMobile,
    businessDraft.caName,
    caReportSharing.bundleReports,
    canWriteSettings,
    onWorkspaceRefresh
  ]);

  const revokeCAAccess = useCallback(async () => {
    if (!canWriteSettings) {
      setNotice({ kind: "error", text: "Your role can view CA reports but cannot revoke access." });
      return;
    }
    setIsCAPreparing(true);
    setNotice(null);
    try {
      const result = await revokeCAReportSharing({
        recipient: businessDraft.caEmail || businessDraft.caMobile || caReportSharing.summary.lastRecipient
      });
      setCAReportSharing(result.data);
      await onWorkspaceRefresh();
      setNotice({ kind: "success", text: result.message || `${result.revokedCount} CA report links revoked.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "CA report access could not be revoked"
      });
    } finally {
      setIsCAPreparing(false);
    }
  }, [
    businessDraft.caEmail,
    businessDraft.caMobile,
    caReportSharing.summary.lastRecipient,
    canWriteSettings,
    onWorkspaceRefresh
  ]);

  const dispatchReminders = async () => {
    if (!canWriteSettings) {
      setNotice({ kind: "error", text: "Your role can view reminders but cannot dispatch them." });
      return;
    }
    setIsDispatchingReminders(true);
    setNotice(null);
    try {
      const result = await dispatchDueReminders();
      await refreshReminderQueue();
      await refreshNotificationCenter();
      await onWorkspaceRefresh();
      setNotice({
        kind: result.data.failedCount ? "error" : "success",
        text: `${result.data.sentCount} sent, ${result.data.failedCount} failed via ${result.data.provider || "provider"}.`
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Due reminders could not be dispatched"
      });
    } finally {
      setIsDispatchingReminders(false);
    }
  };

  const refreshActivity = useCallback(async () => {
    setIsActivityLoading(true);
    try {
      const data = await getActivityFeed();
      setActivityRows(data.activities ?? []);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Activity feed could not be loaded"
      });
    } finally {
      setIsActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "activity") {
      void refreshActivity();
    }
  }, [refreshActivity, view]);

  useEffect(() => {
    if (view === "ca-reports") {
      void refreshCAReportSharing();
    }
  }, [refreshCAReportSharing, view]);

  useEffect(() => {
    if (view === "reminders") {
      void refreshReminderQueue();
      void refreshNotificationCenter();
    }
  }, [refreshNotificationCenter, refreshReminderQueue, view]);

  useEffect(() => {
    if (view !== "reminders") return;
    let cancelled = false;
    let retryTimer: number | undefined;
    let activeController: AbortController | null = null;

    const sleepBeforeRetry = () => new Promise<void>(resolve => {
      retryTimer = window.setTimeout(resolve, 5000);
    });

    const waitForUpdates = async () => {
      setNotificationLiveStatus("connecting");
      while (!cancelled) {
        activeController = new AbortController();
        try {
          setNotificationLiveStatus(previous => previous === "offline" ? "connecting" : "live");
          const data = await waitForBusinessNotificationUpdates({
            since: notificationCursorRef.current,
            status: notificationStatus,
            timeoutSeconds: 20,
            signal: activeController.signal
          });
          activeController = null;
          if (cancelled) return;

          if (data.hasUpdates) {
            const nextCenter = { notifications: data.notifications, counts: data.counts, serverTime: data.serverTime };
            setNotificationLiveStatus("updating");
            setNotificationCenter(nextCenter);
            recordNotificationCursor(nextCenter);
            if (data.pending) setReminderQueue(data.pending);
            window.setTimeout(() => {
              if (!cancelled) setNotificationLiveStatus("live");
            }, 650);
          } else {
            setNotificationLiveStatus("live");
          }
        } catch (error) {
          activeController = null;
          if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
          setNotificationLiveStatus("offline");
          await sleepBeforeRetry();
        }
      }
    };

    void waitForUpdates();

    return () => {
      cancelled = true;
      activeController?.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [notificationStatus, recordNotificationCursor, view]);

  if (!settingsPermission.view) {
    return (
      <div className="settings-tool-shell settings-module-shell">
        <main className="settings-tool-main settings-module-main permission-denied-state settings-permission-denied">
          <LockKeyhole size={34} />
          <strong>Settings are not available for this role</strong>
          <span>Backend permissions do not allow this module to be viewed by the signed-in user.</span>
          <button className="mbb-primary-btn" onClick={onBack} type="button">
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="settings-tool-shell settings-module-shell">
      <aside className="settings-tool-sidebar">
        <div className="settings-business-card">
          <div className="sidebar-brand-logo">{initialsFor(businessDraft.name)}</div>
          <div>
            <strong>{businessDraft.name || "New Business"}</strong>
            <span>{businessDraft.phone || "Mobile not set"}</span>
          </div>
        </div>
        <button className="settings-back-btn" onClick={onBack} type="button">
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>
        <nav className="settings-tool-nav">
          {visibleSettingsItems.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
              type="button"
            >
              <Icon size={15} />
              {label}
              {badge && <b>{badge}</b>}
            </button>
          ))}
          <button onClick={onLogout} type="button">Logout</button>
        </nav>
        <div className="settings-tool-footer">
          <span>Tenant: {business.id || "new"}</span>
          <span><Shield size={13} /> 100% Secure</span>
          <span>Postgres backed</span>
          <strong>VastraBook</strong>
        </div>
      </aside>

      <main className="settings-tool-main settings-module-main">
        {notice && (
          <div className={`settings-save-notice ${notice.kind}`}>
            {notice.text}
          </div>
        )}
        {!canWriteSettings && (
          <div className="permission-readonly-banner settings-readonly-banner">
            <LockKeyhole size={16} />
            <span>You can view settings, but your role cannot create or manage tenant settings.</span>
          </div>
        )}
        <fieldset className="settings-permission-fieldset" disabled={!canWriteSettings}>
          {view === "account" && (
            <AccountSettings
              account={accountDraft}
              onChange={setAccountDraft}
              onReset={resetDrafts}
              onSave={saveAccount}
              isSaving={saving === "account"}
            />
          )}
          {view === "business" && (
            <BusinessSettings
              business={businessDraft}
              providerStatus={providerStatus}
              onChange={setBusinessDraft}
              onReset={resetDrafts}
              onSave={saveBusiness}
              isSaving={saving === "business"}
            />
          )}
          {view === "invoice" && (
            <InvoiceSettingsView
              business={businessDraft}
              invoice={invoiceDraft}
              items={items}
              invoices={invoices}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              onChange={setInvoiceDraft}
              onSave={saveInvoice}
              isSaving={saving === "invoice"}
            />
          )}
          {view === "print" && (
            <PrintSettings
              business={businessDraft}
              invoice={invoiceDraft}
              onBusinessChange={setBusinessDraft}
              onInvoiceChange={setInvoiceDraft}
              onSave={() => runSave("business", "Print settings", async () => {
                await updateBusinessSettings(businessDraft);
                await updateInvoiceSettings(invoiceDraft);
              })}
              isSaving={saving === "business"}
            />
          )}
          {view === "users" && (
            <ManageUsersSettings
              users={users}
              canCreateUsers={canCreateUsers}
              canManageCaAccess={canManageCaAccess}
              onAddUser={() => onNavigate("manage-users")}
              onAddCa={() => setView("ca-reports")}
            />
          )}
          {view === "activity" && (
            <ActivityLogSettings
              activities={activityRows}
              isLoading={isActivityLoading}
              onRefresh={() => void refreshActivity()}
            />
          )}
          {view === "reminders" && (
            <ReminderSettings
              reminders={reminderDraft}
              onChange={setReminderDraft}
              onSave={saveReminders}
              queue={reminderQueue}
              notificationCenter={notificationCenter}
              notificationStatus={notificationStatus}
              isLoadingQueue={isReminderLoading}
              isLoadingNotifications={isNotificationLoading}
              notificationLiveStatus={notificationLiveStatus}
              isDispatching={isDispatchingReminders}
              onRefreshQueue={refreshReminderQueue}
              onRefreshNotifications={() => void refreshNotificationCenter()}
              onSyncNotifications={() => void syncNotificationCenter()}
              onNotificationStatusChange={setNotificationStatus}
              onMarkNotificationRead={markNotificationRead}
              onMarkAllNotificationsRead={markAllNotificationsRead}
              onDispatchDue={dispatchReminders}
              isSaving={saving === "reminders"}
            />
          )}
          {view === "ca-reports" && (
            <CaReportsSettings
              business={businessDraft}
              sharing={caReportSharing}
              onChange={setBusinessDraft}
              onSave={saveBusiness}
              onRefresh={refreshCAReportSharing}
              onPrepareBundle={prepareCAReportBundle}
              onRevokeAccess={revokeCAAccess}
              isSaving={saving === "business"}
              isLoading={isCALoading}
              isPreparing={isCAPreparing}
            />
          )}
          {view === "pricing" && <PricingSettings business={businessDraft} />}
          {view === "refer" && <ReferEarnSettings business={businessDraft} />}
          {view === "help" && <HelpSupportSettings business={businessDraft} />}
        </fieldset>
      </main>
    </div>
  );
}

function SettingsHeader({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="settings-module-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="settings-header-actions">
        {children}
      </div>
    </div>
  );
}

function AccountSettings({
  account,
  onChange,
  onReset,
  onSave,
  isSaving
}: {
  account: SettingsData["account"];
  onChange: (account: SettingsData["account"]) => void;
  onReset: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <>
      <SettingsHeader title="Account Settings" subtitle="Manage the active tenant user profile">
        <button className="settings-icon-btn" aria-label="Keyboard shortcuts" type="button">
          <Keyboard size={16} />
        </button>
        <button className="settings-chat-btn" type="button">
          <MessageCircle size={15} />
          Chat Support
        </button>
        <button className="settings-light-btn" onClick={onReset} type="button">Cancel</button>
        <button className="settings-save-btn active" onClick={onSave} disabled={isSaving} type="button">
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </SettingsHeader>

      <div className="settings-suggestion-banner">
        <strong>Help us make this billing workspace better</strong>
        <button type="button">
          <Share2 size={15} />
          Share Suggestion
        </button>
      </div>

      <section className="settings-form-section">
        <h2>General Information</h2>
        <div className="settings-form-grid three">
          <label>
            <span>First Name *</span>
            <input value={account.firstName} onChange={(event) => onChange({ ...account, firstName: event.target.value })} />
          </label>
          <label>
            <span>Last Name</span>
            <input value={account.lastName} onChange={(event) => onChange({ ...account, lastName: event.target.value })} />
          </label>
          <label>
            <span>Mobile Number</span>
            <input value={account.mobile} onChange={(event) => onChange({ ...account, mobile: event.target.value })} />
          </label>
          <label>
            <span>Email</span>
            <input value={account.email} onChange={(event) => onChange({ ...account, email: event.target.value })} />
          </label>
          <label>
            <span>Role</span>
            <input value={roleLabel(account.role)} readOnly />
          </label>
        </div>
      </section>

      <section className="settings-form-section">
        <h2>Subscription Plan</h2>
        <div className="settings-plan-card">
          <div>
            <span className="settings-crown">P</span>
            <strong>Profile linked to active tenant</strong>
          </div>
          <div>
            <span>User ID</span>
            <strong>{account.id || "Not synced"}</strong>
          </div>
          <button type="button">View Tenant</button>
        </div>
      </section>
    </>
  );
}

const providerStatusRows = (providerStatus: Partial<Record<string, ProviderStatus>>) => {
  const labels: Array<[string, string]> = [
    ["eInvoice", "E-Invoicing"],
    ["sms", "SMS OTP"],
    ["email", "Email"],
    ["paymentGateway", "Payment Gateway"],
    ["shipping", "Shipping"],
    ["whatsapp", "WhatsApp"]
  ];

  return labels.map(([key, label]) => {
    const status = providerStatus[key] ?? {
      provider: "disabled",
      mode: "disabled",
      configured: false,
      missing: []
    };
    const missing = status.missing ?? [];
    const isReady = status.configured && status.mode !== "unsupported";
    const statusLabel = isReady ? "Configured" : status.mode === "unsupported" ? "Unsupported" : "Action Required";
    const statusClass = isReady ? "configured" : status.mode === "disabled" ? "disabled" : "attention";
    return {
      key,
      label,
      provider: status.provider || "disabled",
      statusLabel,
      statusClass,
      missing
    };
  });
};

function BusinessSettings({
  business,
  providerStatus,
  onChange,
  onReset,
  onSave,
  isSaving
}: {
  business: SettingsData["businessProfile"];
  providerStatus: Partial<Record<string, ProviderStatus>>;
  onChange: (business: SettingsData["businessProfile"]) => void;
  onReset: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const bank = business.bankAccountDetails as Record<string, string>;
  const providerRows = providerStatusRows(providerStatus);
  const setBankField = (key: string, value: string) => {
    onChange({
      ...business,
      bankAccountDetails: {
        ...business.bankAccountDetails,
        [key]: value
      }
    });
  };

  return (
    <>
      <SettingsHeader title="Manage Business" subtitle="Update GST, address, branch and payment details">
        <button className="settings-light-btn" onClick={onReset} type="button">Cancel</button>
        <button className="settings-save-btn active" onClick={onSave} disabled={isSaving} type="button">
          <Save size={14} />
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </SettingsHeader>

      <div className="settings-two-column">
        <section className="settings-form-section">
          <h2>Business Details</h2>
          <div className="settings-form-grid two">
            <label>
              <span>Business Name *</span>
              <input value={business.name} onChange={(event) => onChange({ ...business, name: event.target.value })} />
            </label>
            <label>
              <span>GSTIN</span>
              <input value={business.gstin} onChange={(event) => onChange({ ...business, gstin: event.target.value })} />
            </label>
            <label>
              <span>Business Category</span>
              <input value={business.category} onChange={(event) => onChange({ ...business, category: event.target.value })} />
            </label>
            <label>
              <span>Phone</span>
              <input value={business.phone} onChange={(event) => onChange({ ...business, phone: event.target.value })} />
            </label>
            <label>
              <span>Email</span>
              <input value={business.email} onChange={(event) => onChange({ ...business, email: event.target.value })} />
            </label>
            <label>
              <span>State</span>
              <input value={business.state} onChange={(event) => onChange({ ...business, state: event.target.value })} />
            </label>
            <label>
              <span>City</span>
              <input value={business.city} onChange={(event) => onChange({ ...business, city: event.target.value })} />
            </label>
            <label>
              <span>Pincode</span>
              <input value={business.pincode} onChange={(event) => onChange({ ...business, pincode: event.target.value })} />
            </label>
          </div>
          <label className="settings-wide-label">
            <span>Business Address</span>
            <textarea value={business.address} onChange={(event) => onChange({ ...business, address: event.target.value })} />
          </label>
        </section>

        <section className="settings-form-section">
          <h2>Business Profile</h2>
          <div className="settings-profile-card">
            <div className="sidebar-brand-logo">{initialsFor(business.name)}</div>
            <div>
              <strong>{business.name || "New Business"}</strong>
              <span>{business.category || "Business category not set"}</span>
              <small>Show in Online Store: {business.showInOnlineStore ? "Yes" : "No"}</small>
            </div>
          </div>
          <div className="settings-check-list">
            <SettingsCheckbox label="Enable GST billing" checked={business.enableGstBilling} onChange={(checked) => onChange({ ...business, enableGstBilling: checked })} />
            <SettingsCheckbox label="Show business logo on invoice" checked={business.showLogoOnInvoice} onChange={(checked) => onChange({ ...business, showLogoOnInvoice: checked })} />
            <SettingsCheckbox label="Allow branch wise billing" checked={business.branchBilling} onChange={(checked) => onChange({ ...business, branchBilling: checked })} />
            <SettingsCheckbox label="Add QR/UPI payment details" checked={business.showUpiOnInvoice} onChange={(checked) => onChange({ ...business, showUpiOnInvoice: checked })} />
            <SettingsCheckbox label="Show in online store" checked={business.showInOnlineStore} onChange={(checked) => onChange({ ...business, showInOnlineStore: checked })} />
          </div>
        </section>
      </div>

      <section className="settings-form-section">
        <h2>Bank & Payment Details</h2>
        <div className="settings-form-grid three">
          <label><span>Account Holder</span><input value={bank.holder || ""} onChange={(event) => setBankField("holder", event.target.value)} /></label>
          <label><span>Bank Name</span><input value={bank.bank || ""} onChange={(event) => setBankField("bank", event.target.value)} /></label>
          <label><span>Account Number</span><input value={bank.account_no || ""} onChange={(event) => setBankField("account_no", event.target.value)} /></label>
          <label><span>IFSC</span><input value={bank.ifsc || ""} onChange={(event) => setBankField("ifsc", event.target.value)} /></label>
          <label><span>Branch</span><input value={bank.branch || ""} onChange={(event) => setBankField("branch", event.target.value)} /></label>
          <label><span>UPI ID</span><input value={business.upiId} onChange={(event) => onChange({ ...business, upiId: event.target.value })} /></label>
        </div>
      </section>

      <section className="settings-form-section">
        <h2>Production Integrations</h2>
        <div className="settings-provider-grid">
          {providerRows.map(row => (
            <div className={`settings-provider-card ${row.statusClass}`} key={row.key}>
              <div>
                <strong>{row.label}</strong>
                <span>{row.provider}</span>
              </div>
              <b>{row.statusLabel}</b>
              {row.missing.length > 0 && <small>Missing: {row.missing.join(", ")}</small>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function InvoiceSettingsView({
  business,
  invoice,
  items,
  invoices,
  themeMode,
  setThemeMode,
  onChange,
  onSave,
  isSaving
}: {
  business: SettingsData["businessProfile"];
  invoice: SettingsData["invoice"];
  items: Item[];
  invoices: SalesInvoice[];
  themeMode: "a4" | "thermal";
  setThemeMode: (mode: "a4" | "thermal") => void;
  onChange: (invoice: SettingsData["invoice"]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const colors = ["#000000", "#3f7d00", "#0f719f", "#9014b8", "#c80f0f", "#5752a6", "#daa026", "#c96b00"];
  const themes = [
    ["advanced_gst", "Advanced GST (Tally)"],
    ["luxury", "Luxury"],
    ["stylish", "Stylish"]
  ];

  return (
    <>
      <SettingsHeader title="Invoice Settings">
        <button className="settings-save-btn active" onClick={onSave} disabled={isSaving} type="button">
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </SettingsHeader>

      <div className="settings-invoice-workspace">
        <div className="settings-invoice-scroll">
          <InvoicePreview business={business} invoice={invoice} items={items} invoices={invoices} themeMode={themeMode} />
        </div>

        <aside className="invoice-settings-panel">
          <section>
            <h2><span className="settings-radio selected" /> Themes</h2>
            <div className="settings-warning-box">
              Invoice theme, color and visible columns are saved per tenant and used in print/PDF screens.
            </div>
            <div className="theme-thumb-row">
              {themes.map(([value, label], index) => (
                <button className={invoice.theme === value ? "active" : ""} key={value} onClick={() => onChange({ ...invoice, theme: value })} type="button">
                  <span className={`theme-thumb thumb-${index + 1}`} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="theme-styling-section">
            <h2>Theme Styling <b>New</b></h2>
            <div className="theme-style-pills">
              {["Uttar Pradesh", "Maharashtra", "Electronics", "Gujarat"].map(item => (
                <button
                  className={invoice.themeStyle === item ? "active" : ""}
                  key={item}
                  onClick={() => onChange({ ...invoice, themeStyle: item })}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2><span className="settings-radio" /> Custom Theme <CircleHelp size={14} /></h2>
            <div className="custom-theme-row">
              <SettingsIcon size={19} />
              <span>{invoice.themeStyle || "Your Custom Theme"}</span>
              <button type="button" onClick={() => onChange({ ...invoice, theme: "custom" })}>Use Custom</button>
            </div>
          </section>

          <section>
            <h2>Select Color</h2>
            <div className="settings-color-row">
              {colors.map(color => (
                <button
                  key={color}
                  className={invoice.themeColor === color ? "selected" : ""}
                  style={{ background: color }}
                  onClick={() => onChange({ ...invoice, themeColor: color })}
                  aria-label={`Select ${color}`}
                  type="button"
                >
                  {invoice.themeColor === color && <Check size={17} />}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>Theme Settings <b>New</b></h2>
            <SettingsCheckbox label="Show party balance in invoice" checked={invoice.showPartyBalance} onChange={(checked) => onChange({ ...invoice, showPartyBalance: checked })} />
            <SettingsCheckbox label="Enable free item quantity" checked={invoice.showFreeQty} onChange={(checked) => onChange({ ...invoice, showFreeQty: checked })} />
            <SettingsCheckbox label="Show item description in invoice" checked={invoice.showItemDescription} onChange={(checked) => onChange({ ...invoice, showItemDescription: checked })} />
            <SettingsCheckbox label="Show HSN / SAC column" checked={invoice.showHsn} onChange={(checked) => onChange({ ...invoice, showHsn: checked })} />
            <SettingsCheckbox label="Show MRP column" checked={invoice.showMrp} onChange={(checked) => onChange({ ...invoice, showMrp: checked })} />
            <SettingsCheckbox label="Show saree COLOR column" checked={invoice.showColor} onChange={(checked) => onChange({ ...invoice, showColor: checked })} />
            <SettingsCheckbox label="Show CIN / DATE column" checked={invoice.showCinDate} onChange={(checked) => onChange({ ...invoice, showCinDate: checked })} />
            <SettingsCheckbox label="Show GRN / DATE column" checked={invoice.showGrnDate} onChange={(checked) => onChange({ ...invoice, showGrnDate: checked })} />
          </section>

          <section>
            <h2>Print Layout</h2>
            <div className="settings-segmented">
              <button className={themeMode === "a4" ? "active" : ""} onClick={() => setThemeMode("a4")} type="button">A4</button>
              <button className={themeMode === "thermal" ? "active" : ""} onClick={() => setThemeMode("thermal")} type="button">Thermal</button>
            </div>
          </section>

          <section>
            <h2>Invoice Numbering</h2>
            <div className="settings-form-grid">
              <label>
                <span>Invoice Prefix</span>
                <input
                  value={invoice.invoicePrefix}
                  onChange={(event) => onChange({ ...invoice, invoicePrefix: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) })}
                  placeholder="INV"
                />
              </label>
            </div>
            <SettingsCheckbox
              label="Reset invoice sequence every financial year"
              checked={invoice.resetEachYear}
              onChange={(checked) => onChange({ ...invoice, resetEachYear: checked })}
            />
          </section>
        </aside>
      </div>
    </>
  );
}

function InvoicePreview({
  business,
  invoice,
  items,
  invoices,
  themeMode
}: {
  business: SettingsData["businessProfile"];
  invoice: SettingsData["invoice"];
  items: Item[];
  invoices: SalesInvoice[];
  themeMode: "a4" | "thermal";
}) {
  const latestInvoice = invoices[0];
  const previewRows = latestInvoice?.items?.length
    ? latestInvoice.items.slice(0, 3).map(line => ({
        name: line.item.name,
        hsn: line.item.hsn,
        color: line.item.color || "-",
        qty: `${line.quantity} PCS`,
        mrp: line.item.mrp || line.rate,
        rate: line.rate,
        discount: line.discountPct ? `${line.discountPct}%` : "-",
        amount: line.quantity * line.rate,
        description: line.item.description || ""
      }))
    : items.slice(0, 3).map(item => ({
        name: item.name,
        hsn: item.hsn,
        color: item.color || "-",
        qty: `${Math.max(0, item.stock)} PCS`,
        mrp: item.mrp || item.price,
        rate: item.price,
        discount: "-",
        amount: item.price,
        description: item.description || ""
      }));
  const total = latestInvoice ? latestInvoice.total : previewRows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className={`invoice-preview-page ${themeMode === "thermal" ? "thermal" : ""}`}>
      <div className="invoice-preview-header">
        <strong>TAX INVOICE</strong>
        <span>ORIGINAL FOR RECIPIENT</span>
        <b>{business.name || "Business invoice preview"}</b>
      </div>
      <div className="invoice-preview-box">
        <div className="invoice-brand-cell">
          <div className="sidebar-brand-logo">{initialsFor(business.name)}</div>
          <div>
            <h3 style={{ color: invoice.themeColor }}>{business.name || "New Business"}</h3>
            <p>{[business.address, business.city, business.state, business.pincode].filter(Boolean).join(", ") || "Business address not set"}</p>
            <p>GSTIN: {business.gstin || "Not registered"}</p>
          </div>
        </div>
        <div className="invoice-meta-grid">
          <span>Invoice No.<b>{latestInvoice?.invoiceNumber || `${invoice.invoicePrefix}/NEXT`}</b></span>
          <span>Invoice Date<b>{latestInvoice?.date || "Next invoice date"}</b></span>
          <span>Due Date<b>-</b></span>
          {invoice.showCinDate && <span>CIN / DATE<b>-</b></span>}
          {invoice.showGrnDate && <span>GRN / DATE<b>-</b></span>}
          <span>TRANSPORT<b>-</b></span>
        </div>
      </div>
      <div className="invoice-preview-box small">
        <div>
          <strong>BILL TO</strong>
          <b>{latestInvoice?.party.name || "No invoice party yet"}</b>
          <p>{latestInvoice?.party.mobile || "Create a sales invoice to preview customer details."}</p>
        </div>
        <div>
          <span>{business.phone ? `Phone: ${business.phone}` : "Business phone not set"}</span>
        </div>
      </div>
      <table className="invoice-preview-table">
        <thead>
          <tr>
            <th>S.NO.</th>
            <th>ITEMS</th>
            {invoice.showHsn && <th>HSN</th>}
            {invoice.showColor && <th>COLOR</th>}
            {invoice.showCinDate && <th>CIN / DATE</th>}
            {invoice.showGrnDate && <th>GRN / DATE</th>}
            <th>QTY.</th>
            {invoice.showMrp && <th>MRP</th>}
            <th>RATE</th>
            {invoice.showDiscount && <th>DISC.</th>}
            <th>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {previewRows.length === 0 && (
            <tr>
              <td colSpan={11}>No item data in this tenant yet.</td>
            </tr>
          )}
          {previewRows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td>{index + 1}</td>
              <td>
                {row.name}
                {invoice.showItemDescription && row.description && <small>{row.description}</small>}
              </td>
              {invoice.showHsn && <td>{row.hsn || "-"}</td>}
              {invoice.showColor && <td>{row.color}</td>}
              {invoice.showCinDate && <td>-</td>}
              {invoice.showGrnDate && <td>-</td>}
              <td>{row.qty}</td>
              {invoice.showMrp && <td>{formatMoney(row.mrp)}</td>}
              <td>{formatMoney(row.rate)}</td>
              {invoice.showDiscount && <td>{row.discount}</td>}
              <td>{formatMoney(row.amount)}</td>
            </tr>
          ))}
          <tr className="invoice-total-row">
            <td colSpan={10}>TOTAL</td>
            <td>{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
      {invoice.showPartyBalance && latestInvoice && (
        <p className="invoice-preview-terms">
          Party balance: {formatMoney(latestInvoice.party.balance || 0)}
        </p>
      )}
    </div>
  );
}

function SettingsCheckbox({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-checkbox-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function PrintSettings({
  business,
  invoice,
  onBusinessChange,
  onInvoiceChange,
  onSave,
  isSaving
}: {
  business: SettingsData["businessProfile"];
  invoice: SettingsData["invoice"];
  onBusinessChange: (business: SettingsData["businessProfile"]) => void;
  onInvoiceChange: (invoice: SettingsData["invoice"]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const cards = [
    ["A4 Invoice Printing", `${invoice.paperSize} invoice layout with ${invoice.theme.replace("_", " ")} theme.`, invoice.paperSize],
    ["Thermal Settings", `${invoice.thermalPaperSize} receipt using ${invoice.thermalTheme} theme.`, invoice.thermalPaperSize],
    ["Barcode Printing", business.hideZeroStockBarcodes ? "Zero stock barcode labels are hidden." : "All active item barcode labels are printable.", business.hideZeroStockBarcodes ? "Filtered" : "Ready"],
    ["Auto Print After Sale", business.autoPrintAfterSale ? "Print dialog opens after sale save." : "Manual print after sale save.", business.autoPrintAfterSale ? "Enabled" : "Disabled"]
  ];

  return (
    <>
      <SettingsHeader title="Print Settings" subtitle="Configure printer format, barcode and invoice paper preferences">
        <button className="settings-save-btn active" onClick={onSave} disabled={isSaving} type="button">
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </SettingsHeader>
      <div className="settings-card-grid">
        {cards.map(([title, text, status]) => (
          <section className="settings-feature-card" key={title}>
            <Printer size={22} />
            <strong>{title}</strong>
            <span>{text}</span>
            <b>{status}</b>
          </section>
        ))}
      </div>
      <section className="settings-form-section">
        <h2>Default Print Preferences</h2>
        <div className="settings-form-grid three">
          <label>
            <span>A4 Paper Size</span>
            <select value={invoice.paperSize} onChange={(event) => onInvoiceChange({ ...invoice, paperSize: event.target.value })}>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
          </label>
          <label>
            <span>Thermal Paper Size</span>
            <select value={invoice.thermalPaperSize} onChange={(event) => onInvoiceChange({ ...invoice, thermalPaperSize: event.target.value })}>
              <option value="2inch">2 inch</option>
              <option value="3inch">3 inch</option>
            </select>
          </label>
          <label>
            <span>Thermal Theme</span>
            <select value={invoice.thermalTheme} onChange={(event) => onInvoiceChange({ ...invoice, thermalTheme: event.target.value })}>
              <option value="compact">Compact</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
        </div>
        <div className="settings-check-list two">
          <SettingsCheckbox label="Show print preview before saving invoice" checked={business.printPreview} onChange={(checked) => onBusinessChange({ ...business, printPreview: checked })} />
          <SettingsCheckbox label="Include logo and business details" checked={business.showLogoOnInvoice} onChange={(checked) => onBusinessChange({ ...business, showLogoOnInvoice: checked })} />
          <SettingsCheckbox label="Hide zero stock items in barcode print" checked={business.hideZeroStockBarcodes} onChange={(checked) => onBusinessChange({ ...business, hideZeroStockBarcodes: checked })} />
          <SettingsCheckbox label="Print original and duplicate copies" checked={business.printOriginalDuplicate} onChange={(checked) => onBusinessChange({ ...business, printOriginalDuplicate: checked })} />
          <SettingsCheckbox label="Auto print after sale" checked={business.autoPrintAfterSale} onChange={(checked) => onBusinessChange({ ...business, autoPrintAfterSale: checked })} />
        </div>
      </section>
    </>
  );
}

function ManageUsersSettings({
  users,
  canCreateUsers,
  canManageCaAccess,
  onAddUser,
  onAddCa
}: {
  users: SettingsProps["users"];
  canCreateUsers: boolean;
  canManageCaAccess: boolean;
  onAddUser: () => void;
  onAddCa: () => void;
}) {
  const activeUsers = users.filter(user => user.isActive);

  return (
    <>
      <SettingsHeader title="Manage Users">
        <button aria-label="Help" className="settings-icon-btn" type="button"><HelpCircle size={18} /></button>
      </SettingsHeader>
      <div className="manage-users-stat-grid">
        <div className="business-stat-card active">
          <span><Users size={16} /> Active Users</span>
          <strong>{activeUsers.length}</strong>
        </div>
        <div className="business-stat-card">
          <span>Total Tenant Users</span>
          <strong>{users.length}</strong>
          <small>From Postgres</small>
        </div>
      </div>
      <div className="manage-users-toolbar">
        <button className="sales-square-btn" aria-label="Search" type="button"><Search size={18} /></button>
        <div />
        <button className="mbb-bulk-btn" onClick={onAddCa} disabled={!canManageCaAccess} type="button">Add Your CA</button>
        <button className="mbb-primary-btn" onClick={onAddUser} disabled={!canCreateUsers} type="button">Add New User</button>
      </div>
      {(!canCreateUsers || !canManageCaAccess) && (
        <div className="permission-readonly-banner settings-inline-permission">
          <LockKeyhole size={16} />
          <span>You can view tenant users, but your role cannot add users or manage CA access.</span>
        </div>
      )}
      <div className="manage-users-table-wrap">
        <table className="mbb-items-table business-table">
          <thead>
            <tr>
              <th>User Name</th>
              <th>Mobile Number</th>
              <th>Role Type</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.mobile}</td>
                <td>{roleLabel(user.role)}</td>
                <td>{user.isActive ? <span>Active</span> : <span className="deleted-pill">Deleted</span>}</td>
                <td />
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5}>No users added for this tenant yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatActivityDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (!entries.length) return "-";
  return entries
    .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1")}: ${String(value)}`)
    .join(" | ");
}

function ActivityLogSettings({
  activities,
  isLoading,
  onRefresh
}: {
  activities: ActivityFeedItem[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <SettingsHeader title="Activity Log" subtitle="Recent tenant actions, voucher lifecycle changes and stock updates">
        <button className="settings-save-btn active" onClick={onRefresh} disabled={isLoading} type="button">
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </SettingsHeader>
      <section className="settings-form-section">
        <h2>Recent Actions</h2>
        <table className="settings-simple-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Module</th>
              <th>User</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {activities.map(activity => (
              <tr key={activity.id}>
                <td>{activity.date || "-"}</td>
                <td>{activity.action}</td>
                <td>{activity.module.replace(/_/g, " ")}</td>
                <td>{activity.actor || "System"}</td>
                <td>{formatActivityDetails(activity.details)}</td>
              </tr>
            ))}
            {!activities.length && (
              <tr>
                <td colSpan={5}>{isLoading ? "Loading activity feed..." : "No audit activity recorded for this tenant yet."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function ReminderSettings({
  reminders,
  onChange,
  onSave,
  queue,
  notificationCenter,
  notificationStatus,
  isLoadingQueue,
  isLoadingNotifications,
  notificationLiveStatus,
  isDispatching,
  onRefreshQueue,
  onRefreshNotifications,
  onSyncNotifications,
  onNotificationStatusChange,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDispatchDue,
  isSaving
}: {
  reminders: SettingsData["reminders"];
  onChange: (reminders: SettingsData["reminders"]) => void;
  onSave: () => void;
  queue: PendingNotifications;
  notificationCenter: NotificationCenterData;
  notificationStatus: "all" | "unread" | "read" | "dismissed";
  isLoadingQueue: boolean;
  isLoadingNotifications: boolean;
  notificationLiveStatus: "connecting" | "live" | "updating" | "offline";
  isDispatching: boolean;
  onRefreshQueue: () => void | Promise<void>;
  onRefreshNotifications: () => void | Promise<void>;
  onSyncNotifications: () => void | Promise<void>;
  onNotificationStatusChange: (status: "all" | "unread" | "read" | "dismissed") => void;
  onMarkNotificationRead: (notificationId: string) => void | Promise<void>;
  onMarkAllNotificationsRead: () => void | Promise<void>;
  onDispatchDue: () => void | Promise<void>;
  isSaving: boolean;
}) {
  const rows = [
    ["paymentDue", "Payment Due Reminders", "Send reminders for unpaid invoices."],
    ["saleInvoice", "Invoice Sharing Reminder", "Remind staff to share invoices after sale."],
    ["lowStock", "Low Stock Alerts", "Notify when inventory reaches warning level."],
    ["customerOccasions", "Customer Occasion Messages", "Send festival and birthday greeting messages."],
    ["dailySummary", "Daily Business Summary", "Send every day closing summary to admin."]
  ] as const;
  const liveLabels = {
    connecting: "Connecting",
    live: "Live",
    updating: "Updating",
    offline: "Retrying"
  };

  return (
    <>
      <SettingsHeader title="Reminders" subtitle="Manage payment, stock and customer follow-up alerts">
        <button className="settings-save-btn" onClick={onRefreshQueue} disabled={isLoadingQueue} type="button">
          {isLoadingQueue ? "Refreshing..." : "Refresh Queue"}
        </button>
        <button className="settings-purple-btn" onClick={onDispatchDue} disabled={isDispatching || queue.pendingReminders.length === 0} type="button">
          <Send size={15} />
          {isDispatching ? "Dispatching..." : "Dispatch Due"}
        </button>
        <button className="settings-save-btn active" onClick={onSave} disabled={isSaving} type="button">
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </SettingsHeader>
      <section className="settings-form-section">
        <h2>Reminder Preferences</h2>
        <div className="settings-list-panel">
          {rows.map(([key, title, text]) => (
            <div className="settings-toggle-row" key={key}>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
              <button
                className={reminders[key] ? "on" : ""}
                onClick={() => onChange({ ...reminders, [key]: !reminders[key] })}
                type="button"
              >
                <ToggleLeft size={30} />
                {reminders[key] ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="settings-form-section">
        <h2>Reminder Queue</h2>
        <div className="settings-reminder-summary">
          <div>
            <span>Pending Reminders</span>
            <strong>{queue.counts.pendingReminders}</strong>
          </div>
          <div>
            <span>Pending Actions</span>
            <strong>{queue.counts.actions}</strong>
          </div>
        </div>
        <div className="settings-list-panel settings-reminder-queue">
          {queue.pendingReminders.length === 0 ? (
            <div className="settings-empty-row">
              <Check size={17} />
              No pending reminder deliveries.
            </div>
          ) : (
            queue.pendingReminders.slice(0, 8).map(reminder => (
              <div className="settings-reminder-row" key={reminder.id}>
                <div>
                  <strong>{reminder.title}</strong>
                  <span>{reminder.message}</span>
                  {reminder.deliveryMessage && <small>{reminder.deliveryMessage}</small>}
                </div>
                <div>
                  <b>{reminder.channel.toUpperCase()}</b>
                  <span>{reminder.status}</span>
                  <small>{reminder.scheduledAt ? new Date(reminder.scheduledAt).toLocaleString("en-IN") : "Due now"}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="settings-form-section">
        <div className="settings-notification-title">
          <div>
            <h2>Notification Inbox</h2>
            <span>Live tenant alerts from reminders, payments, stock and daily summaries.</span>
            <b className={`settings-live-pill ${notificationLiveStatus}`}>
              <span aria-hidden="true" />
              {liveLabels[notificationLiveStatus]}
            </b>
          </div>
          <div>
            <button className="settings-save-btn" onClick={onRefreshNotifications} disabled={isLoadingNotifications} type="button">
              <RefreshCw size={14} />
              Refresh
            </button>
            <button className="settings-save-btn" onClick={onSyncNotifications} disabled={isLoadingNotifications} type="button">
              <Bell size={14} />
              Sync Live
            </button>
            <button className="settings-purple-btn" onClick={onMarkAllNotificationsRead} disabled={isLoadingNotifications || notificationCenter.counts.unread === 0} type="button">
              <CheckCheck size={15} />
              Mark All Read
            </button>
          </div>
        </div>
        <div className="settings-reminder-summary settings-notification-summary">
          <div>
            <span>Unread</span>
            <strong>{notificationCenter.counts.unread}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{notificationCenter.counts.total}</strong>
          </div>
          <div>
            <span>Read</span>
            <strong>{notificationCenter.counts.read}</strong>
          </div>
        </div>
        <div className="settings-notification-tabs" role="tablist" aria-label="Notification filter">
          {(["all", "unread", "read", "dismissed"] as const).map(status => (
            <button
              key={status}
              className={notificationStatus === status ? "active" : ""}
              onClick={() => onNotificationStatusChange(status)}
              type="button"
            >
              {status}
            </button>
          ))}
        </div>
        <div className="settings-list-panel settings-notification-list">
          {notificationCenter.notifications.length === 0 ? (
            <div className="settings-empty-row">
              <Check size={17} />
              {isLoadingNotifications ? "Loading notifications..." : "No notifications for this filter."}
            </div>
          ) : (
            notificationCenter.notifications.slice(0, 12).map(notification => (
              <div className={`settings-notification-row ${notification.priority} ${notification.status}`} key={notification.id}>
                <div>
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <small>{notification.createdAt ? new Date(notification.createdAt).toLocaleString("en-IN") : "Just now"}</small>
                </div>
                <div>
                  <b>{notification.priority}</b>
                  <span>{notification.status}</span>
                  {notification.status === "unread" && (
                    <button onClick={() => onMarkNotificationRead(notification.id)} type="button">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function CaReportsSettings({
  business,
  sharing,
  onChange,
  onSave,
  onRefresh,
  onPrepareBundle,
  onRevokeAccess,
  isSaving,
  isLoading,
  isPreparing
}: {
  business: SettingsData["businessProfile"];
  sharing: CAReportSharingData;
  onChange: (business: SettingsData["businessProfile"]) => void;
  onSave: () => void;
  onRefresh: () => void | Promise<void>;
  onPrepareBundle: () => void | Promise<void>;
  onRevokeAccess: () => void | Promise<void>;
  isSaving: boolean;
  isLoading: boolean;
  isPreparing: boolean;
}) {
  const recipientReady = Boolean((business.caEmail || business.caMobile).trim());
  const lastShared = sharing.summary.lastSharedAt
    ? new Date(sharing.summary.lastSharedAt).toLocaleString("en-IN")
    : "Not shared yet";

  return (
    <>
      <SettingsHeader title="CA Reports Sharing" subtitle="Give accountant access to reports without sharing billing controls">
        <button className="settings-save-btn" onClick={onRefresh} disabled={isLoading} type="button">
          <RefreshCw size={14} />
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
        <button className="settings-save-btn" onClick={onRevokeAccess} disabled={isPreparing || sharing.summary.activeShares === 0} type="button">
          <LockKeyhole size={14} />
          Revoke Access
        </button>
        <button className="settings-purple-btn" onClick={onPrepareBundle} disabled={isPreparing || !recipientReady} type="button">
          <Share2 size={15} />
          {isPreparing ? "Preparing..." : "Prepare CA Bundle"}
        </button>
        <button className="settings-purple-btn" onClick={onSave} disabled={isSaving} type="button">
          {isSaving ? "Saving..." : "Save Report Access"}
        </button>
      </SettingsHeader>
      <div className="settings-card-grid three">
        <section className="settings-feature-card">
          <BarChart3 size={22} />
          <strong>Sales Reports</strong>
          <span>Invoices, returns, payment-in and GST summary.</span>
          <b>{sharing.summary.activeShares ? "Prepared" : "Not shared"}</b>
        </section>
        <section className="settings-feature-card">
          <FileText size={22} />
          <strong>Purchase Reports</strong>
          <span>Purchase invoice, payment-out and expense entries.</span>
          <b>{sharing.summary.activeShares ? "Prepared" : "Not shared"}</b>
        </section>
        <section className="settings-feature-card">
          <Shield size={22} />
          <strong>Read Only Access</strong>
          <span>CA can view and download, but cannot edit vouchers.</span>
          <b>{business.caReportsEnabled ? "Enabled" : "Disabled"}</b>
        </section>
      </div>
      <div className="settings-reminder-summary settings-ca-summary">
        <div>
          <span>Active Links</span>
          <strong>{sharing.summary.activeShares}</strong>
        </div>
        <div>
          <span>Total Prepared</span>
          <strong>{sharing.summary.totalShares}</strong>
        </div>
        <div>
          <span>Revoked</span>
          <strong>{sharing.summary.revokedShares}</strong>
        </div>
        <div>
          <span>Last Shared</span>
          <strong>{lastShared}</strong>
        </div>
      </div>
      <section className="settings-form-section">
        <h2>Accountant Details</h2>
        <div className="settings-form-grid three">
          <label><span>CA Name</span><input value={business.caName} onChange={(event) => onChange({ ...business, caName: event.target.value })} /></label>
          <label><span>Email</span><input value={business.caEmail} onChange={(event) => onChange({ ...business, caEmail: event.target.value })} /></label>
          <label><span>Mobile Number</span><input value={business.caMobile} onChange={(event) => onChange({ ...business, caMobile: event.target.value })} /></label>
        </div>
        <div className="settings-check-list">
          <SettingsCheckbox label="Enable CA report sharing" checked={business.caReportsEnabled} onChange={(checked) => onChange({ ...business, caReportsEnabled: checked })} />
        </div>
      </section>
      <section className="settings-form-section">
        <div className="settings-ca-section-title">
          <h2>Report Bundle</h2>
          <span>{sharing.bundleReports.length} production reports will be prepared from live tenant data.</span>
        </div>
        <div className="settings-ca-bundle-grid">
          {(sharing.bundleReports.length ? sharing.bundleReports : emptyCAReportSharing.bundleReports).map(report => (
            <div className="settings-ca-bundle-row" key={report.reportId}>
              <Check size={15} />
              <span>{report.reportName}</span>
            </div>
          ))}
          {sharing.bundleReports.length === 0 && (
            <div className="settings-empty-row">
              <Check size={17} />
              Loading CA report bundle...
            </div>
          )}
        </div>
      </section>
      <section className="settings-form-section">
        <div className="settings-ca-section-title">
          <h2>Sharing History</h2>
          <span>{isLoading ? "Loading from Postgres..." : `${sharing.shares.length} recent report share records`}</span>
        </div>
        <table className="settings-simple-table settings-ca-share-table">
          <thead>
            <tr><th>Report</th><th>Recipient</th><th>Date Range</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {sharing.shares.length === 0 ? (
              <tr><td colSpan={5}>No CA report links have been prepared for this tenant yet.</td></tr>
            ) : (
              sharing.shares.slice(0, 12).map(share => (
                <tr key={share.id}>
                  <td>{share.reportName}</td>
                  <td>{share.recipient}</td>
                  <td>{share.dateRange || "-"}</td>
                  <td><span className={`settings-ca-status ${share.status}`}>{share.status}</span></td>
                  <td>{share.createdAt ? new Date(share.createdAt).toLocaleString("en-IN") : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function PricingSettings({ business }: { business: SettingsData["businessProfile"] }) {
  return (
    <>
      <SettingsHeader title="Pricing" subtitle="Current subscription and available upgrades">
        <button className="settings-chat-btn" type="button">
          <MessageCircle size={15} />
          Chat Support
        </button>
      </SettingsHeader>
      <section className="settings-pricing-hero">
        <div>
          <span>Current Plan</span>
          <h2>{business.planName || "Free Plan"}</h2>
          <p>Plan details are stored against this tenant and can be changed from backend subscription records.</p>
        </div>
        <div>
          <span>Valid Till</span>
          <strong>{formatIsoDate(business.planValidTill)}</strong>
          <button type="button">Upgrade Plan</button>
        </div>
      </section>
      <div className="settings-card-grid three">
        {["Business Reports", "Barcode & Inventory", "Online Store"].map(title => (
          <section className="settings-feature-card" key={title}>
            <Check size={22} />
            <strong>{title}</strong>
            <span>{business.planName ? `Available in ${business.planName}` : "Available when a paid plan is active."}</span>
            <b>{business.planName ? "Active" : "Inactive"}</b>
          </section>
        ))}
      </div>
    </>
  );
}

function ReferEarnSettings({ business }: { business: SettingsData["businessProfile"] }) {
  return (
    <>
      <SettingsHeader title="Refer & Earn" subtitle="Invite nearby businesses and earn subscription rewards">
        <button className="settings-purple-btn" type="button">
          <Share2 size={15} />
          Share Invite
        </button>
      </SettingsHeader>
      <section className="settings-refer-card">
        <div>
          <Gift size={46} />
          <h2>Share this billing system with another textile business</h2>
          <p>Referral code and rewards are stored against the active tenant.</p>
        </div>
        <strong>{business.referralCode || "Not configured"}</strong>
        <button type="button" disabled={!business.referralCode}>Copy Referral Code</button>
      </section>
      <section className="settings-form-section">
        <h2>Referral History</h2>
        <table className="settings-simple-table">
          <thead>
            <tr><th>Business</th><th>Mobile</th><th>Status</th><th>Reward</th></tr>
          </thead>
          <tbody>
            <tr><td colSpan={4}>No referral rewards recorded for this tenant yet.</td></tr>
          </tbody>
        </table>
      </section>
    </>
  );
}

function HelpSupportSettings({ business }: { business: SettingsData["businessProfile"] }) {
  return (
    <>
      <SettingsHeader title="Help And Support" subtitle="Get quick support for billing, reports and subscription">
        <button className="settings-purple-btn" type="button">
          <MessageCircle size={15} />
          Start Chat
        </button>
      </SettingsHeader>
      <div className="settings-card-grid three">
        <section className="settings-feature-card">
          <MessageCircle size={22} />
          <strong>Chat Support</strong>
          <span>{business.supportPhone ? "Use the configured tenant support contact." : "Support phone is not configured."}</span>
          <b>{business.supportPhone || "Not configured"}</b>
        </section>
        <section className="settings-feature-card">
          <Phone size={22} />
          <strong>Call Support</strong>
          <span>Contact support for setup and subscription issues.</span>
          <b>{business.supportPhone || "Not configured"}</b>
        </section>
        <section className="settings-feature-card">
          <Mail size={22} />
          <strong>Email Support</strong>
          <span>Send detailed issue reports and screenshots.</span>
          <b>{business.supportEmail || "Not configured"}</b>
        </section>
      </div>
      <section className="settings-form-section">
        <h2>Popular Help Topics</h2>
        <div className="settings-list-panel">
          {[
            "How to print a barcode label",
            "How to enable thermal invoice settings",
            "How to restore deleted users",
            "How to share reports with CA"
          ].map(topic => (
            <button className="settings-help-row" key={topic} type="button">
              <span>{topic}</span>
              <ChevronDown size={16} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
