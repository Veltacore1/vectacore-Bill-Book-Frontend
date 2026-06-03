import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  Keyboard,
  MoreVertical,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Send,
  Settings2,
  Share2,
  X
} from "lucide-react";
import {
  createCreditNote,
  createDeliveryChallan,
  createPaymentIn,
  createProformaInvoice,
  createQuotation,
  createSalesReturn,
  cancelSalesVoucher,
  convertSalesVoucherToInvoice,
  getSalesPaymentReceipt,
  getSalesPaymentReceiptHtml,
  getSalesPaymentReceiptShareText,
  updateSalesVoucher
} from "../api";
import type { PaymentReceiptDetails } from "../api";
import type { Item, Party, SalesInvoice, SalesRegisterDataRow } from "../types";

export type SalesRegisterView =
  | "quotation"
  | "payment-in"
  | "sales-return"
  | "credit-note"
  | "delivery-challan"
  | "proforma-invoice";

type ColumnKey =
  | "date"
  | "number"
  | "party"
  | "item"
  | "qty"
  | "amount"
  | "settled"
  | "received"
  | "mode"
  | "linked"
  | "validTill"
  | "status";

type RegisterConfig = {
  title: string;
  primaryLabel: string;
  numberLabel: string;
  documentLabel: string;
  prefix: string;
  baseNumber: number;
  searchPlaceholder: string;
  emptyText: string;
  defaultStatus: string;
  showReports?: boolean;
  convertAction?: string;
};

type SalesRegisterRow = SalesRegisterDataRow;
/*
type SalesRegisterRow = {
  id: string;
  date: string;
  number: string;
  partyName: string;
  itemName: string;
  qty: number;
  amount: number;
  settledAmount: number;
  receivedAmount: number;
  paymentMode: string;
  linkedVoucher: string;
  validTill: string;
  status: string;
  notes: string;
};
*/

type SalesRegisterDraft = {
  partyId: string;
  itemId: string;
  qty: number;
  amount: number;
  date: string;
  validTill: string;
  paymentMode: string;
  linkedVoucher: string;
  settlementInvoiceId: string;
  notes: string;
};

type LifecycleEditDraft = {
  linkedVoucher: string;
  validTill: string;
  notes: string;
};

interface SalesRegistersProps {
  view: SalesRegisterView;
  parties: Party[];
  items: Item[];
  invoices: SalesInvoice[];
  initialRows: Record<SalesRegisterView, SalesRegisterRow[]>;
  autoCreateToken?: number;
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
}

const RUPEE = "\u20b9";
const currentDate = new Date().toLocaleDateString("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});
const displayDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const configs: Record<SalesRegisterView, RegisterConfig> = {
  quotation: {
    title: "Quotation / Estimate",
    primaryLabel: "Create Quotation",
    numberLabel: "Quotation Number",
    documentLabel: "Estimate",
    prefix: "EST",
    baseNumber: 142,
    searchPlaceholder: "Search by estimate number or party name",
    emptyText: "No Estimates Matching the current filter",
    defaultStatus: "Open",
    showReports: true,
    convertAction: "Convert to Sales Invoice"
  },
  "payment-in": {
    title: "Payment In",
    primaryLabel: "Create Payment In",
    numberLabel: "Payment Number",
    documentLabel: "Payment Receipt",
    prefix: "REC",
    baseNumber: 58,
    searchPlaceholder: "Search by payment number or party name",
    emptyText: "No Transactions Matching the current filter",
    defaultStatus: "Received"
  },
  "sales-return": {
    title: "Sales Return",
    primaryLabel: "Create Sales Return",
    numberLabel: "Return Number",
    documentLabel: "Sales Return",
    prefix: "SR",
    baseNumber: 17,
    searchPlaceholder: "Search by return number or party name",
    emptyText: "No Sales Returns Matching the current filter",
    defaultStatus: "Pending Refund",
    showReports: true
  },
  "credit-note": {
    title: "Credit Note",
    primaryLabel: "Create Credit Note",
    numberLabel: "Credit Note Number",
    documentLabel: "Credit Note",
    prefix: "CN",
    baseNumber: 21,
    searchPlaceholder: "Search by credit note number or party name",
    emptyText: "No Credit Notes Matching the current filter",
    defaultStatus: "Issued",
    showReports: true
  },
  "delivery-challan": {
    title: "Delivery Challan",
    primaryLabel: "Create Delivery Challan",
    numberLabel: "Challan Number",
    documentLabel: "Delivery Challan",
    prefix: "DC",
    baseNumber: 33,
    searchPlaceholder: "Search by challan number or party name",
    emptyText: "No Delivery Challans Matching the current filter",
    defaultStatus: "Open",
    showReports: true,
    convertAction: "Create Invoice from Challan"
  },
  "proforma-invoice": {
    title: "Proforma Invoice",
    primaryLabel: "Create Proforma Invoice",
    numberLabel: "Proforma Number",
    documentLabel: "Proforma Invoice",
    prefix: "PF",
    baseNumber: 11,
    searchPlaceholder: "Search by proforma number or party name",
    emptyText: "No Proforma Invoices Matching the current filter",
    defaultStatus: "Open",
    showReports: true,
    convertAction: "Convert to Sales Invoice"
  }
};

const columnsByView: Record<SalesRegisterView, ColumnKey[]> = {
  quotation: ["date", "number", "party", "validTill", "amount", "status"],
  "payment-in": ["date", "number", "party", "settled", "received", "mode"],
  "sales-return": ["date", "number", "party", "linked", "amount", "status"],
  "credit-note": ["date", "number", "party", "linked", "amount", "status"],
  "delivery-challan": ["date", "number", "party", "amount", "status"],
  "proforma-invoice": ["date", "number", "party", "validTill", "amount", "status"]
};

const columnLabels: Record<ColumnKey, string> = {
  date: "Date",
  number: "Number",
  party: "Party Name",
  item: "Item Name",
  qty: "Stock QTY",
  amount: "Amount",
  settled: "Total Amount Settled",
  received: "Amount Received",
  mode: "Payment Mode",
  linked: "Linked Invoice",
  validTill: "Valid Till",
  status: "Status"
};

function openFilterLabel(view: SalesRegisterView) {
  if (view === "quotation") return "Show Open Quotation";
  if (view === "delivery-challan") return "Show Open Challans";
  if (view === "proforma-invoice") return "Show Open Invoices";
  return "Show Open";
}

export default function SalesRegisters({
  view,
  parties,
  items,
  invoices,
  initialRows,
  autoCreateToken,
  onNavigate,
  onWorkspaceRefresh
}: SalesRegistersProps) {
  const [rowsByView, setRowsByView] = useState<Record<SalesRegisterView, SalesRegisterRow[]>>(initialRows);
  const [query, setQuery] = useState("");
  const [showOpenOnly, setShowOpenOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showBulkSummary, setShowBulkSummary] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => createDraft(view, parties, items));
  const [syncNotice, setSyncNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<SalesRegisterRow | null>(null);
  const [editDraft, setEditDraft] = useState<LifecycleEditDraft>({ linkedVoucher: "", validTill: "", notes: "" });
  const createContextRef = useRef({ view, parties, items });

  const config = configs[view];
  const rows = rowsByView[view];
  const columns = columnsByView[view];

  useEffect(() => {
    setRowsByView(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setQuery("");
    setShowOpenOnly(false);
    setShowCreate(false);
    setShowKeyboard(false);
    setShowBulkSummary(false);
    setSelectedId(null);
    setSyncNotice("");
    setActionMenuId(null);
    setBusyActionId(null);
    setEditRow(null);
    setDraft(createDraft(view, parties, items));
  }, [view, parties, items]);

  useEffect(() => {
    createContextRef.current = { view, parties, items };
  }, [view, parties, items]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const visibleRows = showOpenOnly
      ? rows.filter(row => statusClass(row.status) === "open")
      : rows;

    if (!normalized) {
      return visibleRows;
    }

    return visibleRows.filter(row =>
      [row.number, row.partyName, row.itemName, row.status, row.linkedVoucher]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, rows, showOpenOnly]);

  const selectedRow = selectedId ? rows.find(row => row.id === selectedId) || null : null;
  const summary = getSummary(view, rows);
  const openSalesInvoices = useMemo(() => {
    if (view !== "payment-in") return [];
    return invoices.filter(invoice =>
      invoice.party.id === draft.partyId &&
      !["paid", "cancelled"].includes(String(invoice.status).toLowerCase()) &&
      invoice.total > invoice.paidAmount
    );
  }, [draft.partyId, invoices, view]);

  const openCreate = () => {
    setDraft(createDraft(view, parties, items));
    setShowCreate(true);
  };

  useEffect(() => {
    if (!autoCreateToken) return;
    const context = createContextRef.current;
    setDraft(createDraft(context.view, context.parties, context.items));
    setShowCreate(true);
  }, [autoCreateToken]);

  const handleDraftChange = <Key extends keyof SalesRegisterDraft>(
    key: Key,
    value: SalesRegisterDraft[Key]
  ) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

    const party = parties.find(entry => entry.id === draft.partyId);
    const item = items.find(entry => entry.id === draft.itemId);
    const amount = Math.max(0, Number(draft.amount) || 0);
    const qty = Math.max(1, Number(draft.qty) || 1);
    const isPaymentIn = view === "payment-in";

    if (!party) {
      setSyncNotice("Select a customer before saving.");
      return;
    }
    if (!isPaymentIn && !item) {
      setSyncNotice("Select an inventory item before saving.");
      return;
    }

    try {
      setIsSaving(true);
      setSyncNotice("");

      const input = {
        partyId: party.id,
        item,
        quantity: qty,
        amount,
        paymentMode: draft.paymentMode,
        linkedVoucher: draft.linkedVoucher,
        settlementInvoiceId: draft.settlementInvoiceId,
        validTill: draft.validTill,
        notes: draft.notes
      };

      let savedRow: SalesRegisterRow;
      if (view === "payment-in") {
        savedRow = await createPaymentIn(input);
      } else if (view === "sales-return") {
        savedRow = await createSalesReturn(input);
      } else if (view === "credit-note") {
        savedRow = await createCreditNote(input);
      } else if (view === "delivery-challan") {
        savedRow = await createDeliveryChallan(input);
      } else if (view === "proforma-invoice") {
        savedRow = await createProformaInvoice(input);
      } else {
        savedRow = await createQuotation(input);
      }

      const rowWithFallbacks = {
        ...savedRow,
        partyName: savedRow.partyName || party.name.toUpperCase(),
        itemName: savedRow.itemName || item?.name || "Counter Sale Settlement",
        linkedVoucher: savedRow.linkedVoucher === "-" && draft.linkedVoucher ? draft.linkedVoucher : savedRow.linkedVoucher,
        validTill: savedRow.validTill === "-" && draft.validTill ? draft.validTill : savedRow.validTill,
        status: savedRow.status || config.defaultStatus
      };

      setRowsByView(current => ({
        ...current,
        [view]: [rowWithFallbacks, ...current[view].filter(row => row.id !== rowWithFallbacks.id)]
      }));
      setSelectedId(rowWithFallbacks.id);
      setShowCreate(false);
      await onWorkspaceRefresh?.();
      setSyncNotice(`${config.documentLabel} saved to Postgres.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be saved.`);
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (row: SalesRegisterRow) => {
    setEditRow(row);
    setEditDraft({
      linkedVoucher: row.linkedVoucher === "-" ? "" : row.linkedVoucher,
      validTill: row.validTill === "-" ? "" : row.validTill,
      notes: row.notes || ""
    });
    setActionMenuId(null);
  };

  const handleEditSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!editRow) return;

    try {
      setIsSaving(true);
      setSyncNotice("");
      await updateSalesVoucher({
        view,
        id: editRow.id,
        linkedVoucher: editDraft.linkedVoucher,
        validTill: editDraft.validTill,
        notes: editDraft.notes
      });
      setRowsByView(current => ({
        ...current,
        [view]: current[view].map(row => row.id === editRow.id ? {
          ...row,
          notes: editDraft.notes,
          linkedVoucher: editDraft.linkedVoucher || row.linkedVoucher,
          validTill: editDraft.validTill || row.validTill
        } : row)
      }));
      await onWorkspaceRefresh?.();
      setEditRow(null);
      setSyncNotice(`${config.documentLabel} updated in Postgres.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be updated.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelVoucher = async (row: SalesRegisterRow) => {
    const actionLabel = view === "payment-in" ? "void" : "cancel";
    if (!window.confirm(`${actionLabel === "void" ? "Void" : "Cancel"} ${config.documentLabel} ${row.number}?`)) {
      return;
    }

    try {
      setBusyActionId(row.id);
      setSyncNotice("");
      await cancelSalesVoucher({
        view,
        id: row.id,
        reason: `${config.documentLabel} ${actionLabel}led from register workspace`
      });
      setRowsByView(current => ({
        ...current,
        [view]: view === "payment-in"
          ? current[view].map(entry => entry.id === row.id ? { ...entry, status: "Void", settledAmount: 0 } : entry)
          : current[view].map(entry => entry.id === row.id ? { ...entry, status: "Cancelled" } : entry)
      }));
      await onWorkspaceRefresh?.();
      setSyncNotice(`${config.documentLabel} ${actionLabel}led in Postgres.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be ${actionLabel}led.`);
    } finally {
      setBusyActionId(null);
      setActionMenuId(null);
    }
  };

  const handleConvertVoucher = async (row: SalesRegisterRow) => {
    if (isClosedVoucher(row.status)) {
      setSyncNotice(`${config.documentLabel} ${row.number} is already ${row.status.toLowerCase()}.`);
      setActionMenuId(null);
      return;
    }

    try {
      setBusyActionId(row.id);
      setSyncNotice("");
      const invoice = await convertSalesVoucherToInvoice(view, row.id);
      setRowsByView(current => ({
        ...current,
        [view]: current[view].map(entry => entry.id === row.id ? {
          ...entry,
          status: "Converted",
          linkedVoucher: invoice.invoiceNumber,
          convertedInvoiceId: invoice.id
        } : entry)
      }));
      await onWorkspaceRefresh?.();
      setSelectedId(row.id);
      setSyncNotice(`${row.number} converted to sales invoice ${invoice.invoiceNumber}.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be converted.`);
    } finally {
      setBusyActionId(null);
      setActionMenuId(null);
    }
  };

  return (
    <div className="mbb-screen sales-register-screen">
      <div className="mbb-page-card sales-register-card">
        <div className="mbb-items-header sales-register-header">
          <h1>{config.title}</h1>
          <div className="mbb-header-actions">
            {config.showReports && (
              <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
                <FileBarChart size={16} />
                Reports
                <ChevronDown size={15} />
              </button>
            )}
            <button className="mbb-icon-btn has-alert" aria-label="Settings" onClick={() => onNavigate("settings")} type="button">
              <Settings2 size={18} />
            </button>
            <button className={`mbb-icon-btn ${showKeyboard ? "active" : ""}`} aria-label="Keyboard shortcuts" onClick={() => setShowKeyboard(current => !current)} type="button">
              <Keyboard size={18} />
            </button>
          </div>
        </div>

        {view !== "payment-in" && (
          <div className="sales-stat-grid sales-register-stat-grid">
            {summary.map(stat => (
              <div className={`sales-stat-card ${stat.accent}`} key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        )}

        {syncNotice && (
          <div className="tenant-api-banner">
            <strong>Postgres sync</strong>
            <span>{syncNotice}</span>
          </div>
        )}

        {(showKeyboard || showBulkSummary) && (
          <div className="sales-action-strip">
            {showKeyboard && <span>Shortcuts: / search, Enter opens details, Ctrl+N creates the current sales document.</span>}
            {showBulkSummary && (
              <span>
                {filteredRows.length} visible rows. Total value {formatMoney(filteredRows.reduce((total, row) => total + row.amount, 0))}.
              </span>
            )}
          </div>
        )}

        <div className="sales-toolbar sales-register-toolbar">
          <label className="sales-register-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={config.searchPlaceholder}
            />
          </label>
          <button className="sales-filter-btn" type="button">
            <CalendarDays size={18} />
            Last 365 Days
            <ChevronDown size={17} />
          </button>
          {config.convertAction && (
            <button
              className={`sales-filter-btn sales-open-filter-btn ${showOpenOnly ? "is-active" : ""}`}
              onClick={() => setShowOpenOnly(current => !current)}
              type="button"
            >
              <span>{openFilterLabel(view)}</span>
              <ChevronDown size={17} />
            </button>
          )}
          <div className="sales-toolbar-spacer" />
          {view !== "payment-in" && (
            <button className="mbb-bulk-btn sales-bulk-btn" onClick={() => setShowBulkSummary(current => !current)} type="button">
              <ClipboardList size={18} />
              Bulk Actions
              <ChevronDown size={17} />
            </button>
          )}
          <button className="mbb-primary-btn sales-register-primary" onClick={openCreate} type="button">
            {config.primaryLabel}
          </button>
        </div>

        <div className={`sales-table-wrap sales-register-table-wrap ${view === "payment-in" ? "is-empty-ledger" : ""}`}>
          <table className="sales-table sales-register-table">
            <thead>
              <tr>
                <th className="sales-check-cell" />
                {columns.map(column => (
                  <th key={column}>
                    <span className="mbb-sort-label">
                      {column === "number" ? config.numberLabel : columnLabels[column]}
                      {(column === "date" || column === "amount") && <ChevronDown size={15} />}
                    </span>
                  </th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr className="sales-register-empty-row">
                  <td colSpan={columns.length + 2}>
                    <div className="sales-register-empty-state">
                      <ReceiptText size={50} />
                      <span>{config.emptyText}</span>
                      <button type="button" onClick={openCreate}>
                        <Plus size={15} />
                        {config.primaryLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map(row => (
                  <tr key={row.id} onClick={() => setSelectedId(row.id)}>
                    <td className="sales-check-cell">
                      <button
                        className="mbb-checkbox"
                        aria-label={`Select ${row.number}`}
                        onClick={event => event.stopPropagation()}
                        type="button"
                      />
                    </td>
                    {columns.map(column => (
                      <td key={`${row.id}-${column}`}>{renderCell(column, row)}</td>
                    ))}
                    <td>
                      <div className="voucher-row-action">
                        <button
                          className="mbb-row-menu"
                          aria-label={`More actions for ${row.number}`}
                          aria-expanded={actionMenuId === row.id}
                          onClick={event => {
                            event.stopPropagation();
                            setActionMenuId(current => current === row.id ? null : row.id);
                          }}
                          type="button"
                        >
                          <MoreVertical size={19} />
                        </button>
                        {actionMenuId === row.id && (
                          <div className="voucher-action-menu" onClick={event => event.stopPropagation()}>
                            <button type="button" onClick={() => openEdit(row)} disabled={busyActionId === row.id}>
                              Edit
                            </button>
                            {config.convertAction && (
                              <button type="button" onClick={() => handleConvertVoucher(row)} disabled={busyActionId === row.id || isClosedVoucher(row.status)}>
                                {busyActionId === row.id ? "Working..." : config.convertAction}
                              </button>
                            )}
                            <button className="danger" type="button" onClick={() => handleCancelVoucher(row)} disabled={busyActionId === row.id}>
                              {view === "payment-in" ? "Void" : "Cancel"}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <button className="mbb-help-bubble" aria-label="Help" onClick={() => onNavigate("settings")} type="button">
          ?
        </button>

        {selectedRow && (
          <SalesRegisterDrawer
            config={config}
            row={selectedRow}
            view={view}
            onClose={() => setSelectedId(null)}
            onConvert={() => handleConvertVoucher(selectedRow)}
            actionSaving={busyActionId === selectedRow.id}
            onNotice={setSyncNotice}
          />
        )}
      </div>

      {showCreate && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal" onSubmit={handleSave}>
            <div className="sales-register-modal-header">
              <h2>{config.primaryLabel}</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="sales-register-form-grid">
              <label>
                <span>Party Name</span>
                <select
                  required
                  value={draft.partyId}
                  onChange={(event) => {
                    handleDraftChange("partyId", event.target.value);
                    handleDraftChange("settlementInvoiceId", "");
                  }}
                >
                  {parties.map(party => (
                    <option key={party.id} value={party.id}>{party.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{config.documentLabel} Date</span>
                <input
                  required
                  value={draft.date}
                  onChange={(event) => handleDraftChange("date", event.target.value)}
                />
              </label>

              {view === "payment-in" ? (
                <>
                  <label>
                    <span>Amount Received</span>
                    <input
                      required
                      type="number"
                      min="0"
                      value={draft.amount}
                      onChange={(event) => handleDraftChange("amount", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Payment Mode</span>
                    <select
                      value={draft.paymentMode}
                      onChange={(event) => handleDraftChange("paymentMode", event.target.value)}
                    >
                      <option>Cash</option>
                      <option>UPI</option>
                      <option>Bank Transfer</option>
                      <option>Card</option>
                    </select>
                  </label>
                  <label className="wide">
                    <span>Settle Against</span>
                    <select
                      value={draft.settlementInvoiceId}
                      onChange={(event) => handleDraftChange("settlementInvoiceId", event.target.value)}
                    >
                      <option value="">Auto FIFO settlement</option>
                      {openSalesInvoices.map(invoice => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - {formatMoney(Math.max(0, invoice.total - invoice.paidAmount))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    <span>Reference Number</span>
                    <input
                      value={draft.linkedVoucher}
                      onChange={(event) => handleDraftChange("linkedVoucher", event.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span>Item Name</span>
                    <select
                      required
                      value={draft.itemId}
                      onChange={(event) => {
                        const item = items.find(entry => entry.id === event.target.value);
                        handleDraftChange("itemId", event.target.value);
                        handleDraftChange("amount", item?.price || draft.amount);
                      }}
                    >
                      {items.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Quantity</span>
                    <input
                      required
                      type="number"
                      min="1"
                      value={draft.qty}
                      onChange={(event) => handleDraftChange("qty", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Amount</span>
                    <input
                      required
                      type="number"
                      min="0"
                      value={draft.amount}
                      onChange={(event) => handleDraftChange("amount", Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>{view === "sales-return" || view === "credit-note" ? "Linked Invoice" : "Valid Till"}</span>
                    <input
                      value={view === "sales-return" || view === "credit-note" ? draft.linkedVoucher : draft.validTill}
                      onChange={(event) => {
                        if (view === "sales-return" || view === "credit-note") {
                          handleDraftChange("linkedVoucher", event.target.value);
                        } else {
                          handleDraftChange("validTill", event.target.value);
                        }
                      }}
                    />
                  </label>
                </>
              )}

              <label className="wide">
                <span>Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => handleDraftChange("notes", event.target.value)}
                  placeholder="Add description or terms"
                />
              </label>
            </div>

            <div className="sales-register-modal-summary">
              <span>Total</span>
              <strong>{formatMoney(Number(draft.amount) || 0)}</strong>
            </div>

            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="mbb-primary-btn" disabled={isSaving}>
                {isSaving ? "Saving..." : `Save ${config.documentLabel}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {editRow && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal voucher-edit-modal" onSubmit={handleEditSave}>
            <div className="sales-register-modal-header">
              <h2>Edit {config.documentLabel}</h2>
              <button type="button" onClick={() => setEditRow(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="sales-register-form-grid">
              {(view === "payment-in" || view === "sales-return" || view === "credit-note") && (
                <label className="wide">
                  <span>{view === "payment-in" ? "Reference Number" : "Linked Invoice"}</span>
                  <input
                    value={editDraft.linkedVoucher}
                    onChange={(event) => setEditDraft(current => ({ ...current, linkedVoucher: event.target.value }))}
                  />
                </label>
              )}
              {(view === "quotation" || view === "proforma-invoice") && (
                <label className="wide">
                  <span>Valid Till</span>
                  <input
                    value={editDraft.validTill}
                    onChange={(event) => setEditDraft(current => ({ ...current, validTill: event.target.value }))}
                  />
                </label>
              )}
              {view !== "proforma-invoice" && (
                <label className="wide">
                  <span>{view === "sales-return" || view === "credit-note" ? "Reason" : "Notes"}</span>
                  <textarea
                    value={editDraft.notes}
                    onChange={(event) => setEditDraft(current => ({ ...current, notes: event.target.value }))}
                  />
                </label>
              )}
            </div>

            <div className="sales-register-modal-footer">
              <button type="button" className="mbb-bulk-btn" onClick={() => setEditRow(null)}>
                Cancel
              </button>
              <button type="submit" className="mbb-primary-btn" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SalesRegisterDrawer({
  config,
  row,
  view,
  onClose,
  onConvert,
  actionSaving,
  onNotice
}: {
  config: RegisterConfig;
  row: SalesRegisterRow;
  view: SalesRegisterView;
  onClose: () => void;
  onConvert: () => void;
  actionSaving: boolean;
  onNotice: (message: string) => void;
}) {
  const [receiptDetails, setReceiptDetails] = useState<PaymentReceiptDetails | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [shareText, setShareText] = useState("");

  useEffect(() => {
    if (view !== "payment-in") {
      setReceiptDetails(null);
      return;
    }

    let isActive = true;
    setReceiptLoading(true);
    setReceiptDetails({
      settlements: row.settlements || [],
      isAdvance: Boolean(row.isAdvance),
      status: row.status,
      cancellationReason: row.cancellationReason || "",
      referenceNumber: row.linkedVoucher,
      notes: row.notes || ""
    });

    getSalesPaymentReceipt(row.id)
      .then(details => {
        if (isActive) setReceiptDetails(details);
      })
      .catch(error => {
        if (isActive) {
          onNotice(error instanceof Error ? error.message : "Payment receipt details could not be loaded.");
        }
      })
      .finally(() => {
        if (isActive) setReceiptLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [view, row.id, row.settlements, row.isAdvance, row.status, row.cancellationReason, row.linkedVoucher, row.notes, onNotice]);

  const handlePrint = async () => {
    try {
      const html = view === "payment-in"
        ? await getSalesPaymentReceiptHtml(row.id)
        : buildVoucherHtml({
          title: config.documentLabel,
          numberLabel: config.numberLabel,
          row,
          view,
          receiptDetails
        });
      const opened = openPrintableDocument(`${config.documentLabel} ${row.number}`, html);
      onNotice(opened ? `${config.documentLabel} print preview opened from Postgres receipt data.` : "Allow pop-ups to open the print preview.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : `${config.documentLabel} print preview could not be opened.`);
    }
  };

  const handleShare = async () => {
    let text = "";
    try {
      text = view === "payment-in"
        ? await getSalesPaymentReceiptShareText(row.id)
        : buildVoucherShareText({
          title: config.documentLabel,
          numberLabel: config.numberLabel,
          row,
          view,
          receiptDetails
        });
      if ("share" in navigator && typeof navigator.share === "function") {
        await navigator.share({ title: `${config.documentLabel} ${row.number}`, text });
      } else {
        await navigator.clipboard?.writeText(text);
      }
      setShareText("");
      onNotice(`${config.documentLabel} share text prepared.`);
    } catch (error) {
      setShareText(text);
      onNotice(error instanceof Error ? "Clipboard was blocked. Share text is ready below." : `${config.documentLabel} share text is ready below.`);
    }
  };

  return (
    <aside className="sales-register-drawer" aria-label={`${config.documentLabel} details`}>
      <div className="sales-register-drawer-head">
        <div>
          <span>{config.documentLabel}</span>
          <strong>{row.number}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details">
          <X size={20} />
        </button>
      </div>

      <div className="sales-register-drawer-actions">
        <button type="button" onClick={handlePrint}><Printer size={16} /> Print</button>
        <button type="button" onClick={handleShare}><Share2 size={16} /> Share</button>
        {config.convertAction && (
          <button className="primary" type="button" onClick={onConvert} disabled={actionSaving || isClosedVoucher(row.status)}>
            <Send size={16} />
            {actionSaving ? "Working..." : config.convertAction}
          </button>
        )}
      </div>

      <div className="sales-register-detail-list">
        <DetailRow label="Party Name" value={row.partyName} />
        <DetailRow label="Date" value={row.date} />
        <DetailRow label={config.numberLabel} value={row.number} />
        {view === "payment-in" ? (
          <>
            <DetailRow label="Amount Received" value={formatMoney(row.receivedAmount)} />
            <DetailRow label="Payment Mode" value={row.paymentMode} />
            <DetailRow label="Reference Number" value={receiptDetails?.referenceNumber || row.linkedVoucher} />
          </>
        ) : (
          <>
            <DetailRow label="Item Name" value={row.itemName} />
            <DetailRow label="Quantity" value={`${row.qty} PCS`} />
            <DetailRow label={view === "delivery-challan" ? "Estimated Value" : "Amount"} value={formatMoney(row.amount)} />
            <DetailRow label={view === "sales-return" || view === "credit-note" ? "Linked Invoice" : "Valid Till"} value={row.linkedVoucher !== "-" ? row.linkedVoucher : row.validTill} />
          </>
        )}
      </div>

      {view === "payment-in" && (
        <PaymentSettlementSummary
          loading={receiptLoading}
          details={receiptDetails}
          emptyLabel="No invoice settlements yet. This receipt is currently treated as advance or unallocated payment."
        />
      )}

      {shareText && (
        <div className="payment-share-panel">
          <div>
            <strong>Share Text</strong>
            <button type="button" onClick={() => setShareText("")}>Close</button>
          </div>
          <textarea readOnly value={shareText} />
        </div>
      )}

      <div className="sales-register-timeline">
        <span className={statusClass(row.status)} />
        <div>
          <strong>{row.status}</strong>
          <small>Updated on {currentDate}</small>
        </div>
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sales-register-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PaymentSettlementSummary({
  details,
  loading,
  emptyLabel
}: {
  details: PaymentReceiptDetails | null;
  loading: boolean;
  emptyLabel: string;
}) {
  const settlements = details?.settlements || [];
  const totalSettled = settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0);

  return (
    <div className="payment-settlement-card">
      <div className="payment-settlement-card-head">
        <strong>Settlement Details</strong>
        <span>{loading ? "Loading..." : formatMoney(totalSettled)}</span>
      </div>
      {settlements.length > 0 ? (
        <div className="payment-settlement-list">
          {settlements.map(settlement => (
            <div className="payment-settlement-row" key={settlement.id}>
              <span>{settlement.invoiceNumber}</span>
              <strong>{formatMoney(settlement.settledAmount)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>{loading ? "Fetching invoice settlements from Postgres..." : emptyLabel}</p>
      )}
      {details?.isAdvance && <small>Remaining amount is recorded as advance.</small>}
      {details?.status === "Void" && details.cancellationReason && <small>{details.cancellationReason}</small>}
    </div>
  );
}

function renderCell(column: ColumnKey, row: SalesRegisterRow) {
  if (column === "date") return row.date;
  if (column === "number") return row.number;
  if (column === "party") return row.partyName;
  if (column === "item") return row.itemName;
  if (column === "qty") return `${row.qty} PCS`;
  if (column === "amount") return <strong>{formatMoney(row.amount)}</strong>;
  if (column === "settled") return formatMoney(row.settledAmount);
  if (column === "received") return <strong>{formatMoney(row.receivedAmount)}</strong>;
  if (column === "mode") return row.paymentMode;
  if (column === "linked") return row.linkedVoucher;
  if (column === "validTill") return row.validTill;
  return <span className={`sales-status-pill sales-register-status ${statusClass(row.status)}`}>{row.status}</span>;
}

function createDraft(view: SalesRegisterView, parties: Party[], items: Item[]): SalesRegisterDraft {
  const firstItem = items[0];
  const firstParty = parties.find(party => party.type === "customer") || parties[0];
  const defaultAmount = view === "payment-in" ? Math.max(0, firstParty?.balance || 0) : firstItem?.price || 0;

  return {
    partyId: firstParty?.id || "",
    itemId: firstItem?.id || "",
    qty: 1,
    amount: defaultAmount,
    date: currentDate,
    validTill: displayDateOffset(7),
    paymentMode: "Cash",
    linkedVoucher: "",
    settlementInvoiceId: "",
    notes: ""
  };
}

function getSummary(view: SalesRegisterView, rows: SalesRegisterRow[]) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const pcs = rows.reduce((sum, row) => sum + row.qty, 0);
  const countByStatus = (status: string) => rows.filter(row => row.status === status).length;

  if (view === "delivery-challan") {
    return [
      { label: "Total Challans", value: String(rows.length), accent: "purple" },
      { label: "Open", value: String(countByStatus("Open")), accent: "green" },
      { label: "Converted", value: String(countByStatus("Converted")), accent: "gray" },
      { label: "Stock Qty", value: `${pcs} PCS`, accent: "gray" }
    ];
  }

  if (view === "sales-return") {
    return [
      { label: "Total Return", value: formatMoney(total), accent: "purple" },
      { label: "Refunded", value: String(countByStatus("Refunded")), accent: "green" },
      { label: "Pending", value: String(countByStatus("Pending Refund")), accent: "red" },
      { label: "Items Returned", value: `${pcs} PCS`, accent: "gray" }
    ];
  }

  if (view === "credit-note") {
    return [
      { label: "Total Credit", value: formatMoney(total), accent: "purple" },
      { label: "Adjusted", value: String(countByStatus("Adjusted")), accent: "green" },
      { label: "Issued", value: String(countByStatus("Issued")), accent: "red" },
      { label: "Notes", value: String(rows.length), accent: "gray" }
    ];
  }

  if (view === "proforma-invoice") {
    return [
      { label: "Total Proforma", value: formatMoney(total), accent: "purple" },
      { label: "Accepted", value: String(countByStatus("Accepted")), accent: "green" },
      { label: "Open", value: String(countByStatus("Open")), accent: "red" },
      { label: "Cancelled", value: "-", accent: "gray" }
    ];
  }

  return [
    { label: "Total Estimate", value: formatMoney(total), accent: "purple" },
    { label: "Converted", value: String(countByStatus("Converted")), accent: "green" },
    { label: "Open", value: String(countByStatus("Open")), accent: "red" },
    { label: "Expired", value: "-", accent: "gray" }
  ];
}

function formatMoney(amount: number) {
  return `${RUPEE} ${amount.toLocaleString("en-IN")}`;
}

function statusClass(status: string) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isClosedVoucher(status: string) {
  return ["cancelled", "converted", "void", "refunded", "adjusted"].includes(statusClass(status));
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildVoucherShareText({
  title,
  numberLabel,
  row,
  view,
  receiptDetails
}: {
  title: string;
  numberLabel: string;
  row: SalesRegisterRow;
  view: SalesRegisterView;
  receiptDetails: PaymentReceiptDetails | null;
}) {
  const lines = [
    `${title} ${row.number}`,
    `${numberLabel}: ${row.number}`,
    `Party: ${row.partyName}`,
    `Date: ${row.date}`,
    `Status: ${row.status}`
  ];

  if (view === "payment-in") {
    lines.push(`Received: ${formatMoney(row.receivedAmount)}`);
    lines.push(`Mode: ${row.paymentMode}`);
    lines.push(`Reference: ${receiptDetails?.referenceNumber || row.linkedVoucher || "-"}`);
    const settlements = receiptDetails?.settlements || row.settlements || [];
    if (settlements.length) {
      lines.push("Settlements:");
      settlements.forEach(settlement => {
        lines.push(`- ${settlement.invoiceNumber}: ${formatMoney(settlement.settledAmount)}`);
      });
    }
  } else {
    lines.push(`Item: ${row.itemName}`);
    lines.push(`Quantity: ${row.qty} PCS`);
    lines.push(`Amount: ${formatMoney(row.amount)}`);
    if (row.linkedVoucher && row.linkedVoucher !== "-") lines.push(`Linked Voucher: ${row.linkedVoucher}`);
  }

  if (row.notes) lines.push(`Notes: ${row.notes}`);
  return lines.join("\n");
}

function buildVoucherHtml({
  title,
  numberLabel,
  row,
  view,
  receiptDetails
}: {
  title: string;
  numberLabel: string;
  row: SalesRegisterRow;
  view: SalesRegisterView;
  receiptDetails: PaymentReceiptDetails | null;
}) {
  const settlements = receiptDetails?.settlements || row.settlements || [];
  const totalSettled = settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0);
  const settlementRows = settlements.map(settlement => `
    <tr>
      <td>${escapeHtml(settlement.invoiceNumber)}</td>
      <td class="right">${escapeHtml(formatMoney(settlement.settledAmount))}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} ${escapeHtml(row.number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #20242b; font: 14px Arial, sans-serif; background: #fff; }
    .sheet { width: 760px; margin: 24px auto; border: 1px solid #d8dde8; border-radius: 8px; overflow: hidden; }
    header { display: flex; justify-content: space-between; gap: 24px; padding: 22px 26px; border-bottom: 1px solid #e6e9f2; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; color: #22543d; background: #dff7e8; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; border-bottom: 1px solid #e6e9f2; }
    .field { padding: 14px 26px; border-right: 1px solid #edf0f6; border-bottom: 1px solid #edf0f6; min-height: 62px; }
    .field span { display: block; color: #667085; font-size: 12px; margin-bottom: 6px; }
    .field strong { font-size: 15px; }
    table { width: calc(100% - 52px); margin: 20px 26px; border-collapse: collapse; }
    th, td { padding: 10px 12px; border: 1px solid #e1e5ef; text-align: left; }
    th { background: #f5f6fa; color: #4b5565; }
    .right { text-align: right; }
    .total { display: flex; justify-content: flex-end; padding: 0 26px 24px; font-size: 17px; font-weight: 800; }
    footer { padding: 14px 26px; color: #667085; border-top: 1px solid #e6e9f2; }
    @media print { body { background: #fff; } .sheet { margin: 0; width: 100%; border: 0; } }
  </style>
</head>
<body>
  <article class="sheet">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div>${escapeHtml(numberLabel)}: <strong>${escapeHtml(row.number)}</strong></div>
      </div>
      <span class="badge">${escapeHtml(row.status)}</span>
    </header>
    <section class="grid">
      <div class="field"><span>Party</span><strong>${escapeHtml(row.partyName)}</strong></div>
      <div class="field"><span>Date</span><strong>${escapeHtml(row.date)}</strong></div>
      ${view === "payment-in" ? `
        <div class="field"><span>Amount Received</span><strong>${escapeHtml(formatMoney(row.receivedAmount))}</strong></div>
        <div class="field"><span>Payment Mode</span><strong>${escapeHtml(row.paymentMode)}</strong></div>
        <div class="field"><span>Reference</span><strong>${escapeHtml(receiptDetails?.referenceNumber || row.linkedVoucher || "-")}</strong></div>
        <div class="field"><span>Settled Amount</span><strong>${escapeHtml(formatMoney(totalSettled))}</strong></div>
      ` : `
        <div class="field"><span>Item</span><strong>${escapeHtml(row.itemName)}</strong></div>
        <div class="field"><span>Quantity</span><strong>${escapeHtml(`${row.qty} PCS`)}</strong></div>
        <div class="field"><span>Amount</span><strong>${escapeHtml(formatMoney(row.amount))}</strong></div>
        <div class="field"><span>Linked Voucher</span><strong>${escapeHtml(row.linkedVoucher || "-")}</strong></div>
      `}
    </section>
    ${view === "payment-in" && settlements.length ? `
      <table>
        <thead><tr><th>Invoice</th><th class="right">Settled Amount</th></tr></thead>
        <tbody>${settlementRows}</tbody>
      </table>
    ` : ""}
    <div class="total">${escapeHtml(view === "payment-in" ? formatMoney(row.receivedAmount) : formatMoney(row.amount))}</div>
    ${row.notes ? `<footer>${escapeHtml(row.notes)}</footer>` : ""}
  </article>
</body>
</html>`;
}

function openPrintableDocument(title: string, html: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=720");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
  return true;
}
