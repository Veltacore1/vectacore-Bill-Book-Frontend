import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  FileText,
  Gift,
  HelpCircle,
  IndianRupee,
  LockKeyhole,
  Megaphone,
  MoreVertical,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  Printer,
  Trash2,
  Truck,
  UserCog,
  Users
} from "lucide-react";
import {
  cancelSmsCampaign,
  createOnlineOrder,
  createOnlineOrderShipment,
  createSmsCampaign,
  createStaffMember,
  createTenantUser,
  deleteTenantUser,
  generateStaffPayroll,
  getActivityFeed,
  getPendingNotifications,
  getStaffPayrollReport,
  markStaffAttendance,
  markStaffPayrollPaid,
  syncSmsCampaignDelivery,
  syncOnlineOrderShipping,
  queueSmsCampaign,
  updateBusinessSettings,
  updateTenantUser,
  updateOnlineOrderStatus
} from "../api";
import type {
  ActivityFeedItem,
  Business,
  Item,
  OnlineOrder,
  Party,
  PendingNotifications,
  SMSCampaign,
  SMSMarketingData,
  SettingsData,
  Staff,
  StaffPayrollReport,
  StaffPayrollRow
} from "../types";
import { getModulePermission, roleModulePermissions } from "../types";
import type { ModulePermissions } from "../types";

type BusinessToolView = "staff-attendance" | "manage-users" | "online-orders" | "sms-marketing";

interface BusinessToolsProps {
  view: BusinessToolView;
  business: Business;
  staffList: Staff[];
  users: Array<{ id: string; name: string; mobile: string; role: string; isActive: boolean }>;
  items: Item[];
  parties: Party[];
  onlineOrders: OnlineOrder[];
  smsMarketing: SMSMarketingData;
  settings: SettingsData | null;
  modulePermissions?: ModulePermissions;
  counts: { parties: number; items: number; salesInvoices: number; purchaseInvoices: number; paymentsIn: number; paymentsOut: number };
  onAttendanceChange: (staffId: string, date: string, status: "present" | "absent" | "half_day") => void;
  onWorkspaceRefresh: () => Promise<void>;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

const RUPEE = "\u20b9";
const todayIso = () => new Date().toISOString().slice(0, 10);
const currentMonthValue = () => new Date().toISOString().slice(0, 7);
const formatDisplayDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const parsePayrollMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
};
const emptyPendingNotifications: PendingNotifications = {
  actions: [],
  pendingReminders: [],
  counts: { actions: 0, pendingReminders: 0 }
};
const attendanceOptions = [
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half Day" },
  { value: "absent", label: "Absent" }
] as const;
type AttendanceStatusValue = typeof attendanceOptions[number]["value"];
const formatMoney = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const settingsItems = [
  { label: "Account", Icon: Users },
  { label: "Manage Business", Icon: Settings },
  { label: "Invoice Settings", Icon: FileText },
  { label: "Print Settings", Icon: FileText, badge: "New" },
  { label: "Manage Users", Icon: UserCog },
  { label: "Reminders", Icon: Bell },
  { label: "CA Reports Sharing", Icon: BarChart3 },
  { label: "Pricing", Icon: CircleHelp },
  { label: "Refer & Earn", Icon: Gift },
  { label: "Help And Support", Icon: HelpCircle }
];
const roleLabels: Record<string, string> = {
  admin: "Admin",
  partner: "Partner",
  salesman: "Salesman (Without edit access)",
  accountant: "Accountant",
  stock_manager: "Stock Manager"
};
const roleOptions = [
  { value: "salesman", label: roleLabels.salesman },
  { value: "stock_manager", label: roleLabels.stock_manager },
  { value: "accountant", label: roleLabels.accountant },
  { value: "partner", label: roleLabels.partner },
  { value: "admin", label: roleLabels.admin }
];
const userPermissionModules = ["parties", "items", "sales", "purchases", "payments", "accounting", "staff", "settings"] as const;
const roleLabel = (role: string) => roleLabels[role] ?? role.replace(/_/g, " ");
const cleanDeletedUserName = (name: string) => name.replace(/\s+\(Deleted\)$/i, "").trim();
type OnlineOrderStatusFilter = "all" | OnlineOrder["dispatchStatus"];
const onlineOrderStatusTabs: Array<{ value: OnlineOrderStatusFilter; label: string }> = [
  { value: "all", label: "All Orders" },
  { value: "new", label: "New" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" }
];
const initialsFor = (name: string) =>
  (name || "Business")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

export default function BusinessTools({
  view,
  business,
  staffList,
  users,
  items,
  parties,
  onlineOrders,
  smsMarketing,
  settings,
  modulePermissions: workspaceModulePermissions,
  counts,
  onAttendanceChange,
  onWorkspaceRefresh,
  setActiveTab,
  onLogout
}: BusinessToolsProps) {
  const modulePermissions = useMemo(
    () => workspaceModulePermissions && Object.keys(workspaceModulePermissions).length
      ? workspaceModulePermissions
      : roleModulePermissions(settings?.account.role),
    [settings?.account.role, workspaceModulePermissions]
  );

  if (view === "manage-users") {
    return (
      <ManageUsersView
        business={business}
        users={users}
        settings={settings}
        modulePermissions={modulePermissions}
        onBack={() => setActiveTab("dashboard")}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onNavigate={setActiveTab}
        onLogout={onLogout}
      />
    );
  }

  if (view === "staff-attendance") {
    return (
      <StaffAttendanceView
        business={business}
        staffList={staffList}
        modulePermissions={modulePermissions}
        onAttendanceChange={onAttendanceChange}
        onNavigate={setActiveTab}
        onWorkspaceRefresh={onWorkspaceRefresh}
      />
    );
  }

  if (view === "online-orders") {
    return (
      <OnlineOrdersView
        business={business}
        items={items}
        parties={parties}
        onlineOrders={onlineOrders}
        itemCount={counts.items}
        modulePermissions={modulePermissions}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onNavigate={setActiveTab}
      />
    );
  }

  return (
    <SmsMarketingView
      parties={parties}
      smsMarketing={smsMarketing}
      customerCount={counts.parties}
      modulePermissions={modulePermissions}
      onWorkspaceRefresh={onWorkspaceRefresh}
      onNavigate={setActiveTab}
    />
  );
}

function PermissionReadOnlyBanner({ moduleName }: { moduleName: string }) {
  return (
    <div className="permission-readonly-banner">
      <LockKeyhole size={16} />
      <span>You can view {moduleName}, but your role cannot create or manage records here.</span>
    </div>
  );
}

function PermissionDeniedState({
  title,
  onBack
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="mbb-screen business-tool-screen">
      <div className="mbb-page-card business-tool-card permission-denied-state">
        <LockKeyhole size={34} />
        <strong>{title} is not available for this role</strong>
        <span>Backend permissions do not allow this module to be viewed by the signed-in user.</span>
        <button className="mbb-primary-btn" onClick={onBack} type="button">
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

function StaffAttendanceView({
  business,
  staffList,
  modulePermissions,
  onAttendanceChange,
  onNavigate,
  onWorkspaceRefresh
}: Pick<BusinessToolsProps, "business" | "staffList" | "onAttendanceChange" | "onWorkspaceRefresh"> & {
  modulePermissions: ModulePermissions;
  onNavigate: (tab: string) => void;
}) {
  const staffPermission = getModulePermission(modulePermissions, "staff");
  const canWriteStaff = staffPermission.create || staffPermission.manage;
  const canViewReports = getModulePermission(modulePermissions, "reports").view;
  const [attendanceDate, setAttendanceDate] = useState(todayIso());
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [registerMode, setRegisterMode] = useState<"attendance" | "payroll">("attendance");
  const [payrollMonth, setPayrollMonth] = useState(currentMonthValue());
  const [payrollReport, setPayrollReport] = useState<StaffPayrollReport | null>(null);
  const [notifications, setNotifications] = useState<PendingNotifications>(emptyPendingNotifications);
  const [isPayrollLoading, setIsPayrollLoading] = useState(false);
  const [isGeneratingPayroll, setIsGeneratingPayroll] = useState(false);
  const [payingPayrollId, setPayingPayrollId] = useState("");
  const [payrollToPay, setPayrollToPay] = useState<StaffPayrollRow | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({
    paymentDate: todayIso(),
    notes: ""
  });
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    designation: "Sales Executive",
    salary: 18000
  });
  const { month: selectedMonth, year: selectedYear } = useMemo(() => parsePayrollMonth(payrollMonth), [payrollMonth]);
  const filteredStaff = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return staffList;
    return staffList.filter(member => [member.name, member.designation].join(" ").toLowerCase().includes(normalized));
  }, [query, staffList]);
  const payrollRowsByStaffId = useMemo(() => {
    return new Map((payrollReport?.rows ?? []).map(row => [row.staffId, row]));
  }, [payrollReport]);
  const presentCount = staffList.filter(member => member.attendance[attendanceDate] === "present").length;
  const payrollTotal = payrollReport?.summary.totalNetSalary ?? staffList.reduce((sum, member) => sum + member.salary, 0);
  const unpaidPayrollTotal = payrollReport?.summary.unpaidAmount ?? 0;
  const paidPayrollCount = payrollReport?.summary.paidCount ?? 0;
  const generatedPayrollCount = payrollReport?.summary.generatedCount ?? 0;
  const pendingActions = notifications.actions;

  const loadPayrollData = useCallback(async () => {
    setIsPayrollLoading(true);
    try {
      const [report, pending] = await Promise.all([
        getStaffPayrollReport({ month: selectedMonth, year: selectedYear }),
        getPendingNotifications()
      ]);
      setPayrollReport(report);
      setNotifications(pending);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payroll data could not be loaded.");
    } finally {
      setIsPayrollLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    void loadPayrollData();
  }, [loadPayrollData]);

  const updateAttendance = async (staffId: string, status: AttendanceStatusValue) => {
    if (!canWriteStaff) {
      setNotice("Your role can view staff attendance but cannot update attendance.");
      return;
    }
    onAttendanceChange(staffId, attendanceDate, status);
    try {
      await markStaffAttendance({ date: attendanceDate, records: [{ staffId, status }] });
      await onWorkspaceRefresh();
      await loadPayrollData();
      setNotice("Attendance saved to Postgres.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Attendance could not be saved.");
    }
  };

  const bulkUpdateAttendance = async (status: AttendanceStatusValue) => {
    if (!canWriteStaff) {
      setNotice("Your role can view staff attendance but cannot update attendance.");
      return;
    }
    if (!filteredStaff.length) {
      setNotice("No staff rows match the current search.");
      return;
    }

    filteredStaff.forEach(member => onAttendanceChange(member.id, attendanceDate, status));
    try {
      await markStaffAttendance({
        date: attendanceDate,
        records: filteredStaff.map(member => ({ staffId: member.id, status }))
      });
      await onWorkspaceRefresh();
      await loadPayrollData();
      setNotice(`${filteredStaff.length} staff marked ${status.replace("_", " ")} for ${formatDisplayDate(attendanceDate)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Bulk attendance could not be saved.");
    }
  };

  const saveStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWriteStaff) {
      setNotice("Your role can view staff but cannot add staff members.");
      return;
    }
    try {
      setIsSaving(true);
      await createStaffMember(draft);
      await onWorkspaceRefresh();
      await loadPayrollData();
      setNotice("Staff member saved to Postgres.");
      setShowCreate(false);
      setDraft({ name: "", phone: "", designation: "Sales Executive", salary: 18000 });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Staff member could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const generatePayroll = async () => {
    if (!canWriteStaff) {
      setNotice("Your role can view payroll but cannot generate payroll.");
      return;
    }
    try {
      setIsGeneratingPayroll(true);
      const report = await generateStaffPayroll({ month: selectedMonth, year: selectedYear });
      const pending = await getPendingNotifications();
      await onWorkspaceRefresh();
      setPayrollReport(report);
      setNotifications(pending);
      setNotice(`Payroll generated for ${report.monthLabel}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Payroll could not be generated.");
    } finally {
      setIsGeneratingPayroll(false);
    }
  };

  const openMarkPayrollPaid = (payroll: StaffPayrollRow) => {
    setPayrollToPay(payroll);
    setPaymentDraft({
      paymentDate: todayIso(),
      notes: `Salary paid for ${payroll.month}/${payroll.year}`
    });
  };

  const submitMarkPayrollPaid = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWriteStaff) {
      setNotice("Your role can view payroll but cannot mark salary as paid.");
      return;
    }
    if (!payrollToPay?.payrollId) return;
    try {
      setPayingPayrollId(payrollToPay.payrollId);
      await markStaffPayrollPaid({
        payrollId: payrollToPay.payrollId,
        paymentDate: paymentDraft.paymentDate,
        notes: paymentDraft.notes
      });
      await loadPayrollData();
      await onWorkspaceRefresh();
      setNotice(`Salary marked paid for ${payrollToPay.staffName}.`);
      setPayrollToPay(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Salary could not be marked paid.");
    } finally {
      setPayingPayrollId("");
    }
  };

  const exportPayrollCsv = () => {
    if (!payrollReport) {
      setNotice("Payroll report is still loading. Try again after it refreshes.");
      return;
    }
    const rows = buildPayrollExportRows(payrollReport, business.name);
    const csv = rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `staff-payroll-${payrollReport.year}-${String(payrollReport.month).padStart(2, "0")}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice(`${payrollReport.monthLabel} payroll exported from backend report data.`);
  };

  const printPayrollReport = () => {
    if (!payrollReport) {
      setNotice("Payroll report is still loading. Try again after it refreshes.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setNotice("Browser blocked the print window.");
      return;
    }
    printWindow.document.write(buildPayrollPrintHtml(payrollReport, business.name));
    printWindow.document.close();
    printWindow.focus();
    setNotice(`${payrollReport.monthLabel} payroll print preview opened.`);
  };

  if (!staffPermission.view) {
    return <PermissionDeniedState title="Staff Attendance & Payroll" onBack={() => onNavigate("dashboard")} />;
  }

  return (
    <div className="mbb-screen business-tool-screen">
      <div className="mbb-page-card business-tool-card">
        <div className="mbb-items-header business-tool-header">
          <h1>Staff Attendance & Payroll</h1>
          <div className="mbb-header-actions">
            {canViewReports && (
              <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
                <BarChart3 size={16} />
                Reports
                <ChevronDown size={15} />
              </button>
            )}
            <button className="mbb-primary-btn" onClick={() => setShowCreate(true)} disabled={!canWriteStaff} type="button">
              <Plus size={16} />
              Add Staff
            </button>
          </div>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}
        {!canWriteStaff && <PermissionReadOnlyBanner moduleName="staff attendance and payroll" />}

        <div className="business-stat-grid payroll-stat-grid">
          <div className="business-stat-card active">
            <span><Users size={16} /> Total Staff</span>
            <strong>{staffList.length}</strong>
            <small>{generatedPayrollCount} generated</small>
          </div>
          <div className="business-stat-card green">
            <span><CheckCircle2 size={16} /> Present On Date</span>
            <strong>{presentCount}</strong>
            <small>{formatDisplayDate(attendanceDate)}</small>
          </div>
          <div className="business-stat-card">
            <span><IndianRupee size={16} /> Net Payroll</span>
            <strong>{RUPEE} {formatMoney(payrollTotal)}</strong>
            <small>{payrollReport?.monthLabel ?? "Selected month"}</small>
          </div>
          <div className="business-stat-card">
            <span>Unpaid Salary</span>
            <strong>{RUPEE} {formatMoney(unpaidPayrollTotal)}</strong>
            <small>{paidPayrollCount} paid</small>
          </div>
        </div>

        <div className="business-toolbar">
          <button className="sales-square-btn" aria-label="Search" type="button">
            <Search size={18} />
          </button>
          <label className="sales-search-field">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search staff" />
          </label>
          {registerMode === "attendance" && (
            <label className="sales-filter-btn payroll-date-picker">
              <CalendarCheck size={16} />
              <span>Attendance</span>
              <input
                aria-label="Attendance date"
                type="date"
                value={attendanceDate}
                onChange={event => setAttendanceDate(event.target.value)}
              />
            </label>
          )}
          <label className="sales-filter-btn payroll-register-picker">
            <FileText size={16} />
            <select
              aria-label="Staff register"
              value={registerMode}
              onChange={event => setRegisterMode(event.target.value as "attendance" | "payroll")}
            >
              <option value="attendance">Attendance Register</option>
              <option value="payroll">Payroll Register</option>
            </select>
          </label>
          {registerMode === "attendance" ? (
            <div className="payroll-bulk-attendance">
              <button className="mbb-bulk-btn" onClick={() => bulkUpdateAttendance("present")} disabled={!canWriteStaff || !filteredStaff.length} type="button">
                <CheckCircle2 size={15} />
                Mark Present
              </button>
              <button className="mbb-bulk-btn" onClick={() => bulkUpdateAttendance("absent")} disabled={!canWriteStaff || !filteredStaff.length} type="button">
                Mark Absent
              </button>
            </div>
          ) : (
            <>
              <label className="sales-filter-btn payroll-month-picker">
                <span>Payroll Month</span>
                <input type="month" value={payrollMonth} onChange={event => setPayrollMonth(event.target.value)} />
              </label>
              <button className="mbb-bulk-btn payroll-export-btn" onClick={exportPayrollCsv} disabled={!payrollReport} type="button">
                <Download size={16} />
                CSV
              </button>
              <button className="mbb-bulk-btn payroll-export-btn" onClick={printPayrollReport} disabled={!payrollReport} type="button">
                <Printer size={16} />
                Print
              </button>
              <button className="mbb-primary-btn payroll-generate-btn" onClick={generatePayroll} disabled={!canWriteStaff || isGeneratingPayroll} type="button">
                <RefreshCw size={16} />
                {isGeneratingPayroll ? "Generating..." : "Generate Payroll"}
              </button>
            </>
          )}
        </div>

        <div className="business-table-wrap payroll-table-wrap">
          <table className="mbb-items-table business-table">
            <thead>
              {registerMode === "attendance" ? (
                <tr>
                  <th>Staff Name</th>
                  <th>Designation</th>
                  <th>Monthly Salary</th>
                  <th>Attendance Status</th>
                  <th>Present Cycle</th>
                </tr>
              ) : (
                <tr>
                  <th>Staff Name</th>
                  <th>Designation</th>
                  <th>Attendance Cycle</th>
                  <th>Gross Salary</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Payroll Status</th>
                  <th>Action</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredStaff.map(member => {
                const status = member.attendance[attendanceDate] || "absent";
                const payroll = payrollRowsByStaffId.get(member.id);
                const payrollStatus = payroll?.status ?? "not_generated";
                const monthAttendance = payroll?.attendance;
                return (
                  <tr key={member.id}>
                    {registerMode === "attendance" ? (
                      <>
                        <td>{member.name}</td>
                        <td>{member.designation}</td>
                        <td>{RUPEE} {member.salary.toLocaleString("en-IN")}</td>
                        <td>
                          <div className="attendance-actions">
                            {attendanceOptions.map(({ value, label }) => (
                              <button
                                key={value}
                                className={status === value ? "active" : ""}
                                disabled={!canWriteStaff}
                                onClick={() => updateAttendance(member.id, value)}
                                type="button"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td>
                          {monthAttendance
                            ? (
                              <span className="payroll-attendance-cycle">
                                <strong>{monthAttendance.presentDays} P / {monthAttendance.absentDays} A / {monthAttendance.halfDays} H</strong>
                                <small>{formatMoney(monthAttendance.paidDays)} paid days</small>
                              </span>
                            )
                            : `${Object.values(member.attendance).filter(value => value === "present").length} days`}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{member.name}</td>
                        <td>{member.designation}</td>
                        <td>
                          <span className="payroll-attendance-cycle">
                            <strong>{monthAttendance ? `${monthAttendance.presentDays} P / ${monthAttendance.absentDays} A / ${monthAttendance.halfDays} H` : "Not loaded"}</strong>
                            <small>{monthAttendance ? `${formatMoney(monthAttendance.paidDays)} paid days` : payrollReport?.monthLabel}</small>
                          </span>
                        </td>
                        <td>{RUPEE} {formatMoney(payroll?.basicSalary ?? member.salary)}</td>
                        <td>{RUPEE} {formatMoney(payroll?.deductions ?? 0)}</td>
                        <td>{RUPEE} {formatMoney(payroll?.netSalary ?? member.salary)}</td>
                        <td>
                          <span className={`payroll-status-pill ${payrollStatus}`}>
                            {payrollStatus === "not_generated" ? "Not Generated" : payrollStatus}
                          </span>
                        </td>
                        <td>
                          {payrollStatus === "unpaid" && payroll?.payrollId ? (
                            <button
                              className="payroll-action-btn"
                              disabled={!canWriteStaff || payingPayrollId === payroll.payrollId}
                              onClick={() => openMarkPayrollPaid(payroll)}
                              type="button"
                            >
                              <CheckCircle2 size={14} />
                              {payingPayrollId === payroll.payrollId ? "Saving..." : "Mark Paid"}
                            </button>
                          ) : (
                            <span className="payroll-muted-action">{payrollStatus === "paid" ? payroll?.paymentDate || "Paid" : "Generate first"}</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <section className="payroll-notifications-panel">
          <div>
            <h2><BellRing size={17} /> Pending Actions</h2>
            <span>{isPayrollLoading ? "Refreshing payroll and reminders..." : `${pendingActions.length} actions from reminder settings`}</span>
          </div>
          <div className="payroll-notification-list">
            {pendingActions.length === 0 ? (
              <div className="payroll-notification-empty">
                <CheckCircle2 size={18} />
                No pending payroll or reminder actions.
              </div>
            ) : (
              pendingActions.slice(0, 4).map(action => (
                <button key={action.id} className={`payroll-notification-item ${action.priority}`} onClick={() => onNavigate(action.target)} type="button">
                  <Bell size={15} />
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.message}</small>
                  </span>
                  {action.amount > 0 && <b>{RUPEE} {formatMoney(action.amount)}</b>}
                </button>
              ))
            )}
          </div>
        </section>
      </div>
      {showCreate && canWriteStaff && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveStaff}>
            <div className="sales-register-modal-header">
              <h2>Add Staff</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>Staff Name</span>
                <input required value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Phone</span>
                <input value={draft.phone} onChange={event => setDraft(current => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>
                <span>Designation</span>
                <input required value={draft.designation} onChange={event => setDraft(current => ({ ...current, designation: event.target.value }))} />
              </label>
              <label>
                <span>Monthly Salary</span>
                <input min="0" type="number" value={draft.salary} onChange={event => setDraft(current => ({ ...current, salary: Number(event.target.value) }))} />
              </label>
            </div>
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={!canWriteStaff || isSaving}>
                {isSaving ? "Saving..." : "Save Staff"}
              </button>
            </div>
          </form>
        </div>
      )}
      {payrollToPay && canWriteStaff && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal payroll-paid-modal" onSubmit={submitMarkPayrollPaid}>
            <div className="sales-register-modal-header">
              <h2>Mark Salary Paid</h2>
              <button type="button" onClick={() => setPayrollToPay(null)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="payroll-paid-summary">
              <span>{payrollToPay.staffName}</span>
              <strong>{RUPEE} {formatMoney(payrollToPay.netSalary)}</strong>
              <small>{payrollReport?.monthLabel ?? `${payrollToPay.month}/${payrollToPay.year}`}</small>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>Payment Date</span>
                <input
                  required
                  type="date"
                  value={paymentDraft.paymentDate}
                  onChange={event => setPaymentDraft(current => ({ ...current, paymentDate: event.target.value }))}
                />
              </label>
              <label>
                <span>Notes</span>
                <input
                  value={paymentDraft.notes}
                  onChange={event => setPaymentDraft(current => ({ ...current, notes: event.target.value }))}
                  placeholder="Cash / UPI / bank reference"
                />
              </label>
            </div>
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setPayrollToPay(null)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={payingPayrollId === payrollToPay.payrollId}>
                {payingPayrollId === payrollToPay.payrollId ? "Saving..." : "Save Paid Status"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function escapeCsvCell(value: string | number) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function escapeHtml(value: string | number) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPayrollExportRows(report: StaffPayrollReport, businessName: string) {
  return [
    [`Staff Payroll Report - ${report.monthLabel}`],
    ["Business", businessName],
    ["Generated Staff", report.summary.generatedCount],
    ["Paid Count", report.summary.paidCount],
    ["Unpaid Count", report.summary.unpaidCount],
    ["Total Net Salary", report.summary.totalNetSalary],
    ["Paid Amount", report.summary.paidAmount],
    ["Unpaid Amount", report.summary.unpaidAmount],
    [],
    ["Staff", "Designation", "Basic Salary", "Deductions", "Allowances", "Net Salary", "Status", "Payment Date", "Present", "Absent", "Half Day", "Paid Days"],
    ...report.rows.map(row => [
      row.staffName,
      row.designation,
      row.basicSalary,
      row.deductions,
      row.allowances,
      row.netSalary,
      row.status,
      row.paymentDate || "-",
      row.attendance.presentDays,
      row.attendance.absentDays,
      row.attendance.halfDays,
      row.attendance.paidDays
    ])
  ];
}

function buildPayrollPrintHtml(report: StaffPayrollReport, businessName: string) {
  const bodyRows = report.rows.map(row => `
    <tr>
      <td>${escapeHtml(row.staffName)}</td>
      <td>${escapeHtml(row.designation || "-")}</td>
      <td>${RUPEE} ${escapeHtml(formatMoney(row.basicSalary))}</td>
      <td>${RUPEE} ${escapeHtml(formatMoney(row.deductions))}</td>
      <td>${RUPEE} ${escapeHtml(formatMoney(row.netSalary))}</td>
      <td>${escapeHtml(row.status.replace("_", " "))}</td>
      <td>${escapeHtml(row.paymentDate || "-")}</td>
      <td>${escapeHtml(`${row.attendance.presentDays} P / ${row.attendance.absentDays} A / ${row.attendance.halfDays} H`)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.monthLabel)} Staff Payroll</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; }
    header { display: flex; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
    h1, h2 { margin: 0; }
    h1 { font-size: 22px; margin-top: 14px; }
    h2 { font-size: 16px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
    .summary div { border: 1px solid #cfd6e4; border-radius: 6px; padding: 10px; }
    .summary span { display: block; color: #667085; font-size: 11px; font-weight: 700; }
    .summary strong { display: block; margin-top: 5px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cfd6e4; padding: 8px 9px; text-align: left; font-size: 12px; }
    th { background: #f3f5f8; }
    .muted { color: #667085; font-size: 12px; }
    .actions { margin-bottom: 12px; }
    .actions button { border: 1px solid #cfd6e4; background: white; border-radius: 6px; padding: 8px 12px; font-weight: 700; }
    @media print { body { margin: 0; } .actions { display: none; } }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print / Save PDF</button></div>
  <header>
    <div>
      <h2>${escapeHtml(businessName)}</h2>
      <span class="muted">Staff payroll report</span>
    </div>
    <span class="muted">Generated ${escapeHtml(new Date().toLocaleString("en-IN"))}</span>
  </header>
  <h1>${escapeHtml(report.monthLabel)}</h1>
  <section class="summary">
    <div><span>Total Net Salary</span><strong>${RUPEE} ${escapeHtml(formatMoney(report.summary.totalNetSalary))}</strong></div>
    <div><span>Paid</span><strong>${RUPEE} ${escapeHtml(formatMoney(report.summary.paidAmount))}</strong></div>
    <div><span>Unpaid</span><strong>${RUPEE} ${escapeHtml(formatMoney(report.summary.unpaidAmount))}</strong></div>
    <div><span>Generated</span><strong>${escapeHtml(report.summary.generatedCount)} / ${escapeHtml(report.summary.totalStaff)}</strong></div>
  </section>
  <table>
    <thead>
      <tr>
        <th>Staff</th>
        <th>Designation</th>
        <th>Basic</th>
        <th>Deductions</th>
        <th>Net Pay</th>
        <th>Status</th>
        <th>Paid Date</th>
        <th>Attendance</th>
      </tr>
    </thead>
    <tbody>${bodyRows || "<tr><td colspan=\"8\">No staff rows</td></tr>"}</tbody>
  </table>
</body>
</html>`;
}

function RoleAccessPreview({ role }: { role: string }) {
  const permissions = roleModulePermissions(role);
  return (
    <div className="manage-users-role-preview">
      <span>{roleLabel(role)} Access</span>
      <div>
        {userPermissionModules.map(moduleKey => {
          const permission = permissions[moduleKey];
          const level = permission?.manage ? "Manage" : permission?.create ? "Create" : permission?.view ? "View" : "No Access";
          return (
            <small key={moduleKey} className={permission?.view ? "allowed" : ""}>
              {moduleKey.replace(/_/g, " ")}
              <b>{level}</b>
            </small>
          );
        })}
      </div>
    </div>
  );
}

function ManageUsersView({
  business,
  users,
  settings,
  modulePermissions,
  onBack,
  onWorkspaceRefresh,
  onNavigate,
  onLogout
}: {
  business: BusinessToolsProps["business"];
  users: BusinessToolsProps["users"];
  settings: SettingsData | null;
  modulePermissions: ModulePermissions;
  onBack: () => void;
  onWorkspaceRefresh: () => Promise<void>;
  onNavigate: (tab: string) => void;
  onLogout: () => void;
}) {
  const usersPermission = getModulePermission(modulePermissions, "users");
  const settingsPermission = getModulePermission(modulePermissions, "settings");
  const canCreateUsers = usersPermission.create;
  const canManageUsers = usersPermission.manage;
  const canManageCaAccess = settingsPermission.manage && usersPermission.create;
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCa, setShowCa] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");
  const [activityRows, setActivityRows] = useState<ActivityFeedItem[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [actionMenuUserId, setActionMenuUserId] = useState("");
  const [editDraft, setEditDraft] = useState<{ id: string; firstName: string; role: string; isActive: boolean } | null>(null);
  const [draft, setDraft] = useState({ firstName: "", mobile: "", role: "salesman" });
  const [caDraft, setCaDraft] = useState({
    name: settings?.businessProfile.caName || "",
    email: settings?.businessProfile.caEmail || "",
    mobile: settings?.businessProfile.caMobile || "",
    role: "accountant"
  });
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? users.filter(user =>
          [cleanDeletedUserName(user.name), user.mobile, roleLabel(user.role)]
            .join(" ")
            .toLowerCase()
            .includes(normalized)
        )
      : users;
    return [...matches].sort((left, right) => {
      const comparison = cleanDeletedUserName(left.name).localeCompare(cleanDeletedUserName(right.name));
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [query, sortDirection, users]);
  const activeUsers = useMemo(() => users.filter(user => user.isActive), [users]);

  useEffect(() => {
    setCaDraft(current => ({
      ...current,
      name: settings?.businessProfile.caName || current.name,
      email: settings?.businessProfile.caEmail || current.email,
      mobile: settings?.businessProfile.caMobile || current.mobile
    }));
  }, [settings]);

  const refreshActivity = useCallback(async () => {
    try {
      setIsActivityLoading(true);
      const data = await getActivityFeed(100);
      setActivityRows(data.activities ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "User activity count could not be loaded.");
    } finally {
      setIsActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateUsers) {
      setNotice("Your role can view users but cannot add new tenant users.");
      return;
    }
    try {
      setIsSaving(true);
      await createTenantUser(draft);
      await onWorkspaceRefresh();
      setNotice("User saved to Postgres.");
      setShowCreate(false);
      setDraft({ firstName: "", mobile: "", role: "salesman" });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "User could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveCa = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManageCaAccess) {
      setNotice("Your role can view users but cannot manage CA report access.");
      return;
    }
    try {
      setIsSaving(true);
      await updateBusinessSettings({
        caReportsEnabled: true,
        caName: caDraft.name,
        caEmail: caDraft.email,
        caMobile: caDraft.mobile
      });
      if (caDraft.mobile && !users.some(user => user.mobile === caDraft.mobile)) {
        await createTenantUser({
          firstName: caDraft.name || "Chartered Accountant",
          mobile: caDraft.mobile,
          role: caDraft.role
        });
      }
      await onWorkspaceRefresh();
      await refreshActivity();
      setNotice("CA access saved to Postgres.");
      setShowCa(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "CA access could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const openEditUser = (user: BusinessToolsProps["users"][number]) => {
    setActionMenuUserId("");
    setEditDraft({
      id: user.id,
      firstName: cleanDeletedUserName(user.name),
      role: user.role,
      isActive: user.isActive
    });
  };

  const saveEditedUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!editDraft) return;
    if (!canManageUsers) {
      setNotice("Your role can view users but cannot edit tenant users.");
      return;
    }
    try {
      setIsSaving(true);
      await updateTenantUser(editDraft.id, {
        firstName: editDraft.firstName,
        role: editDraft.role,
        isActive: editDraft.isActive
      });
      await onWorkspaceRefresh();
      await refreshActivity();
      setNotice("User access updated in Postgres.");
      setEditDraft(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "User access could not be updated.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeUser = async (userId: string) => {
    if (!canManageUsers) {
      setNotice("Your role can view users but cannot delete tenant users.");
      return;
    }
    const user = users.find(row => row.id === userId);
    if (!user || !window.confirm(`Delete ${user.name || user.mobile}?`)) return;
    try {
      setBusyUserId(userId);
      setActionMenuUserId("");
      await deleteTenantUser(userId);
      await onWorkspaceRefresh();
      await refreshActivity();
      setNotice("User soft deleted in Postgres.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "User could not be deleted.");
    } finally {
      setBusyUserId("");
    }
  };

  const restoreUser = async (userId: string) => {
    if (!canManageUsers) {
      setNotice("Your role can view users but cannot reactivate tenant users.");
      return;
    }
    const user = users.find(row => row.id === userId);
    if (!user) return;
    try {
      setBusyUserId(userId);
      setActionMenuUserId("");
      await updateTenantUser(userId, {
        firstName: cleanDeletedUserName(user.name),
        role: user.role,
        isActive: true
      });
      await onWorkspaceRefresh();
      await refreshActivity();
      setNotice("User reactivated for this tenant.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "User could not be reactivated.");
    } finally {
      setBusyUserId("");
    }
  };

  const navigateSettingsLabel = (label: string) => {
    if (label === "Manage Users") return;
    if (label === "CA Reports Sharing") {
      if (!canManageCaAccess) {
        setNotice("Your role can view users but cannot manage CA report access.");
        return;
      }
      setShowCa(true);
      return;
    }
    onNavigate("settings");
  };

  if (!usersPermission.view) {
    return <PermissionDeniedState title="Manage Users" onBack={onBack} />;
  }

  return (
    <div className="settings-tool-shell">
      <aside className="settings-tool-sidebar">
        <div className="settings-business-card">
          <div className="sidebar-brand-logo">{initialsFor(business.name)}</div>
          <div>
            <strong>{business.name || "New Business"}</strong>
            <span>{business.phone || "Mobile not set"}</span>
          </div>
        </div>
        <button className="settings-back-btn" onClick={onBack} type="button">
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>
        <nav className="settings-tool-nav">
          {settingsItems.map(({ label, Icon, badge }) => (
            <button
              key={label}
              className={label === "Manage Users" ? "active" : ""}
              onClick={() => navigateSettingsLabel(label)}
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
          <span>App Version : 9.8.1</span>
          <span><Shield size={13} /> 100% Secure</span>
          <span>ISO Certified</span>
          <strong>VastraBook <em>by Veltacore</em></strong>
        </div>
      </aside>

      <main className="settings-tool-main">
        <div className="settings-main-header">
          <h1>Manage Users</h1>
          <button aria-label="Help" type="button"><HelpCircle size={18} /></button>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}
        {(!canCreateUsers || !canManageUsers) && <PermissionReadOnlyBanner moduleName="tenant users" />}
        <div className="manage-users-stat-grid">
          <div className="business-stat-card active">
            <span><Users size={16} /> Number of Users</span>
            <strong>{activeUsers.length}</strong>
          </div>
          <div className="business-stat-card">
            <span>Activities Performed</span>
            <strong>{activityRows.length}</strong>
            <small>Last 30 Days</small>
          </div>
        </div>
        <div className="manage-users-toolbar">
          <button className="sales-square-btn" aria-label="Search" type="button">
            <Search size={18} />
          </button>
          <label className="sales-search-field">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search users" />
          </label>
          <div />
          <button className="mbb-bulk-btn" onClick={() => setShowCa(true)} disabled={!canManageCaAccess} type="button">Add Your CA</button>
          <button className="mbb-primary-btn" onClick={() => setShowCreate(true)} disabled={!canCreateUsers} type="button">Add New User</button>
        </div>
        <div className="manage-users-table-wrap">
          <table className="mbb-items-table business-table">
            <thead>
              <tr>
                <th>
                  <button
                    className={`manage-users-sort-btn ${sortDirection}`}
                    onClick={() => setSortDirection(current => (current === "asc" ? "desc" : "asc"))}
                    type="button"
                  >
                    User Name
                    <ChevronDown size={13} />
                  </button>
                </th>
                <th>Mobile Number</th>
                <th>Role Type</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>{cleanDeletedUserName(user.name)}</td>
                  <td>{user.mobile}</td>
                  <td>{roleLabel(user.role)}</td>
                  <td>{!user.isActive && <span className="deleted-pill">Deleted</span>}</td>
                  <td className="manage-users-action-cell">
                    {canManageUsers && (
                      <button
                        className="mbb-row-icon-btn"
                        aria-label={`Open actions for ${cleanDeletedUserName(user.name)}`}
                        disabled={busyUserId === user.id}
                        onClick={() => setActionMenuUserId(current => (current === user.id ? "" : user.id))}
                        type="button"
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}
                    {actionMenuUserId === user.id && canManageUsers && (
                      <div className="manage-users-action-menu">
                        <button onClick={() => openEditUser(user)} type="button">
                          <Pencil size={14} />
                          Edit User
                        </button>
                        {user.isActive ? (
                          <button onClick={() => removeUser(user.id)} type="button">
                            <Trash2 size={14} />
                            {busyUserId === user.id ? "Deleting..." : "Delete User"}
                          </button>
                        ) : (
                          <button onClick={() => restoreUser(user.id)} type="button">
                            <RotateCcw size={14} />
                            {busyUserId === user.id ? "Restoring..." : "Reactivate User"}
                          </button>
                        )}
                      </div>
                    )}
                    {user.isActive && !canManageUsers && <span className="permission-muted-action">Read only</span>}
                  </td>
                </tr>
              ))}
              {!filteredUsers.length && (
                <tr>
                  <td colSpan={5}>{query ? "No users match this search." : "No users added for this tenant yet."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isActivityLoading && <small className="manage-users-activity-note">Refreshing activity count...</small>}
      </main>
      {showCreate && canCreateUsers && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveUser}>
            <div className="sales-register-modal-header">
              <h2>Add New User</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>User Name</span>
                <input required value={draft.firstName} onChange={event => setDraft(current => ({ ...current, firstName: event.target.value }))} />
              </label>
              <label>
                <span>Mobile Number</span>
                <input required value={draft.mobile} onChange={event => setDraft(current => ({ ...current, mobile: event.target.value }))} />
              </label>
              <label>
                <span>Role Type</span>
                <select value={draft.role} onChange={event => setDraft(current => ({ ...current, role: event.target.value }))}>
                  {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <RoleAccessPreview role={draft.role} />
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={!canCreateUsers || isSaving}>
                {isSaving ? "Saving..." : "Save User"}
              </button>
            </div>
          </form>
        </div>
      )}
      {editDraft && canManageUsers && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveEditedUser}>
            <div className="sales-register-modal-header">
              <h2>Edit User</h2>
              <button type="button" onClick={() => setEditDraft(null)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>User Name</span>
                <input
                  required
                  value={editDraft.firstName}
                  onChange={event => setEditDraft(current => current ? { ...current, firstName: event.target.value } : current)}
                />
              </label>
              <label>
                <span>Role Type</span>
                <select
                  value={editDraft.role}
                  onChange={event => setEditDraft(current => current ? { ...current, role: event.target.value } : current)}
                >
                  {roleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={editDraft.isActive ? "active" : "deleted"}
                  onChange={event => setEditDraft(current => current ? { ...current, isActive: event.target.value === "active" } : current)}
                >
                  <option value="active">Active</option>
                  <option value="deleted">Deleted</option>
                </select>
              </label>
            </div>
            <RoleAccessPreview role={editDraft.role} />
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setEditDraft(null)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showCa && canManageCaAccess && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveCa}>
            <div className="sales-register-modal-header">
              <h2>Add Your CA</h2>
              <button type="button" onClick={() => setShowCa(false)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>CA Name</span>
                <input required value={caDraft.name} onChange={event => setCaDraft(current => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Mobile Number</span>
                <input required value={caDraft.mobile} onChange={event => setCaDraft(current => ({ ...current, mobile: event.target.value }))} />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={caDraft.email} onChange={event => setCaDraft(current => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                <span>Access Type</span>
                <select value={caDraft.role} onChange={event => setCaDraft(current => ({ ...current, role: event.target.value }))}>
                  <option value="accountant">{roleLabels.accountant}</option>
                  <option value="partner">{roleLabels.partner}</option>
                  <option value="admin">{roleLabels.admin}</option>
                </select>
              </label>
            </div>
            <div className="sales-register-modal-summary">
              <span>CA Reports Sharing</span>
              <strong>Report access will be saved for this tenant and a user invite will be created when the mobile is new.</strong>
            </div>
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowCa(false)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={!canManageCaAccess || isSaving}>
                {isSaving ? "Saving..." : "Save CA Access"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function OnlineOrdersView({
  business,
  items,
  parties,
  onlineOrders,
  itemCount,
  modulePermissions,
  onWorkspaceRefresh,
  onNavigate
}: {
  business: BusinessToolsProps["business"];
  items: Item[];
  parties: Party[];
  onlineOrders: OnlineOrder[];
  itemCount: number;
  modulePermissions: ModulePermissions;
  onWorkspaceRefresh: () => Promise<void>;
  onNavigate: (tab: string) => void;
}) {
  const businessToolsPermission = getModulePermission(modulePermissions, "business_tools");
  const canCreateOrders = businessToolsPermission.create;
  const canManageOrders = businessToolsPermission.manage;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OnlineOrderStatusFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showStoreManager, setShowStoreManager] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [shippingBusyOrderId, setShippingBusyOrderId] = useState("");
  const customerParties = useMemo(() => parties.filter(party => party.type === "customer"), [parties]);
  const sellableItems = useMemo(() => items.filter(item => item.price > 0 && item.stock > 0), [items]);
  const [draft, setDraft] = useState({
    partyId: "",
    itemId: "",
    customerName: "",
    customerMobile: "",
    customerEmail: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryState: "",
    deliveryPincode: "",
    quantity: 1,
    paymentStatus: "cod" as "pending" | "paid" | "cod",
    source: "online_store" as "online_store" | "whatsapp" | "manual",
    notes: ""
  });
  const selectedItem = items.find(item => item.id === draft.itemId);
  const quantity = Math.max(1, Number(draft.quantity) || 1);
  const taxable = selectedItem ? selectedItem.price * quantity : 0;
  const tax = selectedItem ? taxable * (selectedItem.gstRate / 100) : 0;
  const previewTotal = taxable + tax;
  const pendingOrders = onlineOrders.filter(order => ["new", "packed"].includes(order.dispatchStatus));
  const onlineSales = onlineOrders
    .filter(order => order.dispatchStatus !== "cancelled")
    .reduce((sum, order) => sum + order.totalAmount, 0);
  const storeLink = `${window.location.origin}/app?tab=online-orders&store=${encodeURIComponent(business.id || "csm-silks")}`;
  const selectedOrder = onlineOrders.find(order => order.id === selectedOrderId) || null;
  const statusCounts = useMemo(
    () => onlineOrders.reduce<Record<OnlineOrderStatusFilter, number>>(
      (counts, order) => {
        counts.all += 1;
        counts[order.dispatchStatus] += 1;
        return counts;
      },
      { all: onlineOrders.length, new: 0, packed: 0, shipped: 0, delivered: 0, cancelled: 0 }
    ),
    [onlineOrders]
  );
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return onlineOrders.filter(order => {
      const matchesStatus = statusFilter === "all" || order.dispatchStatus === statusFilter;
      const haystack = [
        order.orderNumber,
        order.customerName,
        order.customerMobile,
        order.itemName,
        order.itemCode,
        order.paymentStatus,
        order.dispatchStatus
      ].join(" ").toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [onlineOrders, query, statusFilter]);

  const statusLabel = (value: string) => value.replace("_", " ").replace(/^\w/, char => char.toUpperCase());
  const formatQuantity = (value: number) =>
    value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const selectedOrderTimeline = selectedOrder
    ? [
        { label: "Order Placed", done: true },
        { label: "Packed", done: ["packed", "shipped", "delivered"].includes(selectedOrder.dispatchStatus) },
        { label: "Shipped", done: ["shipped", "delivered"].includes(selectedOrder.dispatchStatus) },
        { label: "Delivered", done: selectedOrder.dispatchStatus === "delivered" }
      ]
    : [];

  const openCreateOrder = () => {
    if (!canCreateOrders) {
      setNotice("Your role can view online orders but cannot create orders.");
      return;
    }
    const party = customerParties[0];
    const item = sellableItems[0] || items[0];
    setDraft({
      partyId: party?.id || "",
      itemId: item?.id || "",
      customerName: party?.name || "",
      customerMobile: party?.mobile === "-" ? "" : party?.mobile || "",
      customerEmail: party?.email || "",
      deliveryAddress: party?.address || "",
      deliveryCity: party?.city || "",
      deliveryState: party?.state || business.state || "",
      deliveryPincode: party?.pincode || "",
      quantity: 1,
      paymentStatus: "cod",
      source: "online_store",
      notes: ""
    });
    setShowCreate(true);
  };

  const saveOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateOrders) {
      setNotice("Your role can view online orders but cannot create orders.");
      return;
    }
    if (!draft.itemId) {
      setNotice("Choose an item before saving the online order.");
      return;
    }

    try {
      setIsSaving(true);
      const order = await createOnlineOrder(draft);
      await onWorkspaceRefresh();
      setNotice(`${order.orderNumber} saved to Postgres.`);
      setShowCreate(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Online order could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (order: OnlineOrder, dispatchStatus?: OnlineOrder["dispatchStatus"], paymentStatus?: OnlineOrder["paymentStatus"]) => {
    if (!canManageOrders) {
      setNotice("Your role can view online orders but cannot update payment or dispatch status.");
      return;
    }
    try {
      await updateOnlineOrderStatus({ orderId: order.id, dispatchStatus, paymentStatus });
      await onWorkspaceRefresh();
      setNotice(`${order.orderNumber} updated in Postgres.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Online order could not be updated.");
    }
  };

  const createShipment = async (order: OnlineOrder) => {
    if (!canManageOrders) {
      setNotice("Your role can view online orders but cannot create shipments.");
      return;
    }
    try {
      setShippingBusyOrderId(order.id);
      const shippedOrder = await createOnlineOrderShipment(order.id);
      await onWorkspaceRefresh();
      setNotice(shippedOrder.shiprocketAwbCode
        ? `${order.orderNumber} shipped with AWB ${shippedOrder.shiprocketAwbCode}.`
        : `${order.orderNumber} created in Shiprocket. Assign AWB in Shiprocket, then sync tracking.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Shipment could not be created.");
    } finally {
      setShippingBusyOrderId("");
    }
  };

  const syncShipping = async (order: OnlineOrder) => {
    if (!canManageOrders) {
      setNotice("Your role can view online orders but cannot sync shipments.");
      return;
    }
    try {
      setShippingBusyOrderId(order.id);
      const syncedOrder = await syncOnlineOrderShipping(order.id);
      await onWorkspaceRefresh();
      setNotice(`${order.orderNumber} tracking synced: ${statusLabel(syncedOrder.shippingStatus)}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Shipment tracking could not be synced.");
    } finally {
      setShippingBusyOrderId("");
    }
  };

  const shareStore = async () => {
    try {
      await navigator.clipboard.writeText(storeLink);
      setNotice(`Online orders link copied: ${storeLink}`);
    } catch {
      setNotice(`Online orders link: ${storeLink}`);
    }
  };

  if (!businessToolsPermission.view) {
    return <PermissionDeniedState title="Online Orders" onBack={() => onNavigate("dashboard")} />;
  }

  return (
    <div className="mbb-screen business-tool-screen">
      <div className="mbb-page-card business-tool-card">
        <div className="mbb-items-header business-tool-header">
          <h1>Online Orders</h1>
          <div className="mbb-header-actions">
            <button className="mbb-primary-btn online-store-manage-btn" onClick={() => setShowStoreManager(true)} type="button">
              <ShoppingCart size={16} />
              Manage Online Store
            </button>
          </div>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}
        {(!canCreateOrders || !canManageOrders) && <PermissionReadOnlyBanner moduleName="online orders" />}
        <div className="business-stat-grid">
          <div className="business-stat-card active">
            <span><Store size={16} /> Online Store</span>
            <strong>Active</strong>
          </div>
          <div className="business-stat-card">
            <span>Pending Orders</span>
            <strong>{pendingOrders.length}</strong>
          </div>
          <div className="business-stat-card green">
            <span>Ready Catalog Items</span>
            <strong>{sellableItems.length || itemCount}</strong>
            <small>{RUPEE} {onlineSales.toLocaleString("en-IN")}</small>
          </div>
        </div>
        <div className="business-toolbar online-orders-toolbar">
          <button className="sales-square-btn" aria-label="Search" type="button">
            <Search size={18} />
          </button>
          <label className="sales-search-field online-orders-search">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search orders, customer, item" />
          </label>
          <button className="sales-filter-btn" onClick={openCreateOrder} disabled={!canCreateOrders} type="button">
            <PackageCheck size={16} />
            Add Manual Store Order
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="online-order-status-tabs" aria-label="Online order status filter">
          {onlineOrderStatusTabs.map(tab => (
            <button
              key={tab.value}
              className={statusFilter === tab.value ? "active" : ""}
              onClick={() => setStatusFilter(tab.value)}
              type="button"
            >
              {tab.label}
              <b>{statusCounts[tab.value]}</b>
            </button>
          ))}
        </div>
        <div className="online-orders-layout has-orders">
          <section className="online-store-preview">
            <ShoppingCart size={62} />
            <h2>{business.name || "Business"} Online Store</h2>
            <p>{sellableItems.length} live catalog items are ready for the online orders workspace and internal team sharing.</p>
            <span className="online-store-link-preview">{storeLink}</span>
            <button className="mbb-primary-btn" onClick={shareStore} type="button">
              <Copy size={16} />
              Share Orders Link
            </button>
          </section>
          <section className="online-orders-panel">
            <header className="online-orders-panel-header">
              <div>
                <strong>{statusFilter === "all" ? "Customer Orders" : `${statusLabel(statusFilter)} Orders`}</strong>
                <span>{filteredOrders.length} orders in this view</span>
              </div>
              <button className="mbb-bulk-btn" onClick={() => setShowStoreManager(true)} type="button">
                <Store size={15} />
                Store Setup
              </button>
            </header>
            {filteredOrders.length === 0 ? (
              <div className="online-orders-empty">
                <PackageCheck size={52} />
                <strong>No Online Orders</strong>
                <span>Create an order from the store workflow and it will appear here with real payment and dispatch status.</span>
              </div>
            ) : (
              <div className="online-orders-table-wrap">
                <table className="mbb-items-table business-table online-orders-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Shipment</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map(order => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.orderNumber}</strong>
                          <span>{order.orderDate} - {statusLabel(order.source)}</span>
                        </td>
                        <td>
                          <strong>{order.customerName}</strong>
                          <span>{order.customerMobile}</span>
                        </td>
                        <td>
                          <strong>{order.itemName}</strong>
                          <span>{order.itemCode || "No SKU"}</span>
                        </td>
                        <td>{formatQuantity(order.quantity)} PCS</td>
                        <td>{RUPEE} {order.totalAmount.toLocaleString("en-IN")}</td>
                        <td>
                          <span className={`online-status-pill ${order.paymentStatus}`}>{statusLabel(order.paymentStatus)}</span>
                        </td>
                        <td>
                          <span className={`online-status-pill ${order.dispatchStatus}`}>{statusLabel(order.dispatchStatus)}</span>
                          {order.shippingStatus !== "not_created" && (
                            <span className="online-shipping-meta">
                              {statusLabel(order.shippingStatus)}
                              {order.shiprocketAwbCode && ` - AWB ${order.shiprocketAwbCode}`}
                              {order.shiprocketCourierName && ` - ${order.shiprocketCourierName}`}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="online-order-actions">
                            <button onClick={() => setSelectedOrderId(order.id)} type="button">View</button>
                            {order.paymentStatus !== "paid" && order.dispatchStatus !== "cancelled" && (
                              <button onClick={() => updateStatus(order, undefined, "paid")} disabled={!canManageOrders} type="button">Paid</button>
                            )}
                            {order.dispatchStatus === "new" && (
                              <button onClick={() => updateStatus(order, "packed")} disabled={!canManageOrders} type="button">Pack</button>
                            )}
                            {order.dispatchStatus === "packed" && !order.shiprocketOrderId && (
                              <button onClick={() => updateStatus(order, "shipped")} disabled={!canManageOrders} type="button">Mark Shipped</button>
                            )}
                            {["new", "packed"].includes(order.dispatchStatus) && !order.shiprocketOrderId && (
                              <button
                                onClick={() => createShipment(order)}
                                disabled={!canManageOrders || shippingBusyOrderId === order.id}
                                type="button"
                              >
                                <Truck size={13} />
                                {shippingBusyOrderId === order.id ? "Creating..." : "Create Shipment"}
                              </button>
                            )}
                            {order.shiprocketAwbCode && order.dispatchStatus !== "delivered" && (
                              <button
                                onClick={() => syncShipping(order)}
                                disabled={!canManageOrders || shippingBusyOrderId === order.id}
                                type="button"
                              >
                                <RefreshCw size={13} />
                                {shippingBusyOrderId === order.id ? "Syncing..." : "Sync"}
                              </button>
                            )}
                            {order.dispatchStatus === "shipped" && !order.shiprocketAwbCode && (
                              <button onClick={() => updateStatus(order, "delivered", "paid")} disabled={!canManageOrders} type="button">Deliver</button>
                            )}
                            {!["delivered", "cancelled"].includes(order.dispatchStatus) && (
                              <button className="danger" onClick={() => updateStatus(order, "cancelled")} disabled={!canManageOrders} type="button">Cancel</button>
                            )}
                            {!canManageOrders && <span className="permission-muted-action">Read only</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      {showStoreManager && (
        <div className="sales-register-modal-backdrop">
          <div className="sales-register-modal purchase-register-modal online-store-manager-modal">
            <div className="sales-register-modal-header">
              <h2>Manage Online Store</h2>
              <button type="button" onClick={() => setShowStoreManager(false)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="online-store-manager-grid">
              <div className="business-stat-card active">
                <span><Store size={16} /> Online Store</span>
                <strong>Active</strong>
                <small>Tenant catalog is connected</small>
              </div>
              <div className="business-stat-card">
                <span>Pending Orders</span>
                <strong>{pendingOrders.length}</strong>
                <small>New and packed orders</small>
              </div>
              <div className="business-stat-card green">
                <span>Ready Catalog Items</span>
                <strong>{sellableItems.length || itemCount}</strong>
                <small>{RUPEE} {onlineSales.toLocaleString("en-IN")} online sales</small>
              </div>
            </div>
            <div className="online-store-share-box">
              <span>Online Orders Link</span>
              <strong>{storeLink}</strong>
              <button className="mbb-primary-btn" onClick={shareStore} type="button">
                <Copy size={16} />
                Share Orders Link
              </button>
            </div>
            <div className="online-store-checklist">
              {[
                ["Business profile", Boolean(business.name && business.phone)],
                ["Catalog items", Boolean(sellableItems.length || itemCount)],
                ["Customer COD orders", true],
                ["Shiprocket shipping", true]
              ].map(([label, done]) => (
                <span key={String(label)} className={done ? "done" : ""}>
                  <CheckCircle2 size={15} />
                  {label}
                </span>
              ))}
            </div>
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowStoreManager(false)}>Close</button>
              <button
                type="button"
                className="mbb-primary-btn"
                onClick={() => {
                  setShowStoreManager(false);
                  openCreateOrder();
                }}
                disabled={!canCreateOrders}
              >
                Add Manual Store Order
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedOrder && (
        <div className="sales-register-modal-backdrop">
          <aside className="online-order-detail-drawer">
            <header>
              <div>
                <span>{selectedOrder.orderNumber}</span>
                <h2>{selectedOrder.customerName}</h2>
              </div>
              <button type="button" onClick={() => setSelectedOrderId("")} aria-label="Close order details">
                <ArrowLeft size={20} />
              </button>
            </header>
            <div className="online-order-detail-status">
              <span className={`online-status-pill ${selectedOrder.paymentStatus}`}>{statusLabel(selectedOrder.paymentStatus)}</span>
              <span className={`online-status-pill ${selectedOrder.dispatchStatus}`}>{statusLabel(selectedOrder.dispatchStatus)}</span>
              <span className={`online-status-pill ${selectedOrder.shippingStatus}`}>{statusLabel(selectedOrder.shippingStatus)}</span>
            </div>
            <div className="online-order-timeline">
              {selectedOrderTimeline.map(step => (
                <span key={step.label} className={step.done ? "done" : ""}>
                  <CheckCircle2 size={15} />
                  {step.label}
                </span>
              ))}
            </div>
            <dl className="online-order-detail-grid">
              <div><dt>Item</dt><dd>{selectedOrder.itemName}</dd></div>
              <div><dt>Quantity</dt><dd>{formatQuantity(selectedOrder.quantity)} PCS</dd></div>
              <div><dt>Total Amount</dt><dd>{RUPEE} {selectedOrder.totalAmount.toLocaleString("en-IN")}</dd></div>
              <div><dt>Mobile</dt><dd>{selectedOrder.customerMobile || "-"}</dd></div>
              <div><dt>Source</dt><dd>{statusLabel(selectedOrder.source)}</dd></div>
              <div><dt>AWB</dt><dd>{selectedOrder.shiprocketAwbCode || "-"}</dd></div>
              <div className="wide"><dt>Delivery Address</dt><dd>{[selectedOrder.deliveryAddress, selectedOrder.deliveryCity, selectedOrder.deliveryState, selectedOrder.deliveryPincode].filter(Boolean).join(", ") || "-"}</dd></div>
              <div className="wide"><dt>Notes</dt><dd>{selectedOrder.notes || "-"}</dd></div>
            </dl>
            <div className="online-order-detail-actions">
              {selectedOrder.paymentStatus !== "paid" && selectedOrder.dispatchStatus !== "cancelled" && (
                <button onClick={() => updateStatus(selectedOrder, undefined, "paid")} disabled={!canManageOrders} type="button">Mark Paid</button>
              )}
              {selectedOrder.dispatchStatus === "new" && (
                <button onClick={() => updateStatus(selectedOrder, "packed")} disabled={!canManageOrders} type="button">Pack Order</button>
              )}
              {selectedOrder.dispatchStatus === "packed" && !selectedOrder.shiprocketOrderId && (
                <button onClick={() => updateStatus(selectedOrder, "shipped")} disabled={!canManageOrders} type="button">Mark Shipped</button>
              )}
              {["new", "packed"].includes(selectedOrder.dispatchStatus) && !selectedOrder.shiprocketOrderId && (
                <button onClick={() => createShipment(selectedOrder)} disabled={!canManageOrders || shippingBusyOrderId === selectedOrder.id} type="button">
                  {shippingBusyOrderId === selectedOrder.id ? "Creating..." : "Create Shipment"}
                </button>
              )}
              {selectedOrder.shiprocketAwbCode && selectedOrder.dispatchStatus !== "delivered" && (
                <button onClick={() => syncShipping(selectedOrder)} disabled={!canManageOrders || shippingBusyOrderId === selectedOrder.id} type="button">
                  {shippingBusyOrderId === selectedOrder.id ? "Syncing..." : "Sync Tracking"}
                </button>
              )}
              {selectedOrder.dispatchStatus === "shipped" && (
                <button onClick={() => updateStatus(selectedOrder, "delivered", "paid")} disabled={!canManageOrders} type="button">Mark Delivered</button>
              )}
              {!["delivered", "cancelled"].includes(selectedOrder.dispatchStatus) && (
                <button className="danger" onClick={() => updateStatus(selectedOrder, "cancelled")} disabled={!canManageOrders} type="button">Cancel Order</button>
              )}
            </div>
          </aside>
        </div>
      )}
      {showCreate && canCreateOrders && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveOrder}>
            <div className="sales-register-modal-header">
              <h2>Create Online Order</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>Select Customer</span>
                <select
                  value={draft.partyId}
                  onChange={event => {
                    const party = customerParties.find(row => row.id === event.target.value);
                    setDraft(current => ({
                      ...current,
                      partyId: event.target.value,
                      customerName: party?.name || current.customerName,
                      customerMobile: party?.mobile === "-" ? "" : party?.mobile || current.customerMobile,
                      customerEmail: party?.email || current.customerEmail,
                      deliveryAddress: party?.address || current.deliveryAddress,
                      deliveryCity: party?.city || current.deliveryCity,
                      deliveryState: party?.state || current.deliveryState,
                      deliveryPincode: party?.pincode || current.deliveryPincode
                    }));
                  }}
                >
                  <option value="">Manual Customer</option>
                  {customerParties.map(party => (
                    <option key={party.id} value={party.id}>{party.name} - {party.mobile}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Catalog Item</span>
                <select required value={draft.itemId} onChange={event => setDraft(current => ({ ...current, itemId: event.target.value }))}>
                  <option value="">Choose item</option>
                  {items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.stock} PCS - {RUPEE} {item.price.toLocaleString("en-IN")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Customer Name</span>
                <input required value={draft.customerName} onChange={event => setDraft(current => ({ ...current, customerName: event.target.value }))} />
              </label>
              <label>
                <span>Mobile Number</span>
                <input value={draft.customerMobile} onChange={event => setDraft(current => ({ ...current, customerMobile: event.target.value }))} />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={draft.customerEmail} onChange={event => setDraft(current => ({ ...current, customerEmail: event.target.value }))} />
              </label>
              <label>
                <span>Quantity</span>
                <input min="1" max={selectedItem?.stock || undefined} type="number" value={draft.quantity} onChange={event => setDraft(current => ({ ...current, quantity: Math.max(1, Number(event.target.value) || 1) }))} />
              </label>
              <label>
                <span>Payment Status</span>
                <select value={draft.paymentStatus} onChange={event => setDraft(current => ({ ...current, paymentStatus: event.target.value as typeof draft.paymentStatus }))}>
                  <option value="cod">Cash On Delivery</option>
                  <option value="pending">Payment Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label>
                <span>Source</span>
                <select value={draft.source} onChange={event => setDraft(current => ({ ...current, source: event.target.value as typeof draft.source }))}>
                  <option value="online_store">Online Store</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="manual">Manual Entry</option>
                </select>
              </label>
              <label>
                <span>Available Stock</span>
                <input readOnly value={selectedItem ? `${selectedItem.stock} PCS` : "-"} />
              </label>
              <label>
                <span>City</span>
                <input value={draft.deliveryCity} onChange={event => setDraft(current => ({ ...current, deliveryCity: event.target.value }))} />
              </label>
              <label>
                <span>State</span>
                <input value={draft.deliveryState} onChange={event => setDraft(current => ({ ...current, deliveryState: event.target.value }))} />
              </label>
              <label>
                <span>Pincode</span>
                <input inputMode="numeric" maxLength={10} value={draft.deliveryPincode} onChange={event => setDraft(current => ({ ...current, deliveryPincode: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Delivery Address</span>
                <textarea value={draft.deliveryAddress} onChange={event => setDraft(current => ({ ...current, deliveryAddress: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Notes</span>
                <textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <div className="sales-register-modal-summary">
              <span>Taxable: {RUPEE} {taxable.toLocaleString("en-IN")}</span>
              <span>GST: {RUPEE} {tax.toLocaleString("en-IN")}</span>
              <strong>Total: {RUPEE} {previewTotal.toLocaleString("en-IN")}</strong>
            </div>
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={!canCreateOrders || isSaving || !draft.itemId}>
                {isSaving ? "Saving..." : "Save Online Order"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SmsMarketingView({
  parties,
  smsMarketing,
  customerCount,
  modulePermissions,
  onWorkspaceRefresh,
  onNavigate
}: {
  parties: Party[];
  smsMarketing: SMSMarketingData;
  customerCount: number;
  modulePermissions: ModulePermissions;
  onWorkspaceRefresh: () => Promise<void>;
  onNavigate: (tab: string) => void;
}) {
  const businessToolsPermission = getModulePermission(modulePermissions, "business_tools");
  const canCreateCampaigns = businessToolsPermission.create;
  const canManageCampaigns = businessToolsPermission.manage;
  const canViewReports = getModulePermission(modulePermissions, "reports").view;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SMSCampaign["status"]>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [busyCampaignId, setBusyCampaignId] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const reachableCustomers = useMemo(
    () => parties.filter(party => party.type === "customer" && party.mobile && party.mobile !== "-"),
    [parties]
  );
  const [draft, setDraft] = useState({
    name: "",
    templateId: "",
    audience: "all_customers" as "all_customers" | "manual",
    message: "",
    partyIds: [] as string[],
    sendNow: true
  });
  const selectedTemplate = smsMarketing.templates.find(template => template.id === draft.templateId);
  const recipientCount = draft.audience === "manual" ? draft.partyIds.length : reachableCustomers.length;
  const messageSegments = Math.max(1, Math.ceil((draft.message.length || 1) / 160));
  const creditCost = recipientCount * messageSegments;
  const completedCampaigns = smsMarketing.campaigns.filter(campaign => campaign.status === "completed").length;
  const campaignStatusTabs: Array<{ value: "all" | SMSCampaign["status"]; label: string }> = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "queued", label: "Queued" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" }
  ];
  const statusCounts = useMemo(() => {
    const counts = {
      all: smsMarketing.campaigns.length,
      draft: 0,
      queued: 0,
      completed: 0,
      cancelled: 0
    };
    smsMarketing.campaigns.forEach(campaign => {
      counts[campaign.status] += 1;
    });
    return counts;
  }, [smsMarketing.campaigns]);
  const filteredCampaigns = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return smsMarketing.campaigns.filter(campaign => {
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const haystack = [
        campaign.campaignNumber,
        campaign.name,
        campaign.templateName,
        campaign.message,
        campaign.status
      ].join(" ").toLowerCase();
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [smsMarketing.campaigns, query, statusFilter]);
  const selectedCampaign = useMemo(
    () => smsMarketing.campaigns.find(campaign => campaign.id === selectedCampaignId) || null,
    [smsMarketing.campaigns, selectedCampaignId]
  );

  useEffect(() => {
    if (selectedCampaignId && !smsMarketing.campaigns.some(campaign => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId("");
    }
  }, [smsMarketing.campaigns, selectedCampaignId]);

  const statusLabel = (value: string) => value.replace("_", " ").replace(/^\w/, char => char.toUpperCase());
  const recipientCounts = (campaign: SMSCampaign) => {
    const recipients = campaign.recipients ?? [];
    return {
      queued: recipients.filter(recipient => recipient.status === "queued").length,
      sent: recipients.filter(recipient => recipient.status === "sent").length,
      delivered: recipients.filter(recipient => recipient.status === "delivered").length,
      failed: recipients.filter(recipient => recipient.status === "failed").length
    };
  };
  const receiptSummary = (campaign: SMSCampaign) => {
    const recipients = campaign.recipients ?? [];
    if (!recipients.length) return "Awaiting receipts";
    const delivered = recipients.filter(recipient => recipient.status === "delivered").length;
    const sent = recipients.filter(recipient => recipient.status === "sent").length;
    const failed = recipients.filter(recipient => recipient.status === "failed").length;
    return `${delivered} delivered - ${sent} sent - ${failed} failed`;
  };
  const providerSummary = (campaign: SMSCampaign) => {
    const recipient = (campaign.recipients ?? []).find(row => row.provider || row.providerMessageId || row.errorMessage);
    if (!recipient) return "";
    const provider = recipient.provider ? statusLabel(recipient.provider) : "Provider";
    if (recipient.providerMessageId) return `${provider} ${recipient.providerMessageId}`;
    return recipient.errorMessage || provider;
  };
  const selectedReceiptCounts = selectedCampaign ? recipientCounts(selectedCampaign) : { queued: 0, sent: 0, delivered: 0, failed: 0 };
  const selectedDeliveryRate = selectedCampaign?.recipientCount
    ? Math.round(((selectedReceiptCounts.delivered + selectedReceiptCounts.sent) / selectedCampaign.recipientCount) * 100)
    : 0;
  const selectedCampaignTimeline = selectedCampaign
    ? [
        { label: "Created", done: true },
        { label: "Queued", done: Boolean(selectedCampaign.queuedAt) || ["queued", "completed", "cancelled"].includes(selectedCampaign.status) },
        { label: "Provider Accepted", done: selectedCampaign.status === "completed" || selectedReceiptCounts.sent + selectedReceiptCounts.delivered + selectedReceiptCounts.failed > 0 },
        { label: selectedCampaign.status === "cancelled" ? "Cancelled" : "Delivery Closed", done: ["completed", "cancelled"].includes(selectedCampaign.status) }
      ]
    : [];

  const openCreateCampaign = () => {
    if (!canCreateCampaigns) {
      setNotice("Your role can view SMS campaigns but cannot create campaigns.");
      return;
    }
    const template = smsMarketing.templates[0];
    setDraft({
      name: template ? `${template.name} Campaign` : "Customer SMS Campaign",
      templateId: template?.id || "",
      audience: "all_customers",
      message: template?.message || "",
      partyIds: [],
      sendNow: true
    });
    setShowCreate(true);
  };

  const applyTemplate = (templateId: string) => {
    const template = smsMarketing.templates.find(row => row.id === templateId);
    setDraft(current => ({
      ...current,
      templateId,
      name: template ? `${template.name} Campaign` : current.name,
      message: template?.message || current.message
    }));
  };

  const toggleParty = (partyId: string) => {
    setDraft(current => ({
      ...current,
      partyIds: current.partyIds.includes(partyId)
        ? current.partyIds.filter(id => id !== partyId)
        : [...current.partyIds, partyId]
    }));
  };

  const saveCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateCampaigns) {
      setNotice("Your role can view SMS campaigns but cannot create campaigns.");
      return;
    }
    if (!draft.message.trim()) {
      setNotice("Write an SMS message before queueing the campaign.");
      return;
    }
    if (recipientCount === 0) {
      setNotice("No reachable customers found for this SMS audience.");
      return;
    }

    try {
      setIsSaving(true);
      const campaign = await createSmsCampaign(draft);
      await onWorkspaceRefresh();
      setNotice(
        campaign.status === "draft"
          ? `${campaign.campaignNumber} saved as draft for ${campaign.recipientCount} customers.`
          : `${campaign.campaignNumber} queued in Postgres for ${campaign.recipientCount} customers.`
      );
      setShowCreate(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "SMS campaign could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const syncDelivery = async (campaign: SMSCampaign) => {
    if (!canManageCampaigns) {
      setNotice("Your role can view SMS campaigns but cannot sync delivery.");
      return;
    }
    try {
      setBusyCampaignId(campaign.id);
      const result = await syncSmsCampaignDelivery(campaign.id);
      await onWorkspaceRefresh();
      setSelectedCampaignId(result.campaign.id);
      setNotice(result.message || `${campaign.campaignNumber} delivery synced in Postgres.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "SMS campaign delivery could not be synced.");
    } finally {
      setBusyCampaignId("");
    }
  };

  const queueCampaign = async (campaign: SMSCampaign) => {
    if (!canManageCampaigns) {
      setNotice("Your role can view SMS campaigns but cannot queue campaigns.");
      return;
    }
    try {
      setBusyCampaignId(campaign.id);
      const result = await queueSmsCampaign(campaign.id);
      await onWorkspaceRefresh();
      setSelectedCampaignId(result.campaign.id);
      setNotice(result.message || `${campaign.campaignNumber} queued in Postgres.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "SMS campaign could not be queued.");
    } finally {
      setBusyCampaignId("");
    }
  };

  const cancelCampaign = async (campaign: SMSCampaign) => {
    if (!canManageCampaigns) {
      setNotice("Your role can view SMS campaigns but cannot cancel campaigns.");
      return;
    }
    try {
      setBusyCampaignId(campaign.id);
      const result = await cancelSmsCampaign(campaign.id);
      await onWorkspaceRefresh();
      setSelectedCampaignId(result.campaign.id);
      setNotice(result.message || `${campaign.campaignNumber} cancelled.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "SMS campaign could not be cancelled.");
    } finally {
      setBusyCampaignId("");
    }
  };

  if (!businessToolsPermission.view) {
    return <PermissionDeniedState title="SMS Marketing" onBack={() => onNavigate("dashboard")} />;
  }

  return (
    <div className="mbb-screen business-tool-screen">
      <div className="mbb-page-card business-tool-card">
        <div className="mbb-items-header business-tool-header">
          <h1>SMS Marketing</h1>
          <div className="mbb-header-actions">
            {canViewReports && (
              <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
                <BarChart3 size={16} />
                Reports
                <ChevronDown size={15} />
              </button>
            )}
            <button className="mbb-primary-btn" onClick={openCreateCampaign} disabled={!canCreateCampaigns} type="button">
              <Megaphone size={16} />
              Create Campaign
            </button>
          </div>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}
        {(!canCreateCampaigns || !canManageCampaigns) && <PermissionReadOnlyBanner moduleName="SMS marketing" />}
        <div className="business-stat-grid">
          <div className="business-stat-card active">
            <span>SMS Credits</span>
            <strong>{smsMarketing.creditBalance.toLocaleString("en-IN")}</strong>
          </div>
          <div className="business-stat-card">
            <span>Customers Reachable</span>
            <strong>{reachableCustomers.length || customerCount}</strong>
          </div>
          <div className="business-stat-card green">
            <span>Templates</span>
            <strong>{smsMarketing.templates.length}</strong>
            <small>{completedCampaigns} sent</small>
          </div>
        </div>
        <div className="business-toolbar sms-toolbar">
          <button className="sales-square-btn" aria-label="Search" type="button">
            <Search size={18} />
          </button>
          <label className="sales-search-field sms-campaign-search">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search campaigns, templates, messages" />
          </label>
          <label className="sales-filter-btn online-filter-select">
            <span>Status</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All Campaigns</option>
              <option value="draft">Draft</option>
              <option value="queued">Queued</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button className="sales-filter-btn" onClick={openCreateCampaign} disabled={!canCreateCampaigns} type="button">
            <Megaphone size={16} />
            Queue Campaign
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="online-order-status-tabs sms-campaign-status-tabs" aria-label="SMS campaign status filter">
          {campaignStatusTabs.map(tab => (
            <button
              key={tab.value}
              className={statusFilter === tab.value ? "active" : ""}
              onClick={() => setStatusFilter(tab.value)}
              type="button"
            >
              {tab.label}
              <b>{statusCounts[tab.value]}</b>
            </button>
          ))}
        </div>
        <div className="sms-marketing-layout">
          <section className="sms-template-panel">
            <h2>Send offers to your customers</h2>
            <div className="sms-template-row">
              {smsMarketing.templates.map(template => (
                <button key={template.id} onClick={() => {
                  applyTemplate(template.id);
                  setShowCreate(true);
                }} disabled={!canCreateCampaigns} type="button">
                  {template.name}
                </button>
              ))}
            </div>
          </section>
          <section className="sms-campaign-panel">
            <header className="sms-campaign-panel-header">
              <div>
                <strong>{statusFilter === "all" ? "Campaign Register" : `${statusLabel(statusFilter)} Campaigns`}</strong>
                <span>{filteredCampaigns.length} campaigns in this view</span>
              </div>
              <button className="mbb-bulk-btn" onClick={openCreateCampaign} disabled={!canCreateCampaigns} type="button">
                <Megaphone size={15} />
                New Campaign
              </button>
            </header>
            {filteredCampaigns.length === 0 ? (
              <div className="online-orders-empty">
                <Megaphone size={52} />
                <strong>No Campaigns Sent</strong>
                <span>Your sent SMS campaigns and delivery performance will show here.</span>
              </div>
            ) : (
              <div className="sms-campaign-table-wrap">
                <table className="mbb-items-table business-table sms-campaign-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Template</th>
                      <th>Audience</th>
                      <th>Credits</th>
                      <th>Delivery</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map(campaign => (
                      <tr key={campaign.id}>
                        <td>
                          <strong>{campaign.campaignNumber}</strong>
                          <span>{campaign.name}</span>
                        </td>
                        <td>{campaign.templateName}</td>
                        <td>{campaign.recipientCount} customers</td>
                        <td>{campaign.creditCost}</td>
                        <td>
                          {campaign.deliveredCount}/{campaign.recipientCount}
                          <span className="sms-receipt-summary">{receiptSummary(campaign)}</span>
                          {providerSummary(campaign) && <span className="sms-provider-meta">{providerSummary(campaign)}</span>}
                        </td>
                        <td><span className={`online-status-pill ${campaign.status}`}>{statusLabel(campaign.status)}</span></td>
                        <td>
                          <div className="sms-campaign-actions">
                            <button className="sms-sync-btn" onClick={() => setSelectedCampaignId(campaign.id)} type="button">
                              View
                            </button>
                            {campaign.status === "draft" && (
                              <button className="sms-sync-btn" onClick={() => queueCampaign(campaign)} disabled={!canManageCampaigns || busyCampaignId === campaign.id} type="button">
                                {busyCampaignId === campaign.id ? "Queueing..." : "Queue"}
                              </button>
                            )}
                            {campaign.status === "queued" && (
                              <button className="sms-sync-btn" onClick={() => syncDelivery(campaign)} disabled={!canManageCampaigns || busyCampaignId === campaign.id} type="button">
                                {busyCampaignId === campaign.id ? "Syncing..." : "Sync"}
                              </button>
                            )}
                            {["draft", "queued"].includes(campaign.status) && (
                              <button className="sms-sync-btn danger" onClick={() => cancelCampaign(campaign)} disabled={!canManageCampaigns || busyCampaignId === campaign.id} type="button">
                                Cancel
                              </button>
                            )}
                            {!canManageCampaigns && <span className="permission-muted-action">Read only</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
      {selectedCampaign && (
        <div className="sales-register-modal-backdrop">
          <aside className="online-order-detail-drawer sms-campaign-detail-drawer">
            <header>
              <div>
                <span>{selectedCampaign.campaignNumber}</span>
                <h2>{selectedCampaign.name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedCampaignId("")} aria-label="Close campaign details">
                <ArrowLeft size={20} />
              </button>
            </header>
            <div className="online-order-detail-status sms-campaign-detail-status">
              <span className={`online-status-pill ${selectedCampaign.status}`}>{statusLabel(selectedCampaign.status)}</span>
              <span>{selectedCampaign.recipientCount} recipients</span>
              <span>{selectedCampaign.creditCost} credits</span>
              <span>{selectedDeliveryRate}% accepted</span>
            </div>
            <div className="online-order-timeline sms-campaign-timeline">
              {selectedCampaignTimeline.map(step => (
                <span key={step.label} className={step.done ? "done" : ""}>
                  <CheckCircle2 size={15} />
                  {step.label}
                </span>
              ))}
            </div>
            <dl className="online-order-detail-grid">
              <div><dt>Template</dt><dd>{selectedCampaign.templateName || "Custom"}</dd></div>
              <div><dt>Audience</dt><dd>{statusLabel(selectedCampaign.audience)}</dd></div>
              <div><dt>Created</dt><dd>{selectedCampaign.createdAt || "-"}</dd></div>
              <div><dt>Queued</dt><dd>{selectedCampaign.queuedAt || "-"}</dd></div>
              <div><dt>Accepted</dt><dd>{selectedReceiptCounts.sent + selectedReceiptCounts.delivered}</dd></div>
              <div><dt>Failed</dt><dd>{selectedReceiptCounts.failed}</dd></div>
              <div className="wide"><dt>Message</dt><dd>{selectedCampaign.message}</dd></div>
            </dl>
            <div className="sms-recipient-receipts">
              <header>
                <strong>Recipient Receipts</strong>
                <span>
                  {selectedReceiptCounts.queued} queued - {selectedReceiptCounts.sent} sent - {selectedReceiptCounts.delivered} delivered - {selectedReceiptCounts.failed} failed
                </span>
              </header>
              {(selectedCampaign.recipients ?? []).length === 0 ? (
                <div className="sms-recipient-empty">No recipients attached to this campaign.</div>
              ) : (
                <div className="sms-recipient-receipt-list">
                  {(selectedCampaign.recipients ?? []).map(recipient => (
                    <div className="sms-recipient-receipt-row" key={recipient.id}>
                      <div>
                        <strong>{recipient.partyName || "Customer"}</strong>
                        <span>{recipient.mobile}</span>
                      </div>
                      <span className={`online-status-pill ${recipient.status}`}>{statusLabel(recipient.status)}</span>
                      <small>{recipient.providerMessageId || recipient.errorMessage || recipient.sentAt || recipient.createdAt || "-"}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="online-order-detail-actions">
              {selectedCampaign.status === "draft" && (
                <button onClick={() => queueCampaign(selectedCampaign)} disabled={!canManageCampaigns || busyCampaignId === selectedCampaign.id} type="button">
                  {busyCampaignId === selectedCampaign.id ? "Queueing..." : "Queue Campaign"}
                </button>
              )}
              {selectedCampaign.status === "queued" && (
                <button onClick={() => syncDelivery(selectedCampaign)} disabled={!canManageCampaigns || busyCampaignId === selectedCampaign.id} type="button">
                  {busyCampaignId === selectedCampaign.id ? "Syncing..." : "Sync Delivery"}
                </button>
              )}
              {["draft", "queued"].includes(selectedCampaign.status) && (
                <button className="danger" onClick={() => cancelCampaign(selectedCampaign)} disabled={!canManageCampaigns || busyCampaignId === selectedCampaign.id} type="button">
                  Cancel Campaign
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
      {showCreate && canCreateCampaigns && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveCampaign}>
            <div className="sales-register-modal-header">
              <h2>Create SMS Campaign</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="sales-register-form-grid">
              <label>
                <span>Campaign Name</span>
                <input required value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Template</span>
                <select value={draft.templateId} onChange={event => applyTemplate(event.target.value)}>
                  <option value="">No template</option>
                  {smsMarketing.templates.map(template => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Audience</span>
                <select value={draft.audience} onChange={event => setDraft(current => ({ ...current, audience: event.target.value as typeof draft.audience }))}>
                  <option value="all_customers">All Customers With Mobile</option>
                  <option value="manual">Selected Customers</option>
                </select>
              </label>
              <label>
                <span>Send Mode</span>
                <select value={draft.sendNow ? "queue" : "draft"} onChange={event => setDraft(current => ({ ...current, sendNow: event.target.value === "queue" }))}>
                  <option value="queue">Queue Now</option>
                  <option value="draft">Save Draft</option>
                </select>
              </label>
              <label className="wide">
                <span>Message</span>
                <textarea required value={draft.message} onChange={event => setDraft(current => ({ ...current, message: event.target.value }))} />
              </label>
              {draft.audience === "manual" && (
                <div className="sms-recipient-picker">
                  {reachableCustomers.map(party => (
                    <label key={party.id}>
                      <input checked={draft.partyIds.includes(party.id)} onChange={() => toggleParty(party.id)} type="checkbox" />
                      <span>{party.name}</span>
                      <small>{party.mobile}</small>
                    </label>
                  ))}
                </div>
              )}
              <div className="sms-preview-card wide">
                <span>Template: {selectedTemplate?.name || "Custom"}</span>
                <span>Recipients: {recipientCount}</span>
                <span>Segments: {messageSegments}</span>
                <strong>Credits Needed: {creditCost}</strong>
              </div>
            </div>
            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="mbb-primary-btn" disabled={!canCreateCampaigns || isSaving || creditCost > smsMarketing.creditBalance}>
                {isSaving ? "Saving..." : draft.sendNow ? "Queue Campaign" : "Save Draft"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
