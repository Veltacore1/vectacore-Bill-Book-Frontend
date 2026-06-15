import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  CircleDot,
  Gift,
  Keyboard,
  Landmark,
  RefreshCw,
  Megaphone,
  MessagesSquare,
  MonitorDown,
  UserRoundPlus,
  X
} from "lucide-react";
import type { Business, DashboardData, Party, SalesInvoice, SettingsData, TransactionRow } from "../types";

type DashboardUtilityKey = "desktop" | "announcements" | "refer" | "invite" | "support" | "shortcuts";
type SalesReportPeriod = "daily" | "weekly" | "monthly";
type SalesTrendRow = DashboardData["salesTrend"][number];

interface DashboardProps {
  stats: {
    totalSales: number;
    receivable: number;
    payable: number;
    inventoryVal: number;
  };
  business: Business;
  businessProfile?: SettingsData["businessProfile"];
  invoices: SalesInvoice[];
  parties: Party[];
  transactions: TransactionRow[];
  dashboard: DashboardData;
  counts: {
    parties: number;
    items: number;
    salesInvoices: number;
    purchaseInvoices: number;
    paymentsIn: number;
    paymentsOut: number;
  };
  userCount: number;
  onNavigate: (tab: string) => void;
  onNavigateToInvoice: (invoiceId: string) => void;
  onRefresh: () => Promise<void> | void;
}

const RUPEE = "\u20b9";

const formatMoney = (amount: number, decimals = 0) =>
  `${amount < 0 ? "- " : ""}${RUPEE} ${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;

const formatReportDate = (value: string) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const checklistPriorityRank = { high: 0, medium: 1, low: 2 };

const checklistStatusClass = (status: string) =>
  status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const inferChecklistPriority = (status: string): "high" | "medium" | "low" => {
  const normalized = checklistStatusClass(status);
  if (["attention", "due"].includes(normalized)) return "high";
  if (["open", "scheduled"].includes(normalized)) return "medium";
  return "low";
};

const salesReportPeriods: Array<{ key: SalesReportPeriod; label: string; description: string }> = [
  { key: "daily", label: "Daily", description: "Day-wise tenant sales" },
  { key: "weekly", label: "Weekly", description: "Week bucket summary" },
  { key: "monthly", label: "Monthly", description: "Month bucket summary" }
];

const aggregateTrendRows = (rows: SalesTrendRow[], period: SalesReportPeriod): SalesTrendRow[] => {
  if (period === "daily") return rows;
  if (rows.length === 0) return rows;

  if (period === "weekly") {
    const buckets: SalesTrendRow[] = [];
    for (let index = 0; index < rows.length; index += 7) {
      const group = rows.slice(index, index + 7);
      buckets.push({
        date: group[0]?.date || "",
        label: group.length > 1 ? `Week ${buckets.length + 1}` : group[0]?.label || `Week ${buckets.length + 1}`,
        sales: group.reduce((total, row) => total + row.sales, 0),
        invoiceCount: group.reduce((total, row) => total + row.invoiceCount, 0)
      });
    }
    return buckets;
  }

  const monthlyBuckets = new Map<string, SalesTrendRow>();
  rows.forEach(row => {
    const date = row.date ? new Date(`${row.date}T00:00:00`) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${date.getMonth()}`
      : row.label || "month";
    const label = date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString("en-GB", { month: "short" })
      : row.label || "Month";
    const current = monthlyBuckets.get(key);
    monthlyBuckets.set(key, {
      date: current?.date || row.date,
      label,
      sales: (current?.sales || 0) + row.sales,
      invoiceCount: (current?.invoiceCount || 0) + row.invoiceCount
    });
  });
  return Array.from(monthlyBuckets.values());
};

export default function Dashboard({
  stats,
  business,
  businessProfile,
  invoices,
  parties,
  transactions,
  dashboard,
  counts,
  userCount,
  onNavigate,
  onNavigateToInvoice,
  onRefresh
}: DashboardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeUtility, setActiveUtility] = useState<DashboardUtilityKey | null>(null);
  const [utilityNotice, setUtilityNotice] = useState("");
  const [salesReportPeriod, setSalesReportPeriod] = useState<SalesReportPeriod>("daily");
  const hasDashboardData = Boolean(dashboard.lastUpdated || dashboard.salesTrend.length || dashboard.checklist.length);
  const currentStats = hasDashboardData
    ? dashboard.stats
    : {
        totalSales: stats.totalSales,
        totalPurchases: 0,
        receivable: stats.receivable,
        payable: stats.payable,
        inventoryVal: stats.inventoryVal,
        bankBalance: 0,
        expenseTotal: 0
      };
  const transactionRows = (transactions.length ? transactions : invoices.map(invoice => ({
      date: invoice.date,
      type: "Sales Invoices",
      txnNo: invoice.invoiceNumber,
      partyName: invoice.party.name.toUpperCase(),
      amount: invoice.total,
      id: invoice.id
    }))).slice(0, 5);

  const receivable = currentStats.receivable;
  const payable = currentStats.payable;
  const bankBalance = currentStats.bankBalance;
  const baseTrend = dashboard.salesTrend.length
    ? dashboard.salesTrend
    : Array.from({ length: 7 }, (_, index) => ({
        date: "",
        label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
        sales: 0,
        invoiceCount: 0
      }));
  const trend = useMemo(() => aggregateTrendRows(baseTrend, salesReportPeriod), [baseTrend, salesReportPeriod]);
  const activeSalesPeriod = salesReportPeriods.find(period => period.key === salesReportPeriod) || salesReportPeriods[0];
  const salesReportTitle =
    dashboard.salesTrend.length > 0
      ? `Sales Report - ${salesReportPeriod === "daily" ? "" : `${activeSalesPeriod.label} - `}${formatReportDate(dashboard.salesTrend[0].date)} to ${formatReportDate(dashboard.salesTrend[dashboard.salesTrend.length - 1].date)}`
      : "Sales Report";
  const chart = useMemo(() => {
    const maxSales = Math.max(...trend.map(row => row.sales), 1);
    const points = trend.map((row, index) => {
      const x = trend.length === 1 ? 315 : 56 + index * (574 / Math.max(trend.length - 1, 1));
      const y = 180 - (row.sales / maxSales) * 142;
      return { x, y };
    });
    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} 196 L ${points[0].x.toFixed(1)} 196 Z` : "";
    const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((maxSales / 5) * (5 - index)));
    return { areaPath, linePath, points, yTicks };
  }, [trend]);
  const trendSales = trend.reduce((total, row) => total + row.sales, 0);
  const trendInvoiceCount = trend.reduce((total, row) => total + row.invoiceCount, 0);
  const trendSalesLabel = salesReportPeriod === "daily"
    ? "Last 7 days sales"
    : `${activeSalesPeriod.label} sales`;
  const checklistRows = useMemo(() => (
    dashboard.checklist
      .map(item => ({
        ...item,
        priority: item.priority || inferChecklistPriority(item.status)
      }))
      .sort((left, right) => checklistPriorityRank[left.priority] - checklistPriorityRank[right.priority])
  ), [dashboard.checklist]);
  const checklistNeedsAction = checklistRows.filter(item => checklistStatusClass(item.status) !== "clear");
  const cashCoverage = payable > 0 ? Math.max(0, Math.min(100, (bankBalance / payable) * 100)) : 100;
  const collectionCoverage = receivable > 0 ? Math.max(0, Math.min(100, (bankBalance / receivable) * 100)) : 100;
  const stockToSalesRatio = currentStats.totalSales > 0 ? (currentStats.inventoryVal / currentStats.totalSales) * 100 : 0;
  const businessHealthRows = [
    {
      label: "Cash cover vs payable",
      value: cashCoverage,
      summary: `${formatMoney(bankBalance, 0)} cash for ${formatMoney(payable, 0)} payable`
    },
    {
      label: "Collections strength",
      value: collectionCoverage,
      summary: `${formatMoney(receivable, 0)} pending collection`
    },
    {
      label: "Inventory load",
      value: Math.max(0, Math.min(100, stockToSalesRatio)),
      summary: `${formatMoney(currentStats.inventoryVal, 0)} stock value`
    }
  ];

  const handleTransactionOpen = (tx: TransactionRow) => {
    const type = tx.type.toLowerCase();
    if (type.includes("sales")) {
      onNavigateToInvoice(tx.id);
      return;
    }
    if (type.includes("purchase")) {
      onNavigate("purchases");
      return;
    }
    if (type.includes("payment in")) {
      onNavigate("payment-in");
      return;
    }
    if (type.includes("payment out")) {
      onNavigate("payment-out");
      return;
    }
    if (type.includes("expense")) {
      onNavigate("expenses");
      return;
    }
    onNavigate("reports");
  };

  const handleTransactionTypeOpen = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes("purchase")) onNavigate("purchases");
    else if (lowerType.includes("payment in")) onNavigate("payment-in");
    else if (lowerType.includes("payment out")) onNavigate("payment-out");
    else if (lowerType.includes("expense")) onNavigate("expenses");
    else onNavigate("sales-invoices");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const utilityActions = [
    { key: "desktop" as const, label: "Download Desktop App", icon: MonitorDown },
    { key: "announcements" as const, label: "Announcements", icon: Megaphone },
    { key: "refer" as const, label: "Refer a friend", icon: Gift },
    { key: "invite" as const, label: "Invite users", icon: UserRoundPlus },
    { key: "support" as const, label: "Chat Support", icon: MessagesSquare },
    { key: "shortcuts" as const, label: "Shortcuts", icon: Keyboard }
  ];
  const activeUtilityAction = utilityActions.find(action => action.key === activeUtility);

  const openUtility = (key: DashboardUtilityKey) => {
    setUtilityNotice("");
    setActiveUtility(current => current === key ? null : key);
  };

  const copyUtilityText = async (text: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setUtilityNotice(`${label} copied.`);
    } catch {
      setUtilityNotice(`${label}: ${text}`);
    }
  };

  const downloadDesktopShortcut = () => {
    const url = window.location.origin;
    const fileName = `${(business.name || "VastraBook").replace(/[^a-z0-9]+/gi, "-") || "VastraBook"}.url`;
    const shortcut = `[InternetShortcut]\nURL=${url}\nIconFile=${url}/favicon.ico\nIconIndex=0\n`;
    const blob = new Blob([shortcut], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    setUtilityNotice("Desktop shortcut downloaded.");
  };

  const renderUtilityBody = () => {
    if (!activeUtility) return null;
    const appLink = window.location.origin;
    const referralCode = businessProfile?.referralCode || `${(business.prefix || "VB").toUpperCase()}2026`;
    const supportEmail = businessProfile?.supportEmail || business.email || "support@vastrabook.in";
    const supportPhone = businessProfile?.supportPhone || business.phone || "8608633066";

    if (activeUtility === "desktop") {
      return (
        <>
          <div className="dashboard-utility-hero">
            <strong>{business.name || "Tenant Workspace"}</strong>
            <span>Install a desktop shortcut that opens this tenant dashboard directly.</span>
          </div>
          <div className="dashboard-utility-stats">
            <span>Last sync <b>{dashboard.lastUpdated || "Loading"}</b></span>
            <span>Invoices <b>{counts.salesInvoices}</b></span>
          </div>
          <div className="dashboard-utility-actions">
            <button type="button" onClick={downloadDesktopShortcut}>Download Shortcut</button>
            <button type="button" onClick={() => void copyUtilityText(appLink, "App link")}>Copy App Link</button>
          </div>
        </>
      );
    }

    if (activeUtility === "announcements") {
      return (
        <>
          <div className="dashboard-utility-list">
            {checklistNeedsAction.slice(0, 4).map(item => (
              <button key={item.id} type="button" onClick={() => onNavigate(item.target)}>
                <span>{item.label}</span>
                <b>{item.count} pending</b>
              </button>
            ))}
            {checklistNeedsAction.length === 0 && <p>No urgent tenant alerts right now.</p>}
          </div>
          <div className="dashboard-utility-mini">
            <strong>Latest activity</strong>
            <span>{transactionRows[0]?.type || "No transactions"} {transactionRows[0]?.txnNo || ""}</span>
          </div>
        </>
      );
    }

    if (activeUtility === "refer") {
      return (
        <>
          <div className="dashboard-utility-code">
            <span>Referral Code</span>
            <strong>{referralCode}</strong>
          </div>
          <p className="dashboard-utility-copy">Share this tenant referral code with another textile business.</p>
          <div className="dashboard-utility-actions">
            <button type="button" onClick={() => void copyUtilityText(referralCode, "Referral code")}>Copy Code</button>
            <button type="button" onClick={() => onNavigate("settings")}>Open Refer & Earn</button>
          </div>
        </>
      );
    }

    if (activeUtility === "invite") {
      return (
        <>
          <div className="dashboard-utility-stats">
            <span>Active users <b>{userCount}</b></span>
            <span>Parties <b>{counts.parties}</b></span>
          </div>
          <p className="dashboard-utility-copy">Invite sales, stock, and accountant users with role-based access.</p>
          <div className="dashboard-utility-actions">
            <button type="button" onClick={() => onNavigate("manage-users")}>Manage Users</button>
            <button type="button" onClick={() => onNavigate("settings")}>Business Access</button>
          </div>
        </>
      );
    }

    if (activeUtility === "support") {
      return (
        <>
          <div className="dashboard-utility-list">
            <button type="button" onClick={() => void copyUtilityText(supportPhone, "Support phone")}>
              <span>Phone support</span>
              <b>{supportPhone}</b>
            </button>
            <button type="button" onClick={() => void copyUtilityText(supportEmail, "Support email")}>
              <span>Email support</span>
              <b>{supportEmail}</b>
            </button>
          </div>
          <div className="dashboard-utility-actions">
            <button type="button" onClick={() => onNavigate("settings")}>Open Help Desk</button>
            <button type="button" onClick={() => void copyUtilityText(`${business.name} support request - ${supportPhone}`, "Support summary")}>Copy Summary</button>
          </div>
        </>
      );
    }

    return (
      <div className="dashboard-shortcut-grid">
        <button type="button" onClick={() => onNavigate("sales-invoice-create")}>Ctrl + N <span>Create invoice</span></button>
        <button type="button" onClick={() => onNavigate("items")}>I <span>Open items</span></button>
        <button type="button" onClick={() => onNavigate("parties")}>P <span>Open parties</span></button>
        <button type="button" onClick={() => onNavigate("pos-billing")}>B <span>POS billing</span></button>
        <button type="button" onClick={() => onNavigate("reports")}>R <span>Reports</span></button>
        <button type="button" onClick={() => onNavigate("settings")}>S <span>Settings</span></button>
      </div>
    );
  };

  return (
    <div className="mbb-screen dashboard-screen">
      <div className="mbb-page-card dashboard-card">
        <div className="mbb-items-header dashboard-header">
          <h1>Dashboard</h1>
          <div className="dashboard-utility-icons">
            {utilityActions.map(action => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  className={activeUtility === action.key ? "active" : ""}
                  aria-label={`Open ${action.label}`}
                  onClick={() => openUtility(action.key)}
                  title={action.label}
                  type="button"
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>

        {activeUtility && activeUtilityAction && (
          <aside className="dashboard-utility-popover" aria-label={activeUtilityAction.label}>
            <header>
              <div>
                <span>{business.name || "Tenant"}</span>
                <strong>{activeUtilityAction.label}</strong>
              </div>
              <button type="button" onClick={() => setActiveUtility(null)} aria-label="Close utility panel">
                <X size={17} />
              </button>
            </header>
            {utilityNotice && <div className="dashboard-utility-notice">{utilityNotice}</div>}
            {renderUtilityBody()}
          </aside>
        )}

        <div className="dashboard-body">
          <div className="dashboard-overview-title">
            <strong>Business Overview</strong>
            <button
              aria-label="Refresh dashboard"
              className={`dashboard-refresh-pill ${isRefreshing ? "is-refreshing" : ""}`}
              disabled={isRefreshing}
              onClick={handleRefresh}
              type="button"
            >
              {isRefreshing ? "Refreshing" : `Last Update: ${dashboard.lastUpdated || "Loading"}`}
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="dashboard-summary-row">
            <button className="dashboard-metric collect" type="button" onClick={() => onNavigate("parties")}>
              <span><ArrowDownLeft size={14} /> To Collect</span>
              <strong>{formatMoney(receivable, 2)}</strong>
            </button>
            <button className="dashboard-metric pay" type="button" onClick={() => onNavigate("purchases")}>
              <span><ArrowUpRight size={14} /> To Pay</span>
              <strong>{formatMoney(payable, 2)}</strong>
            </button>
            <button className="dashboard-metric balance" type="button" onClick={() => onNavigate("cash-bank")}>
              <span><Landmark size={14} /> Total Cash + Bank Balance</span>
              <strong>{formatMoney(bankBalance, 2)}</strong>
            </button>
          </div>

          <div className="dashboard-work-grid">
            <div className="dashboard-main-column">
              <section className="dashboard-section-card tx-card">
                <header>Latest Transactions</header>
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Txn No</th>
                      <th>Party Name</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionRows.map(tx => (
                      <tr key={tx.id} onClick={() => handleTransactionOpen(tx)}>
                        <td>{tx.date}</td>
                        <td>
                          <button type="button" onClick={(event) => { event.stopPropagation(); handleTransactionTypeOpen(tx.type); }}>
                            {tx.type}
                          </button>
                        </td>
                        <td>{tx.txnNo}</td>
                        <td>{tx.partyName}</td>
                        <td>{formatMoney(tx.amount)}</td>
                      </tr>
                    ))}
                    {transactionRows.length === 0 && (
                      <tr className="tx-empty-row">
                        <td colSpan={5}>No transactions found for this tenant.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <button className="see-all-link" onClick={() => onNavigate("reports")} type="button">
                  See All Transactions
                </button>
              </section>

              <section className="dashboard-section-card sales-report-card">
                <header>
                  <span>{salesReportTitle}</span>
                  <label className="dashboard-period-control">
                    <CalendarDays size={14} />
                    <select
                      aria-label="Sales report period"
                      value={salesReportPeriod}
                      onChange={event => setSalesReportPeriod(event.target.value as SalesReportPeriod)}
                    >
                      {salesReportPeriods.map(period => (
                        <option key={period.key} value={period.key}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} />
                  </label>
                </header>
                <div className="dashboard-chart-row">
                  <div className="chart-area">
                    <svg className="svg-chart" viewBox="0 0 680 230" role="img" aria-label="Sales report chart">
                      <defs>
                        <linearGradient id="dashboardChartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#21c553" stopOpacity="0.42" />
                          <stop offset="100%" stopColor="#21c553" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {[30, 60, 90, 120, 150, 180].map(y => (
                        <line key={y} x1="56" y1={y} x2="630" y2={y} stroke="#edf1f6" strokeWidth="1" />
                      ))}
                      {chart.yTicks.map((value, index) => (
                        <text key={`${value}-${index}`} x="48" y={30 + index * 19} fontSize="10" fill="#8a96a8" textAnchor="end">
                          {RUPEE} {value.toLocaleString("en-IN")}
                        </text>
                      ))}
                      <path
                        d={chart.areaPath}
                        fill="url(#dashboardChartGradient)"
                      />
                      <path
                        d={chart.linePath}
                        fill="none"
                        stroke="#20c653"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      {chart.points.map((point, index) => (
                        <circle
                          cx={point.x}
                          cy={point.y}
                          fill="#ffffff"
                          key={`${trend[index]?.label}-${index}`}
                          r="4.5"
                          stroke="#20c653"
                          strokeWidth="2"
                        />
                      ))}
                      {trend.map((row, index) => (
                        <text key={`${row.date}-${row.label}`} x={chart.points[index]?.x || 56} y="216" fontSize="12" fill="#7f8a9c" textAnchor="middle">
                          {row.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                  <div className="chart-stats-panel">
                    <span>{trendSalesLabel}</span>
                    <strong>{formatMoney(trendSales)}</strong>
                    <span>Invoices Made</span>
                    <strong>{trendInvoiceCount}</strong>
                  </div>
                </div>
              </section>

              <section className="dashboard-section-card dashboard-health-card">
                <header>
                  <span>Business Health</span>
                  <small>Owner-level visual summary</small>
                </header>
                <div className="dashboard-health-grid">
                  {businessHealthRows.map(row => (
                    <div key={row.label} className="dashboard-health-row">
                      <div className="dashboard-health-copy">
                        <strong>{row.label}</strong>
                        <span>{row.summary}</span>
                      </div>
                      <div className="dashboard-health-meter">
                        <div className="dashboard-health-track">
                          <span style={{ width: `${Math.max(10, row.value)}%` }} />
                        </div>
                        <b>{Math.round(row.value)}%</b>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="dashboard-section-card checklist-card">
              <header>
                <span>Today's Checklist</span>
                <small>{checklistNeedsAction.length} action{checklistNeedsAction.length === 1 ? "" : "s"} pending</small>
              </header>
              <div className="checklist-actions">
                {checklistRows.map(item => {
                  const normalizedStatus = checklistStatusClass(item.status);
                  const Icon = normalizedStatus === "clear" ? CheckCircle2 : normalizedStatus === "scheduled" ? CircleDot : AlertTriangle;

                  return (
                    <button
                      className={`checklist-action-row ${normalizedStatus} priority-${item.priority}`}
                      key={item.id}
                      onClick={() => onNavigate(item.target)}
                      type="button"
                    >
                      <span className="checklist-action-icon">
                        <Icon size={17} />
                      </span>
                      <span className="checklist-action-main">
                        <strong>{item.label}</strong>
                        <small>{item.description || `${item.count} open item${item.count === 1 ? "" : "s"} - ${item.status}`}</small>
                      </span>
                      <span className="checklist-action-meta">
                        <b>{item.value > 0 ? formatMoney(item.value) : item.count}</b>
                        <em>{item.ctaLabel || item.status}</em>
                      </span>
                    </button>
                  );
                })}
                {checklistRows.length === 0 && (
                  <div className="checklist-empty">
                    <div className="checklist-illustration" aria-hidden="true" />
                    <strong>No pending work</strong>
                    <span>The tenant workspace is synced with Postgres.</span>
                  </div>
                )}
                <small className="checklist-footnote">Parties tracked: {parties.length}</small>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
