import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Keyboard,
  Printer,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Star,
  X
} from "lucide-react";
import {
  getReportExportFile,
  getReportExportHtml,
  getReports,
  shareReport,
  type ReportDirectoryOption,
  type ReportsQuery
} from "../api";
import type { ReportCategory, ReportDefinition } from "../types";

const filterTabs: ReportCategory[] = ["Favourite", "GST", "Transaction", "Item", "Party", "Business"];
const defaultDateRanges = ["Last 365 Days", "This Month", "Last Month", "This Quarter", "Custom"];
type ExportFormat = "csv" | "excel" | "pdf";

const fallbackReports: ReportDefinition[] = [];
/* Removed from runtime: report definitions now load from the tenant Postgres API.
const oldStaticReports: ReportDefinition[] = [
  {
    id: "balance-sheet",
    name: "Balance Sheet",
    category: "Business",
    description: "Assets, liabilities, and capital position for CSM SILKS.",
    metricLabel: "Closing Balance",
    metricValue: `${RUPEE} 7,42,866.13`,
    favourite: true,
    columns: ["Particular", "Debit", "Credit"],
    rows: [
      ["Cash in hand", `${RUPEE} 3,20,089.21`, "-"],
      ["Inventory Stock", `${RUPEE} 13,34,435.26`, "-"],
      ["Sundry Creditors", "-", `${RUPEE} 2,46,708.47`],
      ["Capital Account", "-", `${RUPEE} 14,07,815.99`]
    ]
  },
  {
    id: "profit-loss",
    name: "Profit And Loss Report",
    category: "Business",
    description: "Gross margin and operating result from sale and purchase registers.",
    metricLabel: "Gross Profit",
    metricValue: `${RUPEE} 8,21,604.70`,
    favourite: true,
    columns: ["Particular", "Amount", "Margin"],
    rows: [
      ["Total Sales", `${RUPEE} 25,60,977.94`, "100%"],
      ["Total Purchases", `${RUPEE} 15,53,590.25`, "60.66%"],
      ["Direct Expenses", `${RUPEE} 1,85,782.99`, "7.25%"],
      ["Gross Profit", `${RUPEE} 8,21,604.70`, "32.08%"]
    ]
  },
  {
    id: "sales-summary",
    name: "Sales Summary",
    category: "Transaction",
    description: "Sales invoice totals with paid and unpaid split.",
    metricLabel: "Total Sales",
    metricValue: `${RUPEE} 25,60,977.94`,
    favourite: true,
    columns: ["Date", "Invoice Count", "Taxable", "GST", "Total"],
    rows: [
      ["20 May 2026", "3", `${RUPEE} 13,114`, `${RUPEE} 656`, `${RUPEE} 13,770`],
      ["17 May 2026", "8", `${RUPEE} 14,005`, `${RUPEE} 700`, `${RUPEE} 14,705`],
      ["16 May 2026", "4", `${RUPEE} 8,342`, `${RUPEE} 417`, `${RUPEE} 8,759`]
    ]
  },
  {
    id: "gstr-1",
    name: "GSTR-1 (Sales)",
    category: "GST",
    description: "Outward taxable supplies by invoice and HSN.",
    metricLabel: "Output GST",
    metricValue: `${RUPEE} 1,21,951.33`,
    columns: ["Section", "Taxable Value", "CGST", "SGST"],
    rows: [
      ["B2C Small", `${RUPEE} 12,64,336.12`, `${RUPEE} 31,608.40`, `${RUPEE} 31,608.40`],
      ["HSN 50072010", `${RUPEE} 8,41,052.00`, `${RUPEE} 21,026.30`, `${RUPEE} 21,026.30`],
      ["HSN 52081190", `${RUPEE} 3,33,638.55`, `${RUPEE} 8,340.96`, `${RUPEE} 8,340.96`]
    ]
  },
  {
    id: "gstr-2",
    name: "GSTR-2 (Purchase)",
    category: "GST",
    description: "Purchase-side GST and input tax credit summary.",
    metricLabel: "Input GST",
    metricValue: `${RUPEE} 73,980.49`,
    columns: ["Supplier", "Taxable Value", "CGST", "SGST"],
    rows: [
      ["PAPPAYE TEXTILES", `${RUPEE} 17,879.05`, `${RUPEE} 446.98`, `${RUPEE} 446.98`],
      ["MOORTHY", `${RUPEE} 5,730.48`, `${RUPEE} 143.26`, `${RUPEE} 143.26`],
      ["SUMANGALI SILK CREATION", `${RUPEE} 11,020.00`, `${RUPEE} 275.50`, `${RUPEE} 275.50`]
    ]
  },
  {
    id: "gstr-3b",
    name: "GSTR-3b",
    category: "GST",
    description: "Monthly GST liability snapshot for quick filing review.",
    metricLabel: "Net Payable",
    metricValue: `${RUPEE} 47,970.84`,
    columns: ["Type", "Taxable", "Tax", "Status"],
    rows: [
      ["Outward Supplies", `${RUPEE} 24,39,026.61`, `${RUPEE} 1,21,951.33`, "Ready"],
      ["Input Tax Credit", `${RUPEE} 14,79,609.76`, `${RUPEE} 73,980.49`, "Matched"],
      ["Net Liability", "-", `${RUPEE} 47,970.84`, "Payable"]
    ]
  },
  {
    id: "gst-sales-hsn",
    name: "GST Sales (With HSN)",
    category: "GST",
    description: "HSN-wise taxable sale report.",
    metricLabel: "HSN Lines",
    metricValue: "2",
    columns: ["HSN", "Item Group", "Qty", "Taxable"],
    rows: [
      ["50072010", "Pure Silk Sarees", "42 PCS", `${RUPEE} 8,41,052`],
      ["52081190", "Khadi Cotton", "38 PCS", `${RUPEE} 3,33,638.55`]
    ]
  },
  {
    id: "daybook",
    name: "Daybook",
    category: "Transaction",
    description: "All sale, purchase, and payment transactions by date.",
    metricLabel: "Transactions",
    metricValue: "34",
    columns: ["Date", "Voucher", "Party", "Amount"],
    rows: [
      ["20 May 2026", "Sales Invoice", "PRAVEEN", `${RUPEE} 1,095`],
      ["20 May 2026", "Payment Out", "MOORTHY", `${RUPEE} 6,017`],
      ["19 May 2026", "Purchase Order", "PAPPAYE TEXTILES", `${RUPEE} 42,150`]
    ]
  },
  {
    id: "cash-bank",
    name: "Cash and Bank Report (All Payments)",
    category: "Transaction",
    description: "Cash, bank, UPI, and card movement across vouchers.",
    metricLabel: "Cash Balance",
    metricValue: `${RUPEE} 3,20,089.21`,
    columns: ["Account", "Money In", "Money Out", "Balance"],
    rows: [
      ["Cash in hand", `${RUPEE} 1,746`, `${RUPEE} 6,017`, `${RUPEE} 3,20,089.21`],
      ["AXIS BANK", `${RUPEE} 0`, `${RUPEE} 10,000`, `- ${RUPEE} 9,08,172.57`],
      ["UPI", `${RUPEE} 0`, `${RUPEE} 0`, `${RUPEE} 0`]
    ]
  },
  {
    id: "purchase-summary",
    name: "Purchase Summary",
    category: "Transaction",
    description: "Supplier purchase totals with paid and unpaid split.",
    metricLabel: "Total Purchases",
    metricValue: `${RUPEE} 15,53,590.25`,
    columns: ["Supplier", "Invoices", "Paid", "Unpaid"],
    rows: [
      ["MOORTHY", "5", `${RUPEE} 6,017`, `${RUPEE} 10,522`],
      ["PAPPAYE TEXTILES", "2", `${RUPEE} 10,000`, `${RUPEE} 18,773`],
      ["AJMERA FASHION PRIVATE LIMITED", "1", `${RUPEE} 20,962`, "-"]
    ]
  },
  {
    id: "stock-summary",
    name: "Stock Summary",
    category: "Item",
    description: "Closing stock quantity and stock value by category.",
    metricLabel: "Stock Value",
    metricValue: `${RUPEE} 13,34,435.26`,
    columns: ["Category", "Stock Qty", "Purchase Value", "Selling Value"],
    rows: [
      ["PURE WEDDING SAREES", "1 PCS", `${RUPEE} 7,245`, `${RUPEE} 11,385`],
      ["KHADI COTTON", "0 PCS", `${RUPEE} 4,306`, `${RUPEE} 6,880`],
      ["Soft Silk Saree", "0 PCS", `${RUPEE} 0`, `${RUPEE} 0`]
    ]
  },
  {
    id: "stock-detail",
    name: "Stock Detail Report",
    category: "Item",
    description: "Item-wise stock movement with SKU and HSN details.",
    metricLabel: "Tracked SKUs",
    metricValue: "8",
    columns: ["Item Name", "SKU Code", "Current Stock", "Stock Value"],
    rows: [
      ["BAS|C-GFC6-9ATM00", "210191761827", "1 PCS", `${RUPEE} 6,900`],
      ["GHANTH P|C-B6-1SS5", "207735041989", "0 PCS", `${RUPEE} 0`],
      ["KDI CTN |C-8V-1DH5", "931373864561", "0 PCS", `${RUPEE} 0`]
    ]
  },
  {
    id: "low-stock",
    name: "Low Stock Summary",
    category: "Item",
    description: "Items below configured stock warning levels.",
    metricLabel: "Low Stock Items",
    metricValue: "0",
    badge: "New",
    columns: ["Item", "Current Stock", "Warning Qty", "Status"],
    rows: [
      ["BAS|C-GFC6-9ATM00", "1 PCS", "-", "Healthy"],
      ["GHANTH P|C-B6-1SS5", "0 PCS", "-", "Warning Disabled"],
      ["KDI CTN |C-8V-1DH5", "0 PCS", "-", "Warning Disabled"]
    ]
  },
  {
    id: "party-ledger",
    name: "Party Statement (Ledger)",
    category: "Party",
    description: "Debit and credit movement for selected parties.",
    metricLabel: "Ledger Parties",
    metricValue: "4",
    columns: ["Party", "Opening", "Debit", "Credit"],
    rows: [
      ["PRAVEEN", "-", `${RUPEE} 1,095`, "-"],
      ["SANGEETHA", "-", `${RUPEE} 895`, "-"],
      ["MOORTHY", `- ${RUPEE} 6,017`, "-", `${RUPEE} 6,017`]
    ]
  },
  {
    id: "outstanding",
    name: "Party Wise Outstanding",
    category: "Party",
    description: "Receivables and payables by party.",
    metricLabel: "Net Outstanding",
    metricValue: `${RUPEE} 24,718`,
    columns: ["Party", "Type", "Receivable", "Payable"],
    rows: [
      ["PRAVEEN", "Customer", `${RUPEE} 1,095`, "-"],
      ["SANGEETHA", "Customer", `${RUPEE} 895`, "-"],
      ["PAPPAYE TEXTILES", "Supplier", "-", `${RUPEE} 18,773`]
    ]
  },
  {
    id: "receivable-ageing",
    name: "Receivable Ageing Report",
    category: "Party",
    description: "Customer receivables grouped by overdue bucket.",
    metricLabel: "To Collect",
    metricValue: `${RUPEE} 1,990`,
    columns: ["Bucket", "Parties", "Invoices", "Amount"],
    rows: [
      ["0-30 Days", "2", "2", `${RUPEE} 1,990`],
      ["31-60 Days", "0", "0", "-"],
      ["60+ Days", "0", "0", "-"]
    ]
  }
];
*/

interface ReportsProps {
  onNavigate: (tab: string) => void;
}

export default function Reports({ onNavigate }: ReportsProps) {
  const [activeFilter, setActiveFilter] = useState<ReportCategory>("Favourite");
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState(defaultDateRanges[0]);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [availableDateRanges, setAvailableDateRanges] = useState(defaultDateRanges);
  const [availableParties, setAvailableParties] = useState<ReportDirectoryOption[]>([]);
  const [availableItems, setAvailableItems] = useState<ReportDirectoryOption[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("balance-sheet");
  const [reports, setReports] = useState<ReportDefinition[]>(fallbackReports);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set<string>());
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [isSharingReport, setIsSharingReport] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | "print" | null>(null);
  const [reportPrintPreview, setReportPrintPreview] = useState<{ title: string; html: string } | null>(null);
  const currentFilters = useMemo<ReportsQuery>(() => ({
    dateRange,
    partyId: selectedPartyId || undefined,
    itemId: selectedItemId || undefined,
    from: dateRange === "Custom" ? customFrom : undefined,
    to: dateRange === "Custom" ? customTo : undefined
  }), [customFrom, customTo, dateRange, selectedItemId, selectedPartyId]);

  useEffect(() => {
    let mounted = true;

    setIsLoadingReports(true);
    getReports(currentFilters)
      .then((payload) => {
        if (!mounted) return;
        setReports(payload.reports);
        setAvailableDateRanges(payload.dateRanges.length ? payload.dateRanges : defaultDateRanges);
        setAvailableParties(payload.parties ?? []);
        setAvailableItems(payload.items ?? []);
        setActiveFilters(payload.activeFilters ?? {});
        setFavoriteIds(new Set(payload.reports.filter(report => report.favourite).map(report => report.id)));
        setSelectedReportId(current => payload.reports.some(report => report.id === current) ? current : payload.reports[0]?.id ?? "");
        setLoadError("");
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load reports from Postgres");
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingReports(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [currentFilters]);

  useEffect(() => {
    if (reports.length === 0) return;

    const groupReports = activeFilter === "Favourite"
      ? reports.filter(report => favoriteIds.has(report.id))
      : reports.filter(report => report.category === activeFilter);

    if (groupReports.length > 0 && !groupReports.some(report => report.id === selectedReportId)) {
      setSelectedReportId(groupReports[0].id);
    }
  }, [activeFilter, favoriteIds, reports, selectedReportId]);

  const selectedReport = reports.find(report => report.id === selectedReportId) || reports[0];

  const visibleGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matchesQuery = (report: ReportDefinition) =>
      [report.name, report.description, report.category].join(" ").toLowerCase().includes(normalized);

    const buildGroup = (title: ReportCategory, groupReports: ReportDefinition[]) => ({
      title,
      reports: groupReports.filter(matchesQuery)
    });

    if (activeFilter === "Favourite") {
      return [buildGroup("Favourite", reports.filter(report => favoriteIds.has(report.id)))];
    }

    return [buildGroup(activeFilter, reports.filter(report => report.category === activeFilter))];
  }, [activeFilter, favoriteIds, query, reports]);

  const toggleFavorite = (reportId: string) => {
    setFavoriteIds(current => {
      const next = new Set(current);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  const exportSelectedReport = async (format: ExportFormat) => {
    if (!selectedReport) return;
    setExportingFormat(format);
    setActionNotice("");
    try {
      const { blob, filename } = await getReportExportFile(selectedReport.id, format, currentFilters);
      downloadBlobFile(blob, filename);
      const label = format === "excel" ? "Excel" : format.toUpperCase();
      setActionNotice(`${selectedReport.name} exported as ${label} from backend data.`);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Report export failed.");
    } finally {
      setExportingFormat(null);
    }
  };

  const printSelectedReport = async () => {
    if (!selectedReport) return;
    setExportingFormat("print");
    setActionNotice("");
    try {
      const html = await getReportExportHtml(selectedReport.id, currentFilters);
      setReportPrintPreview({
        title: `${selectedReport.name} Print Preview`,
        html
      });
      setActionNotice(`${selectedReport.name} print preview is ready from backend data.`);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Report print preview failed.");
    } finally {
      setExportingFormat(null);
    }
  };

  const shareSelectedReport = async () => {
    if (!selectedReport) return;
    if (!shareRecipient.trim()) {
      setShareNotice("Enter CA email or mobile before sharing.");
      return;
    }

    setIsSharingReport(true);
    setShareNotice("");
    try {
      const share = await shareReport(selectedReport.id, shareRecipient.trim(), currentFilters);
      await navigator.clipboard?.writeText(buildReportShareText(selectedReport, dateRange, share.recipient));
      setShareNotice(`${share.reportName} share saved in Postgres for ${share.recipient}. Summary copied to clipboard.`);
    } catch (error) {
      setShareNotice(error instanceof Error ? error.message : "Unable to share report from backend.");
    } finally {
      setIsSharingReport(false);
    }
  };

  return (
    <div className="mbb-screen reports-screen">
      <div className="mbb-page-card reports-card reports-workspace-card">
        <div className="mbb-items-header reports-header reports-titlebar">
          <h1>Reports</h1>
          <div className="mbb-header-actions">
            <button className="mbb-primary-btn ca-report-btn" onClick={() => setShowShare(true)} type="button">
              <FileBarChart size={16} />
              CA Reports Sharing
            </button>
            <button className="mbb-icon-btn has-alert" aria-label="Settings" onClick={() => onNavigate("settings")} type="button">
              <Settings2 size={18} />
            </button>
            <button className={`mbb-icon-btn ${showKeyboard ? "active" : ""}`} aria-label="Keyboard shortcuts" onClick={() => setShowKeyboard(current => !current)} type="button">
              <Keyboard size={18} />
            </button>
          </div>
        </div>

        {(showKeyboard || actionNotice || isLoadingReports) && (
          <div className="sales-action-strip reports-action-strip">
            {showKeyboard && <span>Shortcuts: / search, tabs filter reports, star marks favourite, export downloads CSV/PDF/Excel.</span>}
            {isLoadingReports && <span>Refreshing reports for selected filters...</span>}
            {actionNotice && <span>{actionNotice}</span>}
          </div>
        )}

        <div className="reports-filter-row reports-control-row">
          <label className="reports-search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find report"
            />
          </label>
          <div className="reports-filter-tabs">
            {filterTabs.map(filter => (
              <button
                className={activeFilter === filter ? "active" : ""}
                type="button"
                key={filter}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} aria-label="Date range">
            {availableDateRanges.map(range => <option key={range}>{range}</option>)}
          </select>
          {dateRange === "Custom" && (
            <div className="reports-custom-dates">
              <input
                aria-label="From date"
                type="date"
                value={customFrom}
                onChange={event => setCustomFrom(event.target.value)}
              />
              <input
                aria-label="To date"
                type="date"
                value={customTo}
                onChange={event => setCustomTo(event.target.value)}
              />
            </div>
          )}
          <select value={selectedPartyId} onChange={(event) => setSelectedPartyId(event.target.value)} aria-label="Party filter">
            <option value="">All Parties</option>
            {availableParties.map(party => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
          <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)} aria-label="Item filter">
            <option value="">All Items</option>
            {availableItems.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}{item.code ? ` - ${item.code}` : ""}
              </option>
            ))}
          </select>
        </div>

        {Object.keys(activeFilters).length > 0 && (
          <div className="reports-active-filter-row">
            {Object.entries(activeFilters).map(([label, value]) => (
              <span key={label}>
                <strong>{label}</strong>
                {value}
              </span>
            ))}
          </div>
        )}

        <div className="reports-workspace">
          {loadError && (
            <div className="reports-empty reports-api-empty">
              {loadError}
            </div>
          )}
          <section className="reports-groups-panel">
            {visibleGroups.map(group => (
              <div className="reports-group report-list-group" key={group.title}>
                <header>
                  <Sparkles size={16} />
                  <span>{group.title}</span>
                </header>
                <div className="reports-links">
                  {group.reports.length === 0 ? (
                    <div className="reports-empty">No reports matching this filter</div>
                  ) : (
                    group.reports.map(report => (
                      <button
                        className={selectedReport?.id === report.id ? "active" : ""}
                        type="button"
                        key={report.id}
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <span>{report.name}</span>
                        <span className="report-link-meta">
                          {favoriteIds.has(report.id) && <Star size={15} fill="currentColor" />}
                          {report.badge && <b className="report-badge">{report.badge}</b>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>

          {selectedReport ? (
            <ReportPreview
              dateRange={dateRange}
              report={selectedReport}
              favourite={favoriteIds.has(selectedReport.id)}
              onToggleFavourite={() => toggleFavorite(selectedReport.id)}
              exportingFormat={exportingFormat}
              onExport={exportSelectedReport}
              onPrint={printSelectedReport}
              onShare={() => setShowShare(true)}
            />
          ) : (
            <section className="reports-preview-panel">
              <div className="reports-empty">Reports will appear after the tenant API responds.</div>
            </section>
          )}
        </div>
      </div>

      {showShare && (
        <div className="sales-register-modal-backdrop">
          <div className="reports-share-modal">
            <div className="sales-register-modal-header">
              <h2>CA Reports Sharing</h2>
              <button type="button" onClick={() => setShowShare(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="reports-share-body">
              <label>
                <span>CA Email / Mobile</span>
                <input
                  value={shareRecipient}
                  onChange={(event) => {
                    setShareRecipient(event.target.value);
                    setShareNotice("");
                  }}
                  placeholder="Enter email or mobile"
                />
              </label>
              <label>
                <span>Reports Included</span>
                <select defaultValue={selectedReport?.name ?? "All Reports"}>
                  <option>{selectedReport?.name ?? "All Reports"}</option>
                  <option>GST Reports Pack</option>
                  <option>Financial Statements Pack</option>
                  <option>All Reports</option>
                </select>
              </label>
              <div className="reports-share-checks">
                <label><input type="checkbox" defaultChecked /> Allow download</label>
                <label><input type="checkbox" defaultChecked /> Include GST reports</label>
                <label><input type="checkbox" /> Include party phone numbers</label>
              </div>
              {shareNotice && <div className="sales-action-strip reports-share-notice">{shareNotice}</div>}
            </div>
            <div className="sales-register-modal-footer">
              <button className="mbb-bulk-btn" onClick={() => setShowShare(false)} type="button">Cancel</button>
              <button className="mbb-primary-btn" disabled={isSharingReport} onClick={shareSelectedReport} type="button">
                {isSharingReport ? "Sharing..." : "Share Reports"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportPrintPreview && (
        <HtmlPrintPreviewModal
          html={reportPrintPreview.html}
          onClose={() => setReportPrintPreview(null)}
          title={reportPrintPreview.title}
        />
      )}
    </div>
  );
}

function ReportPreview({
  report,
  dateRange,
  favourite,
  exportingFormat,
  onToggleFavourite,
  onExport,
  onPrint,
  onShare
}: {
  report: ReportDefinition;
  dateRange: string;
  favourite: boolean;
  exportingFormat: ExportFormat | "print" | null;
  onToggleFavourite: () => void;
  onExport: (format: ExportFormat) => void | Promise<void>;
  onPrint: () => void | Promise<void>;
  onShare: () => void;
}) {
  const filterEntries = getReportFilterEntries(report, dateRange);
  const visualRows = getReportVisualRows(report);
  const visualMax = Math.max(...visualRows.map(row => row.value), 1);

  return (
    <aside className="reports-preview-panel">
      <div className="reports-preview-header">
        <div>
          <span>{report.category}</span>
          <h2>{report.name}</h2>
          <p>{report.description}</p>
        </div>
        <button className={favourite ? "active" : ""} type="button" onClick={onToggleFavourite} aria-label="Toggle favourite">
          <Star size={18} fill={favourite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="reports-preview-actions">
        <button type="button"><CalendarDays size={16} /> {dateRange} <ChevronDown size={15} /></button>
        <button type="button" disabled={Boolean(exportingFormat)} onClick={() => onExport("csv")}><Download size={16} /> {exportingFormat === "csv" ? "Exporting..." : "CSV"}</button>
        <button type="button" disabled={Boolean(exportingFormat)} onClick={() => onExport("excel")}><FileSpreadsheet size={16} /> {exportingFormat === "excel" ? "Exporting..." : "Excel"}</button>
        <button type="button" disabled={Boolean(exportingFormat)} onClick={() => onExport("pdf")}><FileText size={16} /> {exportingFormat === "pdf" ? "Preparing..." : "PDF"}</button>
        <button type="button" disabled={Boolean(exportingFormat)} onClick={onPrint}><Printer size={16} /> {exportingFormat === "print" ? "Preparing..." : "Print"}</button>
        <button type="button" onClick={onShare}><Share2 size={16} /> Share</button>
      </div>

      <div className="reports-preview-filters">
        {filterEntries.map(([label, value]) => (
          <span key={label}>
            <strong>{label}</strong>
            {value}
          </span>
        ))}
      </div>

      <div className="reports-preview-metrics">
        <span>{report.metricLabel}</span>
        <strong>{report.metricValue}</strong>
      </div>

      <div className="reports-visual-grid">
        <section className="reports-visual-card">
          <header>
            <strong>Quick Summary</strong>
            <span>{report.rowCount || report.rows.length} rows</span>
          </header>
          <div className="reports-summary-strip">
            <div>
              <span>Category</span>
              <strong>{report.category}</strong>
            </div>
            <div>
              <span>Columns</span>
              <strong>{report.columns.length}</strong>
            </div>
            <div>
              <span>Generated</span>
              <strong>{formatGeneratedAt(report.generatedAt)}</strong>
            </div>
          </div>
        </section>

        <section className="reports-visual-card">
          <header>
            <strong>Visual Snapshot</strong>
            <span>Top rows</span>
          </header>
          {visualRows.length > 0 ? (
            <div className="reports-mini-bars">
              {visualRows.map(row => (
                <div key={`${row.label}-${row.value}`} className="reports-mini-bar-row">
                  <div className="reports-mini-bar-copy">
                    <strong>{row.label}</strong>
                    <span>{row.display}</span>
                  </div>
                  <div className="reports-mini-bar-track">
                    <span style={{ width: `${Math.max(12, (row.value / visualMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="reports-visual-empty">No numeric rows available for chart preview.</div>
          )}
        </section>
      </div>

      <div className="reports-preview-table-wrap">
        <table className="reports-preview-table">
          <thead>
            <tr>
              {report.columns.map(column => <th key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, rowIndex) => (
              <tr key={`${report.id}-${rowIndex}`}>
                {row.map((cell, cellIndex) => <td key={`${report.id}-${rowIndex}-${cellIndex}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

function getReportFilterEntries(report: ReportDefinition, dateRange: string) {
  const filters = report.filters ?? {};
  const entries = Object.entries(filters);
  if (entries.length === 0) {
    return [["Date Range", dateRange]];
  }
  if (!entries.some(([label]) => label === "Date Range")) {
    return [["Date Range", dateRange], ...entries];
  }
  return entries;
}

function formatGeneratedAt(value?: string) {
  if (!value) return "Now";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Now"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function parseNumericCell(cell: string) {
  const normalized = cell.replace(/[^0-9.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function getReportVisualRows(report: ReportDefinition) {
  return report.rows
    .map(row => {
      const numericValues = row
        .map(cell => parseNumericCell(String(cell)))
        .filter((value): value is number => value !== null);
      const value = numericValues[0] ?? 0;
      return {
        label: String(row[0] || "Row"),
        value,
        display: row.find(cell => parseNumericCell(String(cell)) !== null) || "-"
      };
    })
    .filter(row => row.value > 0)
    .slice(0, 6);
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildReportShareText(report: ReportDefinition, dateRange: string, recipient: string) {
  return [
    `To: ${recipient.trim()}`,
    `Report: ${report.name}`,
    ...getReportFilterEntries(report, dateRange).map(([label, value]) => `${label}: ${value}`),
    `${report.metricLabel}: ${report.metricValue}`,
    "",
    report.columns.join(" | "),
    ...report.rows.map(row => row.join(" | "))
  ].join("\n");
}

function HtmlPrintPreviewModal({
  html,
  onClose,
  title
}: {
  html: string;
  onClose: () => void;
  title: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  const printPreview = () => {
    frameRef.current?.contentWindow?.focus();
    frameRef.current?.contentWindow?.print();
  };

  return (
    <div className="print-preview-backdrop">
      <div className="print-preview-modal">
        <div className="print-preview-header">
          <h2>{title}</h2>
          <div>
            <button className="mbb-bulk-btn" onClick={onClose} type="button">Close</button>
            <button className="mbb-primary-btn" onClick={printPreview} type="button">
              <Printer size={16} />
              Print
            </button>
          </div>
        </div>
        <iframe className="print-preview-frame" ref={frameRef} srcDoc={html} title={title} />
      </div>
    </div>
  );
}
