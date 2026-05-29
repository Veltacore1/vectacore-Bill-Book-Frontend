import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  FileBarChart,
  Landmark,
  Package,
  ReceiptText,
  RefreshCw,
  Settings2,
  Users
} from "lucide-react";
import type { DashboardData, Party, SalesInvoice, TransactionRow } from "../types";

interface DashboardProps {
  stats: {
    totalSales: number;
    receivable: number;
    payable: number;
    inventoryVal: number;
  };
  invoices: SalesInvoice[];
  parties: Party[];
  transactions: TransactionRow[];
  dashboard: DashboardData;
  setActiveTab: (tab: string) => void;
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

export default function Dashboard({
  stats,
  invoices,
  parties,
  transactions,
  dashboard,
  setActiveTab,
  onNavigateToInvoice,
  onRefresh
}: DashboardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const trend = dashboard.salesTrend.length
    ? dashboard.salesTrend
    : Array.from({ length: 7 }, (_, index) => ({
        date: "",
        label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index],
        sales: 0,
        invoiceCount: 0
      }));
  const salesReportTitle =
    dashboard.salesTrend.length > 0
      ? `Sales Report - ${formatReportDate(dashboard.salesTrend[0].date)} to ${formatReportDate(dashboard.salesTrend[dashboard.salesTrend.length - 1].date)}`
      : "Sales Report";
  const chart = useMemo(() => {
    const maxSales = Math.max(...trend.map(row => row.sales), 1);
    const points = trend.map((row, index) => {
      const x = 56 + index * (574 / Math.max(trend.length - 1, 1));
      const y = 180 - (row.sales / maxSales) * 142;
      return { x, y };
    });
    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} 196 L ${points[0].x.toFixed(1)} 196 Z` : "";
    const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((maxSales / 5) * (5 - index)));
    return { areaPath, linePath, yTicks };
  }, [trend]);
  const trendSales = trend.reduce((total, row) => total + row.sales, 0);
  const trendInvoiceCount = trend.reduce((total, row) => total + row.invoiceCount, 0);

  const handleTransactionOpen = (tx: TransactionRow) => {
    const type = tx.type.toLowerCase();
    if (type.includes("sales")) {
      onNavigateToInvoice(tx.id);
      return;
    }
    if (type.includes("purchase")) {
      setActiveTab("purchases");
      return;
    }
    if (type.includes("payment in")) {
      setActiveTab("payment-in");
      return;
    }
    if (type.includes("payment out")) {
      setActiveTab("payment-out");
      return;
    }
    if (type.includes("expense")) {
      setActiveTab("expenses");
      return;
    }
    setActiveTab("reports");
  };

  const handleTransactionTypeOpen = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes("purchase")) setActiveTab("purchases");
    else if (lowerType.includes("payment in")) setActiveTab("payment-in");
    else if (lowerType.includes("payment out")) setActiveTab("payment-out");
    else if (lowerType.includes("expense")) setActiveTab("expenses");
    else setActiveTab("sales-invoices");
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
    { label: "Parties", tab: "parties", icon: Users },
    { label: "Items", tab: "items", icon: Package },
    { label: "Sales Invoices", tab: "sales-invoices", icon: ReceiptText },
    { label: "Reports", tab: "reports", icon: FileBarChart },
    { label: "Cash and Bank", tab: "cash-bank", icon: Landmark },
    { label: "Settings", tab: "settings", icon: Settings2 }
  ];

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
                  key={action.tab}
                  aria-label={`Open ${action.label}`}
                  onClick={() => setActiveTab(action.tab)}
                  title={action.label}
                  type="button"
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>

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
            <button className="dashboard-metric collect" type="button" onClick={() => setActiveTab("parties")}>
              <span><ArrowDownLeft size={14} /> To Collect</span>
              <strong>{formatMoney(receivable, 2)}</strong>
            </button>
            <button className="dashboard-metric pay" type="button" onClick={() => setActiveTab("purchases")}>
              <span><ArrowUpRight size={14} /> To Pay</span>
              <strong>{formatMoney(payable, 2)}</strong>
            </button>
            <button className="dashboard-metric balance" type="button" onClick={() => setActiveTab("cash-bank")}>
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
                <button className="see-all-link" onClick={() => setActiveTab("reports")} type="button">
                  See All Transactions
                </button>
              </section>

              <section className="dashboard-section-card sales-report-card">
                <header>
                  <span>{salesReportTitle}</span>
                  <button onClick={() => setActiveTab("reports")} type="button">
                    <CalendarDays size={14} />
                    Daily
                  </button>
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
                      {trend.map((row, index) => (
                        <text key={`${row.date}-${row.label}`} x={56 + index * (574 / Math.max(trend.length - 1, 1))} y="216" fontSize="12" fill="#7f8a9c" textAnchor="middle">
                          {row.label}
                        </text>
                      ))}
                    </svg>
                  </div>
                  <div className="chart-stats-panel">
                    <span>Last 7 days sales</span>
                    <strong>{formatMoney(trendSales)}</strong>
                    <span>Invoices Made</span>
                    <strong>{trendInvoiceCount}</strong>
                  </div>
                </div>
              </section>
            </div>

            <section className="dashboard-section-card checklist-card">
              <header>Today's Checklist</header>
              <div className="checklist-actions">
                {dashboard.checklist.map(item => (
                  <button
                    className={`checklist-action-row ${item.status.toLowerCase()}`}
                    key={item.id}
                    onClick={() => setActiveTab(item.target)}
                    type="button"
                  >
                    <span className="checklist-action-main">
                      <strong>{item.label}</strong>
                      <small>{item.count} open item{item.count === 1 ? "" : "s"} · {item.status}</small>
                    </span>
                    <span className="checklist-action-meta">
                      {item.value > 0 ? formatMoney(item.value) : item.count}
                    </span>
                  </button>
                ))}
                {dashboard.checklist.length === 0 && (
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
