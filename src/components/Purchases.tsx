import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  adjustItemStock,
  cancelPurchaseVoucher,
  createDebitNote,
  createPaymentOut,
  createPurchaseInvoice,
  createPurchaseOrder,
  convertPurchaseOrder,
  getPurchasePaymentReceipt,
  getPurchasePaymentReceiptHtml,
  getPurchasePaymentReceiptShareText,
  updatePurchaseVoucher
} from "../api";
import type { PaymentReceiptDetails } from "../api";
import type { Item, Party, PurchaseRegisterRow } from "../types";

export type PurchaseView =
  | "purchases"
  | "payment-out"
  | "purchase-return"
  | "debit-note"
  | "purchase-orders";

type ColumnKey =
  | "date"
  | "number"
  | "party"
  | "dueIn"
  | "item"
  | "qty"
  | "amount"
  | "settled"
  | "paid"
  | "mode"
  | "linked"
  | "expected"
  | "status";

type PurchaseConfig = {
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
  actionLabel?: string;
  actionTarget?: PurchaseView;
};

type PurchaseRow = PurchaseRegisterRow;
/*
type PurchaseRow = {
  id: string;
  date: string;
  number: string;
  partyName: string;
  dueIn: string;
  itemName: string;
  qty: number;
  amount: number;
  paidAmount: number;
  settledAmount: number;
  paymentMode: string;
  linkedVoucher: string;
  expectedDate: string;
  status: string;
  notes: string;
};
*/

type PurchaseDraft = {
  partyId: string;
  itemId: string;
  qty: number;
  amount: number;
  date: string;
  dueIn: string;
  expectedDate: string;
  paymentMode: string;
  linkedVoucher: string;
  settlementInvoiceId: string;
  notes: string;
};

type LifecycleEditDraft = {
  linkedVoucher: string;
  notes: string;
};

interface PurchasesProps {
  view: PurchaseView;
  parties: Party[];
  items: Item[];
  initialRows: Record<PurchaseView, PurchaseRow[]>;
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh: () => Promise<void>;
}

const RUPEE = "\u20b9";
const formatDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const currentDate = () => formatDate(new Date());
const futureDate = (days: number) => formatDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

const configs: Record<PurchaseView, PurchaseConfig> = {
  purchases: {
    title: "Purchase Invoices",
    primaryLabel: "Create Purchase Invoice",
    numberLabel: "Purchase Invoice Number",
    documentLabel: "Purchase Invoice",
    prefix: "PI",
    baseNumber: 102,
    searchPlaceholder: "Search by invoice number or supplier name",
    emptyText: "No Purchase Invoices Matching the current filter",
    defaultStatus: "Unpaid",
    showReports: true,
    actionLabel: "Record Payment Out",
    actionTarget: "payment-out"
  },
  "payment-out": {
    title: "Payment Out",
    primaryLabel: "Create Payment Out",
    numberLabel: "Payment Number",
    documentLabel: "Payment Voucher",
    prefix: "POUT",
    baseNumber: 38,
    searchPlaceholder: "Search by payment number or supplier name",
    emptyText: "No Transactions Matching the current filter",
    defaultStatus: "Paid"
  },
  "purchase-return": {
    title: "Purchase Return",
    primaryLabel: "Create Purchase Return",
    numberLabel: "Return Number",
    documentLabel: "Purchase Return",
    prefix: "PR",
    baseNumber: 14,
    searchPlaceholder: "Search by return number or supplier name",
    emptyText: "No Purchase Returns Matching the current filter",
    defaultStatus: "Pending Adjustment",
    showReports: true
  },
  "debit-note": {
    title: "Debit Note",
    primaryLabel: "Create Debit Note",
    numberLabel: "Debit Note Number",
    documentLabel: "Debit Note",
    prefix: "DN",
    baseNumber: 9,
    searchPlaceholder: "Search by debit note number or supplier name",
    emptyText: "No Debit Notes Matching the current filter",
    defaultStatus: "Issued",
    showReports: true
  },
  "purchase-orders": {
    title: "Purchase Orders",
    primaryLabel: "Create Purchase Order",
    numberLabel: "Purchase Order Number",
    documentLabel: "Purchase Order",
    prefix: "PO",
    baseNumber: 27,
    searchPlaceholder: "Search by order number or supplier name",
    emptyText: "No Purchase Orders Matching the current filter",
    defaultStatus: "Open",
    showReports: true,
    actionLabel: "Convert to Purchase Invoice",
    actionTarget: "purchases"
  }
};

const columnsByView: Record<PurchaseView, ColumnKey[]> = {
  purchases: ["date", "number", "party", "dueIn", "amount", "status"],
  "payment-out": ["date", "number", "party", "settled", "paid", "mode", "status"],
  "purchase-return": ["date", "number", "party", "linked", "amount", "status"],
  "debit-note": ["date", "number", "party", "linked", "amount", "status"],
  "purchase-orders": ["date", "number", "party", "expected", "amount", "status"]
};

const columnLabels: Record<ColumnKey, string> = {
  date: "Date",
  number: "Number",
  party: "Party Name",
  dueIn: "Due In",
  item: "Item Name",
  qty: "Stock QTY",
  amount: "Amount",
  settled: "Total Amount Settled",
  paid: "Amount Paid",
  mode: "Payment Mode",
  linked: "Linked Purchase",
  expected: "Expected Date",
  status: "Status"
};

export default function Purchases({ view, parties, items, initialRows: apiRows, onNavigate, onWorkspaceRefresh }: PurchasesProps) {
  const [rowsByView, setRowsByView] = useState<Record<PurchaseView, PurchaseRow[]>>(apiRows);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(view, parties, items));
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showBulkSummary, setShowBulkSummary] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<PurchaseRow | null>(null);
  const [editDraft, setEditDraft] = useState<LifecycleEditDraft>({ linkedVoucher: "", notes: "" });

  const config = configs[view];
  const rows = rowsByView[view];
  const columns = columnsByView[view];
  const suppliers = parties.filter(party => party.type === "supplier");

  useEffect(() => {
    setRowsByView(apiRows);
  }, [apiRows]);

  useEffect(() => {
    setQuery("");
    setSelectedId(null);
    setShowCreate(false);
    setShowKeyboard(false);
    setShowBulkSummary(false);
    setSyncNotice("");
    setActionMenuId(null);
    setBusyActionId(null);
    setEditRow(null);
    setDraft(createDraft(view, parties, items));
  }, [view, parties, items]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter(row =>
      [row.number, row.partyName, row.itemName, row.status, row.linkedVoucher]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, rows]);

  const selectedRow = selectedId ? rows.find(row => row.id === selectedId) || null : null;
  const summary = getSummary(view, rows);
  const openPurchaseInvoices = useMemo(() => {
    if (view !== "payment-out") return [];
    return rowsByView.purchases.filter(row =>
      row.partyName === String((suppliers.length > 0 ? suppliers : parties).find(party => party.id === draft.partyId)?.name || "").toUpperCase() &&
      !["paid", "cancelled"].includes(row.status.toLowerCase()) &&
      row.amount > row.paidAmount
    );
  }, [draft.partyId, parties, rowsByView.purchases, suppliers, view]);

  const handleDraftChange = <Key extends keyof PurchaseDraft>(
    key: Key,
    value: PurchaseDraft[Key]
  ) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  const openCreate = () => {
    setDraft(createDraft(view, parties, items));
    setShowCreate(true);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

    const party = parties.find(entry => entry.id === draft.partyId) || suppliers[0] || parties[0];
    const item = items.find(entry => entry.id === draft.itemId);
    const amount = Math.max(0, Number(draft.amount) || 0);
    const qty = Math.max(1, Number(draft.qty) || 1);
    const isPaymentOut = view === "payment-out";

    if (!party) {
      setSyncNotice("Select a supplier before saving.");
      return;
    }
    if (!isPaymentOut && !item) {
      setSyncNotice("Select an inventory item before saving.");
      return;
    }

    try {
      setIsSaving(true);
      setSyncNotice("");

      let savedRow: PurchaseRow;
      if (view === "purchases") {
        savedRow = await createPurchaseInvoice({
          partyId: party.id,
          item: item!,
          quantity: qty,
          amount,
          notes: draft.notes,
          paymentMode: draft.paymentMode,
          supplierInvoiceNumber: draft.linkedVoucher
        });
      } else if (view === "payment-out") {
        savedRow = await createPaymentOut({
          partyId: party.id,
          amount,
          paymentMode: draft.paymentMode,
          linkedVoucher: draft.linkedVoucher,
          settlementInvoiceId: draft.settlementInvoiceId,
          notes: draft.notes
        });
      } else if (view === "purchase-orders") {
        savedRow = await createPurchaseOrder({
          partyId: party.id,
          item: item!,
          quantity: qty,
          amount,
          notes: draft.notes
        });
      } else {
        const isPurchaseReturn = view === "purchase-return";
        savedRow = await createDebitNote({
          partyId: party.id,
          amount,
          linkedVoucher: draft.linkedVoucher,
          notes: draft.notes,
          isPurchaseReturn
        });
        if (isPurchaseReturn && item) {
          await adjustItemStock({
            itemId: item.id,
            quantity: qty,
            movementType: "adjustment_out",
            notes: `Purchase return ${savedRow.number}: ${draft.notes || draft.linkedVoucher || item.name}`
          });
        }
      }

      const rowWithSupplier = {
        ...savedRow,
        partyName: savedRow.partyName || party.name.toUpperCase(),
        dueIn: view === "purchases" ? draft.dueIn || "-" : savedRow.dueIn,
        expectedDate: view === "purchase-orders" ? draft.expectedDate : savedRow.expectedDate,
        linkedVoucher: savedRow.linkedVoucher === "-" && draft.linkedVoucher ? draft.linkedVoucher : savedRow.linkedVoucher
      };

      setRowsByView(current => ({
        ...current,
        [view]: [rowWithSupplier, ...current[view].filter(row => row.id !== rowWithSupplier.id)]
      }));
      setSelectedId(rowWithSupplier.id);
      setShowCreate(false);
      await onWorkspaceRefresh();
      setSyncNotice(`${config.documentLabel} saved to Postgres.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be saved.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDrawerAction = async (row: PurchaseRow, target: PurchaseView) => {
    if (isClosedVoucher(row.status)) {
      setSyncNotice(`${config.documentLabel} ${row.number} is already ${row.status.toLowerCase()}.`);
      setActionMenuId(null);
      return;
    }

    if (view !== "purchase-orders") {
      onNavigate(target);
      return;
    }

    try {
      setIsSaving(true);
      setBusyActionId(row.id);
      setSyncNotice("");
      await convertPurchaseOrder(row.id);
      await onWorkspaceRefresh();
      setSelectedId(null);
      setSyncNotice(`${row.number} converted to a purchase invoice in Postgres.`);
      onNavigate("purchases");
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : "Purchase order could not be converted.");
    } finally {
      setIsSaving(false);
      setBusyActionId(null);
    }
  };

  const openEdit = (row: PurchaseRow) => {
    setEditRow(row);
    setEditDraft({
      linkedVoucher: row.linkedVoucher === "-" ? "" : row.linkedVoucher,
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
      await updatePurchaseVoucher({
        view,
        id: editRow.id,
        linkedVoucher: editDraft.linkedVoucher,
        notes: editDraft.notes
      });
      setRowsByView(current => ({
        ...current,
        [view]: current[view].map(row => row.id === editRow.id ? {
          ...row,
          notes: editDraft.notes,
          linkedVoucher: editDraft.linkedVoucher || row.linkedVoucher
        } : row)
      }));
      await onWorkspaceRefresh();
      setEditRow(null);
      setSyncNotice(`${config.documentLabel} updated in Postgres.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be updated.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelVoucher = async (row: PurchaseRow) => {
    const actionLabel = view === "payment-out" ? "void" : "cancel";
    const actionPastTense = actionLabel === "void" ? "voided" : "cancelled";
    const reason = `${config.documentLabel} ${actionPastTense} from purchase workspace`;
    if (isClosedVoucher(row.status)) {
      setSyncNotice(`${config.documentLabel} ${row.number} is already ${row.status.toLowerCase()}.`);
      setActionMenuId(null);
      return;
    }

    if (!window.confirm(`${actionLabel === "void" ? "Void" : "Cancel"} ${config.documentLabel} ${row.number}?`)) {
      return;
    }

    try {
      setBusyActionId(row.id);
      setSyncNotice("");
      await cancelPurchaseVoucher({
        view,
        id: row.id,
        reason
      });
      setRowsByView(current => ({
        ...current,
        [view]: view === "payment-out"
          ? current[view].map(entry => entry.id === row.id ? {
            ...entry,
            status: "Void",
            settledAmount: 0,
            settlements: [],
            cancellationReason: reason
          } : entry)
          : current[view].map(entry => entry.id === row.id ? { ...entry, status: "Cancelled" } : entry)
      }));
      await onWorkspaceRefresh();
      setSyncNotice(`${config.documentLabel} ${actionPastTense} in Postgres.`);
    } catch (error) {
      setSyncNotice(error instanceof Error ? error.message : `${config.documentLabel} could not be ${actionPastTense}.`);
    } finally {
      setBusyActionId(null);
      setActionMenuId(null);
    }
  };

  return (
    <div className="mbb-screen purchase-workspace-screen">
      <div className="mbb-page-card sales-register-card purchase-workspace-card">
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

        {syncNotice && <div className="sales-action-strip purchase-sync-notice">{syncNotice}</div>}

        {view !== "payment-out" && (
          <div className="sales-stat-grid sales-register-stat-grid purchase-summary-grid">
            {summary.map(stat => (
              <div className={`sales-stat-card ${stat.accent}`} key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
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
          <div className="sales-toolbar-spacer" />
          {view !== "payment-out" && (
            <button className="mbb-bulk-btn sales-bulk-btn" onClick={() => setShowBulkSummary(current => !current)} type="button">
              <ClipboardList size={18} />
              Bulk Actions
              <ChevronDown size={17} />
            </button>
          )}
          <button className="mbb-primary-btn sales-register-primary purchase-register-primary" onClick={openCreate} type="button">
            {config.primaryLabel}
          </button>
        </div>

        {(showKeyboard || showBulkSummary) && (
          <div className="sales-action-strip">
            {showKeyboard && <span>Shortcuts: / search, Enter opens details, Ctrl+N creates the current purchase document.</span>}
            {showBulkSummary && (
              <span>
                {filteredRows.length} visible rows. Total value {formatMoney(filteredRows.reduce((total, row) => total + row.amount, 0), 2)}.
              </span>
            )}
          </div>
        )}

        <div className={`sales-table-wrap sales-register-table-wrap purchase-register-table-wrap ${view === "payment-out" ? "is-empty-ledger" : ""}`}>
          <table className="sales-table sales-register-table purchase-register-table">
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
                      <td key={`${row.id}-${column}`}>{renderCell(column, row, view)}</td>
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
                            <button type="button" onClick={() => openEdit(row)} disabled={busyActionId === row.id || isClosedVoucher(row.status)}>
                              Edit
                            </button>
                            {view === "purchase-orders" && (
                              <button type="button" onClick={() => handleDrawerAction(row, "purchases")} disabled={busyActionId === row.id || isClosedVoucher(row.status)}>
                                {busyActionId === row.id ? "Working..." : "Convert"}
                              </button>
                            )}
                            <button className="danger" type="button" onClick={() => handleCancelVoucher(row)} disabled={busyActionId === row.id || isClosedVoucher(row.status)}>
                              {view === "payment-out" ? "Void" : "Cancel"}
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

        {selectedRow && (
          <PurchaseDrawer
            config={config}
            row={selectedRow}
            view={view}
            onClose={() => setSelectedId(null)}
            onAction={(target) => handleDrawerAction(selectedRow, target)}
            onCancel={() => handleCancelVoucher(selectedRow)}
            actionSaving={busyActionId === selectedRow.id}
            onNotice={setSyncNotice}
          />
        )}
      </div>

      {showCreate && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={handleSave}>
            <div className="sales-register-modal-header">
              <h2>{config.primaryLabel}</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="sales-register-form-grid">
              <label>
                <span>Supplier Name</span>
                <select
                  required
                  value={draft.partyId}
                  onChange={(event) => {
                    handleDraftChange("partyId", event.target.value);
                    handleDraftChange("settlementInvoiceId", "");
                  }}
                >
                  {(suppliers.length > 0 ? suppliers : parties).map(party => (
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

              {view === "payment-out" ? (
                <>
                  <label>
                    <span>Amount Paid</span>
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
                      <option>Bank Transfer</option>
                      <option>UPI</option>
                      <option>Cheque</option>
                    </select>
                  </label>
                  <label className="wide">
                    <span>Settle Against</span>
                    <select
                      value={draft.settlementInvoiceId}
                      onChange={(event) => handleDraftChange("settlementInvoiceId", event.target.value)}
                    >
                      <option value="">Auto FIFO settlement</option>
                      {openPurchaseInvoices.map(invoice => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.number} - {formatMoney(Math.max(0, invoice.amount - invoice.paidAmount))}
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
                        handleDraftChange("amount", item ? item.purchasePrice * draft.qty : draft.amount);
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
                      onChange={(event) => {
                        const nextQty = Math.max(1, Number(event.target.value) || 1);
                        const item = items.find(entry => entry.id === draft.itemId);
                        handleDraftChange("qty", nextQty);
                        if (item) {
                          handleDraftChange("amount", item.purchasePrice * nextQty);
                        }
                      }}
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
                    <span>{view === "purchase-orders" ? "Expected Date" : view === "purchases" ? "Due In" : "Linked Purchase"}</span>
                    <input
                      value={view === "purchase-orders" ? draft.expectedDate : view === "purchases" ? draft.dueIn : draft.linkedVoucher}
                      onChange={(event) => {
                        if (view === "purchase-orders") {
                          handleDraftChange("expectedDate", event.target.value);
                        } else if (view === "purchases") {
                          handleDraftChange("dueIn", event.target.value);
                        } else {
                          handleDraftChange("linkedVoucher", event.target.value);
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
                  placeholder="Add transport, supplier bill, or quality notes"
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
              {(view === "payment-out" || view === "purchases" || view === "purchase-return" || view === "debit-note") && (
                <label className="wide">
                  <span>{view === "payment-out" ? "Reference Number" : view === "purchases" ? "Supplier Invoice Number" : "Linked Purchase"}</span>
                  <input
                    value={editDraft.linkedVoucher}
                    onChange={(event) => setEditDraft(current => ({ ...current, linkedVoucher: event.target.value }))}
                  />
                </label>
              )}
              <label className="wide">
                <span>{view === "purchase-return" || view === "debit-note" ? "Reason" : "Notes"}</span>
                <textarea
                  value={editDraft.notes}
                  onChange={(event) => setEditDraft(current => ({ ...current, notes: event.target.value }))}
                />
              </label>
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

function PurchaseDrawer({
  config,
  row,
  view,
  onClose,
  onAction,
  onCancel,
  actionSaving,
  onNotice
}: {
  config: PurchaseConfig;
  row: PurchaseRow;
  view: PurchaseView;
  onClose: () => void;
  onAction: (target: PurchaseView) => void;
  onCancel: () => void;
  actionSaving: boolean;
  onNotice: (message: string) => void;
}) {
  const [receiptDetails, setReceiptDetails] = useState<PaymentReceiptDetails | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [shareText, setShareText] = useState("");
  const balance = Math.max(0, row.amount - row.paidAmount);
  const paymentStatus = view === "payment-out" ? receiptDetails?.status || row.status : row.status;

  useEffect(() => {
    if (view !== "payment-out") {
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

    getPurchasePaymentReceipt(row.id)
      .then(details => {
        if (isActive) setReceiptDetails(details);
      })
      .catch(error => {
        if (isActive) {
          onNotice(error instanceof Error ? error.message : "Payment-out receipt details could not be loaded.");
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
      const html = view === "payment-out"
        ? await getPurchasePaymentReceiptHtml(row.id)
        : buildPurchaseVoucherHtml({
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
      text = view === "payment-out"
        ? await getPurchasePaymentReceiptShareText(row.id)
        : buildPurchaseVoucherShareText({
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
    <aside className="sales-register-drawer purchase-register-drawer" aria-label={`${config.documentLabel} details`}>
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
        {config.actionLabel && config.actionTarget && (
          <button className="primary" type="button" onClick={() => onAction(config.actionTarget!)} disabled={actionSaving || isClosedVoucher(row.status)}>
            <Send size={16} />
            {actionSaving ? "Working..." : config.actionLabel}
          </button>
        )}
        <button className="danger" type="button" onClick={onCancel} disabled={actionSaving || isClosedVoucher(row.status)}>
          {view === "payment-out" ? "Void" : "Cancel"}
        </button>
      </div>

      <div className="sales-register-detail-list">
        <DetailRow label="Supplier Name" value={row.partyName} />
        <DetailRow label="Date" value={row.date} />
        <DetailRow label={config.numberLabel} value={row.number} />
        {view === "payment-out" ? (
          <>
            <DetailRow label="Amount Paid" value={formatMoney(row.paidAmount)} />
            <DetailRow label="Payment Mode" value={row.paymentMode} />
            <DetailRow label="Reference Number" value={receiptDetails?.referenceNumber || row.linkedVoucher} />
          </>
        ) : (
          <>
            <DetailRow label="Item Name" value={row.itemName} />
            <DetailRow label="Quantity" value={`${row.qty} PCS`} />
            <DetailRow label={view === "purchase-orders" ? "Order Value" : "Amount"} value={formatMoney(row.amount)} />
            {view === "purchases" && <DetailRow label="Balance Payable" value={formatMoney(balance)} />}
            {view === "purchase-orders" && <DetailRow label="Expected Date" value={row.expectedDate} />}
            {(view === "purchase-return" || view === "debit-note") && <DetailRow label="Linked Purchase" value={row.linkedVoucher} />}
          </>
        )}
      </div>

      {view === "payment-out" && (
        <PaymentSettlementSummary
          loading={receiptLoading}
          details={receiptDetails}
          emptyLabel="No purchase invoice settlements yet. This payment is currently treated as advance or unallocated supplier payment."
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
        <span className={statusClass(paymentStatus)} />
        <div>
          <strong>{paymentStatus}</strong>
          <small>Updated on {currentDate()}</small>
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
        <p>{loading ? "Fetching purchase invoice settlements from Postgres..." : emptyLabel}</p>
      )}
      {details?.isAdvance && <small>Remaining amount is recorded as supplier advance.</small>}
      {details?.status === "Void" && details.cancellationReason && <small>{details.cancellationReason}</small>}
    </div>
  );
}

function renderCell(column: ColumnKey, row: PurchaseRow, view: PurchaseView) {
  const balance = Math.max(0, row.amount - row.paidAmount);

  if (column === "date") return row.date;
  if (column === "number") return row.number;
  if (column === "party") return row.partyName;
  if (column === "dueIn") return row.dueIn;
  if (column === "item") return row.itemName;
  if (column === "qty") return `${row.qty} PCS`;
  if (column === "amount") {
    return (
      <span className="sales-amount-cell">
        <strong>{formatMoney(row.amount)}</strong>
        {view === "purchases" && balance > 0 && <span>({formatMoney(balance)} unpaid)</span>}
      </span>
    );
  }
  if (column === "settled") return formatMoney(row.settledAmount);
  if (column === "paid") return <strong>{formatMoney(row.paidAmount)}</strong>;
  if (column === "mode") return row.paymentMode;
  if (column === "linked") return row.linkedVoucher;
  if (column === "expected") return row.expectedDate;
  return <span className={`sales-status-pill sales-register-status purchase-register-status ${statusClass(row.status)}`}>{row.status}</span>;
}

function createDraft(view: PurchaseView, parties: Party[], items: Item[]): PurchaseDraft {
  const firstSupplier = parties.find(party => party.type === "supplier") || parties[0];
  const firstItem = items[0];
  const amount = view === "payment-out" ? 6017 : firstItem?.purchasePrice || 0;

  return {
    partyId: firstSupplier?.id || "",
    itemId: firstItem?.id || "",
    qty: 1,
    amount,
    date: currentDate(),
    dueIn: "-",
    expectedDate: futureDate(7),
    paymentMode: "Cash",
    linkedVoucher: "102",
    settlementInvoiceId: "",
    notes: ""
  };
}

function getSummary(view: PurchaseView, rows: PurchaseRow[]) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const qty = rows.reduce((sum, row) => sum + row.qty, 0);
  const count = (status: string) => rows.filter(row => row.status === status).length;

  if (view === "purchases") {
    const paid = rows.reduce((sum, row) => sum + row.paidAmount, 0);
    const unpaid = rows.reduce((sum, row) => sum + Math.max(0, row.amount - row.paidAmount), 0);
    return [
      { label: "Total Purchases", value: formatMoney(total, 2), accent: "purple" },
      { label: "Paid", value: formatMoney(paid, 2), accent: "green" },
      { label: "Unpaid", value: formatMoney(unpaid, 2), accent: "red" },
      { label: "Invoices", value: String(rows.length), accent: "gray" }
    ];
  }

  if (view === "purchase-orders") {
    return [
      { label: "Total Orders", value: formatMoney(total), accent: "purple" },
      { label: "Open", value: String(count("Open")), accent: "green" },
      { label: "Pending", value: String(count("Partially Received")), accent: "red" },
      { label: "Order Qty", value: `${qty} PCS`, accent: "gray" }
    ];
  }

  if (view === "purchase-return") {
    return [
      { label: "Total Return", value: formatMoney(total), accent: "purple" },
      { label: "Adjusted", value: String(count("Adjusted")), accent: "green" },
      { label: "Pending", value: String(count("Pending Adjustment")), accent: "red" },
      { label: "Items Returned", value: `${qty} PCS`, accent: "gray" }
    ];
  }

  return [
    { label: "Total Debit", value: formatMoney(total), accent: "purple" },
    { label: "Adjusted", value: String(count("Adjusted")), accent: "green" },
    { label: "Issued", value: String(count("Issued")), accent: "red" },
    { label: "Notes", value: String(rows.length), accent: "gray" }
  ];
}

function formatMoney(amount: number, decimals = 0) {
  return `${RUPEE} ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
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

function buildPurchaseVoucherShareText({
  title,
  numberLabel,
  row,
  view,
  receiptDetails
}: {
  title: string;
  numberLabel: string;
  row: PurchaseRow;
  view: PurchaseView;
  receiptDetails: PaymentReceiptDetails | null;
}) {
  const lines = [
    `${title} ${row.number}`,
    `${numberLabel}: ${row.number}`,
    `Supplier: ${row.partyName}`,
    `Date: ${row.date}`,
    `Status: ${receiptDetails?.status || row.status}`
  ];

  if (view === "payment-out") {
    lines.push(`Paid: ${formatMoney(row.paidAmount)}`);
    lines.push(`Mode: ${row.paymentMode}`);
    lines.push(`Reference: ${receiptDetails?.referenceNumber || row.linkedVoucher || "-"}`);
    const settlements = receiptDetails?.settlements || row.settlements || [];
    if (settlements.length) {
      lines.push("Settlements:");
      settlements.forEach(settlement => {
        lines.push(`- ${settlement.invoiceNumber}: ${formatMoney(settlement.settledAmount)}`);
      });
    }
    if (receiptDetails?.isAdvance) {
      lines.push("Advance: remaining amount recorded as supplier advance");
    }
    if (receiptDetails?.status === "Void" && receiptDetails.cancellationReason) {
      lines.push(`Void reason: ${receiptDetails.cancellationReason}`);
    }
  } else {
    lines.push(`Item: ${row.itemName}`);
    lines.push(`Quantity: ${row.qty} PCS`);
    lines.push(`Amount: ${formatMoney(row.amount)}`);
    if (view === "purchases") lines.push(`Balance Payable: ${formatMoney(Math.max(0, row.amount - row.paidAmount))}`);
    if (row.linkedVoucher && row.linkedVoucher !== "-") lines.push(`Linked Voucher: ${row.linkedVoucher}`);
  }

  if (row.notes) lines.push(`Notes: ${row.notes}`);
  return lines.join("\n");
}

function buildPurchaseVoucherHtml({
  title,
  numberLabel,
  row,
  view,
  receiptDetails
}: {
  title: string;
  numberLabel: string;
  row: PurchaseRow;
  view: PurchaseView;
  receiptDetails: PaymentReceiptDetails | null;
}) {
  const settlements = receiptDetails?.settlements || row.settlements || [];
  const totalSettled = settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0);
  const status = receiptDetails?.status || row.status;
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
    .badge.void, .badge.cancelled { color: #7f1d1d; background: #fee2e2; }
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
      <span class="badge ${escapeHtml(statusClass(status))}">${escapeHtml(status)}</span>
    </header>
    <section class="grid">
      <div class="field"><span>Supplier</span><strong>${escapeHtml(row.partyName)}</strong></div>
      <div class="field"><span>Date</span><strong>${escapeHtml(row.date)}</strong></div>
      ${view === "payment-out" ? `
        <div class="field"><span>Amount Paid</span><strong>${escapeHtml(formatMoney(row.paidAmount))}</strong></div>
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
    ${view === "payment-out" && settlements.length ? `
      <table>
        <thead><tr><th>Purchase Invoice</th><th class="right">Settled Amount</th></tr></thead>
        <tbody>${settlementRows}</tbody>
      </table>
    ` : ""}
    <div class="total">${escapeHtml(view === "payment-out" ? formatMoney(row.paidAmount) : formatMoney(row.amount))}</div>
    ${receiptDetails?.status === "Void" && receiptDetails.cancellationReason ? `<footer>${escapeHtml(receiptDetails.cancellationReason)}</footer>` : row.notes ? `<footer>${escapeHtml(row.notes)}</footer>` : ""}
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
