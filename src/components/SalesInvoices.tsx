import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileBarChart,
  Info,
  Keyboard,
  MoreVertical,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  Settings2,
  X
} from "lucide-react";
import { cancelSalesInvoice, getSalesInvoicePrintHtml, type InvoicePrintTemplate } from "../api";
import type { Business, InvoiceItem, Item, Party, SalesInvoice } from "../types";

type SalesMode = "list" | "create" | "detail";

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  date: string;
  partyName: string;
  dueIn: string;
  amount: number;
  paidAmount: number;
  status: "paid" | "partial" | "unpaid" | "cancelled";
  itemName: string;
  hsn: string;
  qty: number;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
};

type DraftLine = InvoiceItem;

interface SalesInvoicesProps {
  invoices: SalesInvoice[];
  items: Item[];
  mode: SalesMode;
  openInvoiceId?: string | null;
  onModeChange: (mode: SalesMode) => void;
  onSaveInvoice: (invoiceData: {
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
  }) => Promise<SalesInvoice | null>;
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  parties: Party[];
  business: Business;
}

const RUPEE = "\u20b9";

const seedInvoices: InvoiceRow[] = [];

const formatMoney = (amount: number, decimals = 0) =>
  `${RUPEE} ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;

const invoiceToRow = (invoice: SalesInvoice): InvoiceRow => {
  const firstLine = invoice.items[0];
  const taxable = invoice.subtotal || invoice.total / 1.05;
  const cgst = (invoice.total - taxable) / 2;
  const sgst = cgst;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    partyName: invoice.party.name.toUpperCase(),
    dueIn: "-",
    amount: invoice.total,
    paidAmount: invoice.paidAmount,
    status: invoice.status,
    itemName: firstLine?.item.name ?? "Invoice item",
    hsn: firstLine?.item.hsn || "-",
    qty: firstLine?.quantity ?? 1,
    rate: firstLine?.rate ?? taxable,
    taxable,
    cgst,
    sgst
  };
};

const getBalance = (invoice: InvoiceRow) => Math.max(0, invoice.amount - invoice.paidAmount);

export default function SalesInvoices({
  invoices,
  items,
  mode,
  openInvoiceId,
  onModeChange,
  onNavigate,
  onSaveInvoice,
  onWorkspaceRefresh,
  parties,
  business
}: SalesInvoicesProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(openInvoiceId ?? invoices[0]?.id ?? "");
  const [recentSavedRow, setRecentSavedRow] = useState<InvoiceRow | null>(null);
  const [rowOverrides, setRowOverrides] = useState<Record<string, InvoiceRow>>({});
  const [lifecycleNotice, setLifecycleNotice] = useState("");

  const invoiceRows = useMemo(() => {
    const dynamicRows = invoices.map(invoice => rowOverrides[invoice.id] ?? invoiceToRow(invoice));
    const extraRows =
      recentSavedRow && !dynamicRows.some(row => row.id === recentSavedRow.id) ? [recentSavedRow] : [];
    return [...extraRows, ...dynamicRows, ...seedInvoices];
  }, [invoices, recentSavedRow, rowOverrides]);

  const selectedInvoice = invoiceRows.find(invoice => invoice.id === selectedInvoiceId) ?? invoiceRows[0];

  useEffect(() => {
    if (openInvoiceId) {
      setSelectedInvoiceId(openInvoiceId);
    } else if (!selectedInvoiceId && invoiceRows[0]) {
      setSelectedInvoiceId(invoiceRows[0].id);
    }
  }, [invoiceRows, openInvoiceId, selectedInvoiceId]);

  const openDetail = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    onModeChange("detail");
  };

  const handleSavedInvoice = (invoice: SalesInvoice | null) => {
    if (!invoice) {
      return;
    }

    const row = invoiceToRow(invoice);
    setRecentSavedRow(row);
    setSelectedInvoiceId(row.id);
    onModeChange("detail");
  };

  const handleCancelInvoice = async (invoice: InvoiceRow) => {
    if (invoice.status === "cancelled") {
      setLifecycleNotice(`${invoice.invoiceNumber} is already cancelled.`);
      return;
    }

    const confirmed = window.confirm(
      `Cancel ${invoice.invoiceNumber}? Stock will be restored and linked initial payment will be voided.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setLifecycleNotice(`Cancelling ${invoice.invoiceNumber}...`);
      const result = await cancelSalesInvoice(invoice.id, "Cancelled from sales invoice workspace");
      const cancelledRow = invoiceToRow(result.invoice);
      setRowOverrides(current => ({ ...current, [cancelledRow.id]: cancelledRow }));
      setRecentSavedRow(cancelledRow);
      setSelectedInvoiceId(cancelledRow.id);
      await onWorkspaceRefresh?.();
      setLifecycleNotice(result.message || `${invoice.invoiceNumber} cancelled and refreshed from Postgres.`);
    } catch (error) {
      setLifecycleNotice(error instanceof Error ? error.message : `${invoice.invoiceNumber} could not be cancelled.`);
      await onWorkspaceRefresh?.();
    }
  };

  return (
    <div className="mbb-screen sales-screen">
      {lifecycleNotice && <div className="sales-action-strip sales-lifecycle-notice">{lifecycleNotice}</div>}
      {mode === "list" && (
        <SalesInvoiceList
          invoices={invoiceRows}
          onCreate={() => onModeChange("create")}
          onCancelInvoice={handleCancelInvoice}
          onNavigate={onNavigate}
          onOpenDetail={openDetail}
        />
      )}
      {mode === "create" && (
        <CreateSalesInvoiceView
          items={items}
          onBack={() => onModeChange("list")}
          onNavigate={onNavigate}
          onSavedInvoice={handleSavedInvoice}
          onSaveInvoice={onSaveInvoice}
          parties={parties}
          business={business}
        />
      )}
      {mode === "detail" && selectedInvoice && (
        <SalesInvoiceDetail
          invoice={selectedInvoice}
          onBack={() => onModeChange("list")}
          onCancelInvoice={handleCancelInvoice}
          onNavigate={onNavigate}
          business={business}
        />
      )}
    </div>
  );
}

interface SalesInvoiceListProps {
  invoices: InvoiceRow[];
  onCreate: () => void;
  onCancelInvoice: (invoice: InvoiceRow) => Promise<void> | void;
  onNavigate: (tab: string) => void;
  onOpenDetail: (invoiceId: string) => void;
}

function SalesInvoiceList({ invoices, onCreate, onCancelInvoice, onNavigate, onOpenDetail }: SalesInvoiceListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showBulkSummary, setShowBulkSummary] = useState(false);
  const [openActionInvoiceId, setOpenActionInvoiceId] = useState<string | null>(null);
  const summary = invoices.reduce(
    (totals, invoice) => {
      totals.total += invoice.amount;
      totals.paid += invoice.paidAmount;
      totals.unpaid += getBalance(invoice);
      if (invoice.status === "cancelled") {
        totals.cancelled += invoice.amount;
      }
      return totals;
    },
    { total: 0, paid: 0, unpaid: 0, cancelled: 0 }
  );
  const filteredInvoices = invoices.filter(invoice => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      invoice.invoiceNumber.toLowerCase().includes(query) ||
      invoice.partyName.toLowerCase().includes(query) ||
      invoice.itemName.toLowerCase().includes(query);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "unpaid" && getBalance(invoice) > 0) ||
      (statusFilter === "paid" && getBalance(invoice) === 0);
    return matchesSearch && matchesStatus;
  });

  const cycleStatusFilter = () => {
    setStatusFilter(current => (current === "all" ? "unpaid" : current === "unpaid" ? "paid" : "all"));
  };

  return (
    <div className="mbb-page-card sales-list-card">
      <div className="mbb-items-header sales-list-header">
        <h1>Sales Invoices</h1>
        <div className="mbb-header-actions">
          <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
            <FileBarChart size={16} />
            Reports
            <ChevronDown size={15} />
          </button>
          <button className="mbb-icon-btn has-alert" aria-label="Settings" onClick={() => onNavigate("settings")} type="button">
            <Settings2 size={18} />
          </button>
          <button className="mbb-icon-btn" aria-label="Keyboard shortcuts" onClick={() => setShowKeyboard(current => !current)} type="button">
            <Keyboard size={18} />
          </button>
        </div>
      </div>

      <div className="sales-stat-grid">
        <SalesStatCard accent="purple" label="Total Sales" value={formatMoney(summary.total, 2)} />
        <SalesStatCard accent="green" label="Paid" value={formatMoney(summary.paid, 2)} />
        <SalesStatCard accent="red" label="Unpaid" value={formatMoney(summary.unpaid, 2)} />
        <SalesStatCard accent="gray" label="Cancelled" value={summary.cancelled ? formatMoney(summary.cancelled, 2) : "-"} />
      </div>

      <div className="sales-toolbar">
        <button className="sales-square-btn" aria-label="Search invoices" type="button">
          <Search size={20} />
        </button>
        <label className="sales-filter-btn sales-search-field">
          <input
            aria-label="Search sales invoices"
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Search invoices"
            value={searchQuery}
          />
        </label>
        <button className="sales-filter-btn" onClick={cycleStatusFilter} type="button">
          <CalendarDays size={19} />
          {statusFilter === "all" ? "All Status" : statusFilter === "unpaid" ? "Unpaid Only" : "Paid Only"}
          <ChevronDown size={18} />
        </button>
        <div className="sales-toolbar-spacer" />
        <button className="mbb-bulk-btn sales-bulk-btn" onClick={() => setShowBulkSummary(current => !current)} type="button">
          <ClipboardList size={19} />
          Bulk Actions
          <ChevronDown size={18} />
        </button>
        <button className="mbb-primary-btn sales-create-btn" onClick={onCreate} type="button">
          Create Sales Invoice
        </button>
      </div>

      {(showKeyboard || showBulkSummary) && (
        <div className="sales-action-strip">
          {showKeyboard && <span>Shortcuts: / search, Enter opens invoice detail, Ctrl+N creates invoice.</span>}
          {showBulkSummary && (
            <span>
              {filteredInvoices.length} visible invoices. Unpaid balance {formatMoney(summary.unpaid, 2)}.
            </span>
          )}
        </div>
      )}

      <div className="sales-table-wrap">
        <table className="sales-table">
          <thead>
            <tr>
              <th className="sales-check-cell" />
              <th>
                <span className="mbb-sort-label">
                  Date
                  <ChevronDown size={15} />
                </span>
              </th>
              <th>Invoice Number</th>
              <th>Party Name</th>
              <th>Due In</th>
              <th>
                <span className="mbb-sort-label">
                  Amount
                  <ChevronDown size={15} />
                </span>
              </th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map(invoice => {
              const balance = getBalance(invoice);

              return (
                <tr key={invoice.id} onClick={() => onOpenDetail(invoice.id)}>
                  <td className="sales-check-cell">
                    <button
                      className="mbb-checkbox"
                      aria-label={`Select invoice ${invoice.invoiceNumber}`}
                      onClick={event => event.stopPropagation()}
                      type="button"
                    />
                  </td>
                  <td>{invoice.date}</td>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.partyName}</td>
                  <td>{invoice.dueIn}</td>
                  <td className="sales-amount-cell">
                    <strong>{formatMoney(invoice.amount)}</strong>
                    {balance > 0 && <span>({formatMoney(balance)} unpaid)</span>}
                  </td>
                  <td>
                    <span className={`sales-status-pill ${invoice.status}`}>{invoice.status}</span>
                  </td>
                  <td>
                    <div className="sales-row-actions">
                      <button
                        className="mbb-row-menu"
                        aria-label={`More actions for ${invoice.invoiceNumber}`}
                        onClick={event => {
                          event.stopPropagation();
                          setOpenActionInvoiceId(current => (current === invoice.id ? null : invoice.id));
                        }}
                        type="button"
                      >
                        <MoreVertical size={19} />
                      </button>
                      {openActionInvoiceId === invoice.id && (
                        <div className="items-row-menu sales-row-menu" onClick={event => event.stopPropagation()}>
                          <button
                            onClick={() => {
                              setOpenActionInvoiceId(null);
                              onOpenDetail(invoice.id);
                            }}
                            type="button"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => {
                              setOpenActionInvoiceId(null);
                              onNavigate("payment-in");
                            }}
                            type="button"
                          >
                            Record Payment
                          </button>
                          <button
                            className="danger"
                            disabled={invoice.status === "cancelled"}
                            onClick={() => {
                              setOpenActionInvoiceId(null);
                              void onCancelInvoice(invoice);
                            }}
                            type="button"
                          >
                            Cancel Invoice
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={8}>No invoices match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button className="mbb-help-bubble" aria-label="Help" type="button">
        ?
      </button>
    </div>
  );
}

interface SalesStatCardProps {
  accent: "purple" | "green" | "red" | "gray";
  label: string;
  value: string;
}

function SalesStatCard({ accent, label, value }: SalesStatCardProps) {
  return (
    <article className={`sales-stat-card ${accent}`}>
      <span>
        <BadgeIndianRupee size={17} />
        {label}
      </span>
      <strong>{value}</strong>
    </article>
  );
}

interface CreateSalesInvoiceViewProps {
  items: Item[];
  onBack: () => void;
  onNavigate: (tab: string) => void;
  onSavedInvoice: (invoice: SalesInvoice | null) => void;
  onSaveInvoice: SalesInvoicesProps["onSaveInvoice"];
  parties: Party[];
  business: Business;
}

function CreateSalesInvoiceView({
  items,
  onBack,
  onNavigate,
  onSavedInvoice,
  onSaveInvoice,
  parties,
  business
}: CreateSalesInvoiceViewProps) {
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [createNotice, setCreateNotice] = useState("");
  const [showCreateShortcuts, setShowCreateShortcuts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedParty = parties.find(party => party.id === selectedPartyId) ?? parties[0];
  const selectedItem = items.find(item => item.id === selectedItemId) ?? items[0];
  const todayLabel = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  const dueDateLabel = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  useEffect(() => {
    if (!selectedPartyId && parties[0]) {
      setSelectedPartyId(parties[0].id);
    }
    if (!selectedItemId && items[0]) {
      setSelectedItemId(items[0].id);
    }
  }, [items, parties, selectedItemId, selectedPartyId]);

  const buildDefaultLine = (): DraftLine | null => {
    const item = selectedItem;
    if (!item) {
      return null;
    }

    return {
      discountPct: 0,
      freeQuantity: 0,
      item,
      quantity: 1,
      rate: item.price || 0
    };
  };

  const addDefaultItem = () => {
    const line = buildDefaultLine();
    if (!line) {
      return;
    }

    setDraftLines(current => [...current, line]);
  };

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines(current => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  };

  const totals = useMemo(() => {
    const subtotal = draftLines.reduce((sum, line) => sum + line.rate * line.quantity, 0);
    const tax = draftLines.reduce(
      (sum, line) => sum + line.rate * line.quantity * (line.item.gstRate / 100),
      0
    );
    return {
      subtotal,
      tax,
      total: subtotal + tax
    };
  }, [draftLines]);

  const persistInvoice = async () => {
    if (!selectedParty) {
      setCreateNotice("Select a party before saving the invoice.");
      return null;
    }

    const lines = draftLines;
    if (lines.length === 0) {
      setCreateNotice("Add at least one inventory item before saving.");
      return null;
    }

    const requestedByItem = new Map<string, number>();
    for (const line of lines) {
      const requestedQty = line.quantity + line.freeQuantity;
      const totalRequested = (requestedByItem.get(line.item.id) || 0) + requestedQty;
      requestedByItem.set(line.item.id, totalRequested);
      if (totalRequested > line.item.stock) {
        setCreateNotice(`Only ${line.item.stock} PCS available for ${line.item.name}. Reduce quantity before saving.`);
        return null;
      }
    }

    const subtotal = lines.reduce((sum, line) => sum + line.rate * line.quantity, 0);
    const tax = lines.reduce((sum, line) => sum + line.rate * line.quantity * (line.item.gstRate / 100), 0);
    const total = subtotal + tax;

    if (paidAmount > total) {
      setCreateNotice("Paid amount cannot be greater than invoice total.");
      return null;
    }

    setIsSaving(true);
    try {
      const invoice = await onSaveInvoice({
        items: lines,
        paidAmount,
        partyId: selectedParty.id,
        paymentMode,
        subtotal,
        total
      });

      if (!invoice) {
        setCreateNotice("Invoice could not be saved. Check item stock and party details.");
        return null;
      }

      return invoice;
    } finally {
      setIsSaving(false);
    }
  };

  const saveDraft = async () => {
    const invoice = await persistInvoice();
    if (invoice) {
      setCreateNotice(`${invoice.invoiceNumber} saved to Postgres. Stock and party balance refreshed from the workspace.`);
      onSavedInvoice(invoice);
    }
  };

  const saveAndNew = async () => {
    const invoice = await persistInvoice();
    if (!invoice) {
      return;
    }

    setDraftLines([]);
    setPaidAmount(0);
    setCreateNotice(`${invoice.invoiceNumber} saved to Postgres. Ready for the next invoice.`);
  };

  return (
    <div className="mbb-page-card sales-create-card">
      <div className="sales-create-topbar">
        <div className="sales-page-title">
          <button className="mbb-back-btn" onClick={onBack} aria-label="Back to sales invoices" type="button">
            <ArrowLeft size={28} />
          </button>
          <h1>Create Sales Invoice</h1>
        </div>

        <div className="sales-create-actions">
          <button
            className={`sales-keyboard-btn ${showCreateShortcuts ? "active" : ""}`}
            aria-label="Keyboard shortcuts"
            onClick={() => setShowCreateShortcuts(current => !current)}
            type="button"
          >
            <Keyboard size={22} />
          </button>
          <button className="sales-settings-btn has-alert" onClick={() => onNavigate("settings")} type="button">
            <Settings2 size={21} />
            Settings
          </button>
          <button className="sales-muted-save" disabled={isSaving} onClick={saveAndNew} type="button">
            Save &amp; New
          </button>
          <button className={`sales-save-btn ${draftLines.length ? "ready" : ""}`} disabled={isSaving} onClick={saveDraft} type="button">
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {showCreateShortcuts && (
        <div className="sales-action-strip">
          Shortcuts: select a party, add inventory, update quantity or price, then save the invoice to Postgres.
        </div>
      )}

      <div className="sales-form-scroll">
        <section className="sales-bill-section">
          <div>
            <h2>Bill To</h2>
            <label className="sales-add-party-box">
              <Plus size={16} />
              <select value={selectedPartyId} onChange={event => setSelectedPartyId(event.target.value)}>
                {parties.map(party => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <aside className="sales-invoice-meta">
            <label>
              Invoice Prefix:
              <input value="Auto from server" readOnly />
            </label>
            <label>
              Invoice Number:
              <input value="Assigned after save" readOnly />
            </label>
            <label>
              Sales Invoice Date:
              <span className="sales-date-control">
                <CalendarDays size={18} />
                {todayLabel}
                <ChevronDown size={16} />
              </span>
            </label>
            <button className="sales-meta-close" aria-label="Close payment details" type="button">
              <X size={18} />
            </button>
            <label>
              Payment Terms:
              <span className="sales-split-input">
                <input value="30" readOnly />
                <span>days</span>
              </span>
            </label>
            <label>
              Due Date:
              <span className="sales-date-control">
                <CalendarDays size={18} />
                {dueDateLabel}
                <ChevronDown size={16} />
              </span>
            </label>
            <label>
              E-Way Bill No:
              <input readOnly />
            </label>
            <label>
              CIN / DATE:
              <input readOnly />
            </label>
            <label>
              GRN / DATE:
              <input readOnly />
            </label>
            <label>
              TRANSPORT:
              <input readOnly />
            </label>
            <label>
              LR NO:
              <input readOnly />
            </label>
          </aside>
        </section>

        <section className="sales-line-items">
          {createNotice && <div className="sales-create-notice">{createNotice}</div>}
          <div className="sales-item-picker">
            <label>
              Item
              <select value={selectedItemId} onChange={event => setSelectedItemId(event.target.value)}>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.stock} PCS
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addDefaultItem}>
              <Plus size={17} />
              Add Selected Item
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>NO</th>
                <th>ITEMS / SERVICES</th>
                <th>HSN / SAC</th>
                <th>CIN / DATE</th>
                <th>COLOR</th>
                <th>GRN / DATE</th>
                <th>
                  MRP
                  <Info size={14} />
                </th>
                <th>QTY</th>
                <th>PRICE/ITEM ({RUPEE})</th>
                <th>DISCOUNT</th>
                <th>TAX</th>
                <th>AMOUNT ({RUPEE})</th>
                <th>
                  <button type="button" onClick={addDefaultItem} aria-label="Add line item">
                    <Plus size={24} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {draftLines.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <button className="sales-add-item-box" onClick={addDefaultItem} type="button">
                      <Plus size={17} />
                      Add Item
                    </button>
                  </td>
                  <td colSpan={4}>
                    <button className="sales-barcode-btn" type="button">
                      <ScanBarcode size={40} />
                      Scan Barcode
                    </button>
                  </td>
                </tr>
              ) : (
                draftLines.map((line, index) => (
                  <tr key={`${line.item.id}-${index}`} className="sales-real-line">
                    <td>{index + 1}</td>
                    <td>{line.item.name}</td>
                    <td>{line.item.hsn}</td>
                    <td>-</td>
                    <td>{line.item.color || "-"}</td>
                    <td>{line.item.grn || "-"}</td>
                    <td>{line.item.mrp ? formatMoney(line.item.mrp) : "-"}</td>
                    <td>
                      <input
                        className="sales-line-input"
                        min="1"
                        onChange={event => updateLine(index, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                        type="number"
                        value={line.quantity}
                      />
                    </td>
                    <td>
                      <input
                        className="sales-line-input"
                        min="0"
                        onChange={event => updateLine(index, { rate: Math.max(0, Number(event.target.value) || 0) })}
                        type="number"
                        value={line.rate}
                      />
                    </td>
                    <td>-</td>
                    <td>GST {line.item.gstRate}%</td>
                    <td>{formatMoney(line.rate * line.quantity)}</td>
                    <td>
                      <button type="button" onClick={addDefaultItem} aria-label="Add line item">
                        <Plus size={22} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={9} />
                <td>SUBTOTAL</td>
                <td>{formatMoney(totals.subtotal)}</td>
                <td>{formatMoney(totals.tax)}</td>
                <td>{formatMoney(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="sales-create-bottom">
          <div className="sales-create-left">
            <button type="button">+ Add Notes</button>
            <button type="button">+ Add Terms and Conditions</button>
            <div className="sales-bank-card">
              <h3>Bank Details</h3>
              <p>
                <span>Account Holder's Name:</span> {business.name || "-"}
              </p>
              <div className="sales-bank-actions">
                <button type="button">Change Bank Account</button>
                <button className="danger" type="button">Remove Bank Account</button>
              </div>
            </div>
            <button type="button">+ Add Payment QR</button>
          </div>

          <aside className="sales-total-panel">
            <div className="sales-total-line link">
              <button type="button">+ Add Additional Charges</button>
              <span>{formatMoney(0)}</span>
            </div>
            <div className="sales-total-line">
              <span>Taxable Amount</span>
              <span>{formatMoney(totals.subtotal)}</span>
            </div>
            <div className="sales-total-line link">
              <button type="button">+ Add Discount</button>
              <span>- {formatMoney(0)}</span>
            </div>
            <div className="sales-round-row">
              <label>
                <span className="sales-check" />
                Auto Round Off
              </label>
              <span className="sales-mini-add">+ Add</span>
              <span className="sales-mini-money">{formatMoney(0)}</span>
            </div>
            <div className="sales-grand-total">
              <strong>Total Amount</strong>
              <button type="button">Enter Payment amount</button>
            </div>
            <div className="sales-payment-row">
            <label>
              Mark as fully paid
                <button
                  className={`sales-check ${paidAmount >= totals.total && totals.total > 0 ? "active" : ""}`}
                  onClick={() => setPaidAmount(totals.total)}
                  type="button"
                  aria-label="Mark invoice as fully paid"
                />
              </label>
              <div className="sales-payment-input">
                <span>{RUPEE}</span>
                <input
                  min="0"
                  onChange={event => setPaidAmount(Math.max(0, Number(event.target.value) || 0))}
                  type="number"
                  value={paidAmount}
                />
                <select
                  aria-label="Payment mode"
                  value={paymentMode}
                  onChange={event => setPaymentMode(event.target.value)}
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                </select>
              </div>
            </div>
            <div className="sales-balance-line">
              <span>Balance Amount</span>
              <strong>{formatMoney(Math.max(0, totals.total - paidAmount))}</strong>
            </div>
            <div className="sales-signature">
              <span>
                Authorized signatory for <strong>{business.name || "Business"}</strong>
              </span>
              <button type="button">+ Add Signature</button>
            </div>
          </aside>
        </section>
      </div>

      <button className="mbb-help-bubble" aria-label="Help" type="button">
        ?
      </button>
    </div>
  );
}

interface SalesInvoiceDetailProps {
  invoice: InvoiceRow;
  onBack: () => void;
  onCancelInvoice: (invoice: InvoiceRow) => Promise<void> | void;
  onNavigate: (tab: string) => void;
  business: Business;
}

function SalesInvoiceDetail({ invoice, onBack, onCancelInvoice, onNavigate, business }: SalesInvoiceDetailProps) {
  const balance = getBalance(invoice);
  const [printNotice, setPrintNotice] = useState("");
  const [printingTemplate, setPrintingTemplate] = useState<InvoicePrintTemplate | "">("");
  const [printPreview, setPrintPreview] = useState<{ title: string; html: string } | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const openPrintTemplate = async (template: InvoicePrintTemplate) => {
    try {
      setPrintingTemplate(template);
      setPrintNotice(`Preparing ${template === "a4" ? "A4" : "thermal"} invoice preview...`);
      const html = await getSalesInvoicePrintHtml(invoice.id, template);
      setPrintPreview({ title: `${invoice.invoiceNumber} ${template === "a4" ? "A4" : "Thermal"} Invoice`, html });
      setPrintNotice(`${template === "a4" ? "A4" : "Thermal"} invoice preview is ready.`);
    } catch (error) {
      setPrintNotice(error instanceof Error ? error.message : "Invoice print preview could not be prepared.");
    } finally {
      setPrintingTemplate("");
    }
  };

  return (
    <div className="mbb-page-card sales-detail-card">
      <div className="sales-detail-top">
        <div className="sales-page-title">
          <button className="mbb-back-btn" onClick={onBack} aria-label="Back to sales invoices" type="button">
            <ArrowLeft size={29} />
          </button>
          <h1>Sales Invoice #{invoice.invoiceNumber}</h1>
          <span className={`sales-status-pill ${invoice.status}`}>{invoice.status}</span>
        </div>

        <div className="sales-detail-top-actions">
          <button onClick={() => onNavigate("reports")} type="button">
            <BadgeIndianRupee size={18} />
            Profit Details
          </button>
          <div className="sales-detail-more">
            <button aria-label="More options" onClick={() => setShowMoreMenu(current => !current)} type="button">
              <MoreVertical size={20} />
            </button>
            {showMoreMenu && (
              <div className="items-row-menu sales-detail-menu">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    onNavigate("payment-in");
                  }}
                  type="button"
                >
                  Record Payment
                </button>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    void openPrintTemplate("a4");
                  }}
                  type="button"
                >
                  A4 Print Preview
                </button>
                <button
                  className="danger"
                  disabled={invoice.status === "cancelled"}
                  onClick={() => {
                    setShowMoreMenu(false);
                    void onCancelInvoice(invoice);
                  }}
                  type="button"
                >
                  Cancel Invoice
                </button>
              </div>
            )}
          </div>
          <button aria-label="Keyboard shortcuts" onClick={() => onNavigate("settings")} type="button">
            <Keyboard size={19} />
          </button>
        </div>
      </div>

      <div className="sales-detail-toolbar">
        <div className="sales-doc-actions">
          <button disabled={printingTemplate === "a4"} onClick={() => openPrintTemplate("a4")} type="button">
            <ExternalLink size={18} />
            A4 Preview
            <ChevronDown size={18} />
          </button>
          <button disabled={printingTemplate === "a4"} onClick={() => openPrintTemplate("a4")} type="button">
            <Printer size={18} />
            Print A4
            <ChevronDown size={18} />
          </button>
          <button disabled={printingTemplate === "thermal"} onClick={() => openPrintTemplate("thermal")} type="button">
            <Printer size={18} />
            Thermal
            <ChevronDown size={18} />
          </button>
          <button className="icon-only" aria-label="Invoice information" type="button">
            <Info size={18} />
          </button>
          <button onClick={() => navigator.clipboard?.writeText(`Invoice ${invoice.invoiceNumber} - ${formatMoney(invoice.amount)}`)} type="button">
            <ExternalLink size={18} />
            Share
            <ChevronDown size={18} />
          </button>
        </div>

        <div className="sales-compliance-actions">
          <button onClick={() => onNavigate("e-invoicing")} type="button">Generate E-way Bill</button>
          <button onClick={() => onNavigate("e-invoicing")} type="button">Generate e-Invoice</button>
          <span />
          <button className="primary" onClick={() => onNavigate("payment-in")} type="button">Record Payment In</button>
        </div>
      </div>

      {printNotice && <div className="sales-action-strip sales-print-notice">{printNotice}</div>}

      <div className="sales-detail-body">
        <div className="sales-preview-scroll">
          <InvoiceDocument invoice={invoice} business={business} />
        </div>

        <aside className="sales-payment-history">
          <button className="sales-history-close" aria-label="Close payment history" type="button">
            <X size={21} />
          </button>
          <h2>Payment History</h2>
          <div className="sales-history-row">
            <span>Invoice Amount</span>
            <strong>{formatMoney(invoice.amount)}</strong>
          </div>
          <div className="sales-history-row">
            <span>Initial Amount Received</span>
            <strong>{formatMoney(invoice.paidAmount)}</strong>
          </div>
          <div className="sales-history-spacer" />
          <div className="sales-history-total">
            <span>Total Amount Received</span>
            <strong>{formatMoney(invoice.paidAmount)}</strong>
          </div>
          <div className="sales-history-balance">
            <span>Balance Amount</span>
            <strong>{formatMoney(balance)}</strong>
          </div>
        </aside>
      </div>

      {printPreview && (
        <HtmlPrintPreviewModal
          html={printPreview.html}
          onClose={() => setPrintPreview(null)}
          title={printPreview.title}
        />
      )}
    </div>
  );
}

interface InvoiceDocumentProps {
  invoice: InvoiceRow;
  business: Business;
}

function InvoiceDocument({ invoice, business }: InvoiceDocumentProps) {
  const balance = getBalance(invoice);
  const addressParts = [business.address, business.city, business.state, business.pincode].filter(Boolean);

  return (
    <article className="sales-invoice-paper">
      <header className="invoice-paper-header">
        <div>
          <strong>TAX INVOICE</strong>
          <span>ORIGINAL FOR RECIPIENT</span>
        </div>
        <strong>{business.name || "Business"}</strong>
      </header>

      <section className="invoice-company-grid">
        <div className="invoice-company-main">
          <div className="invoice-logo">{(business.name || "B").slice(0, 2).toUpperCase()}</div>
          <div>
            <h2>{business.name || "Business"}</h2>
            {addressParts.length > 0 && <p>{addressParts.join(", ")}</p>}
            {business.gstin && (
              <p>
                <strong>GSTIN:</strong> {business.gstin}
              </p>
            )}
            <p>
              <strong>Mobile:</strong> {business.phone || "-"}
            </p>
            {business.email && (
              <p>
                <strong>Email:</strong> {business.email}
              </p>
            )}
          </div>
        </div>
        <div className="invoice-meta-box">
          <p>
            <strong>Invoice No.</strong>
            {invoice.invoiceNumber}
          </p>
          <p>
            <strong>Invoice Date</strong>
            {invoice.date}
          </p>
        </div>
        <div className="invoice-party-box">
          <strong>BILL TO</strong>
          <b>{invoice.partyName}</b>
          <span>Place of Supply: {business.state || "-"}</span>
        </div>
        <div className="invoice-party-box">
          <strong>SHIP TO</strong>
          <b>{invoice.partyName}</b>
        </div>
      </section>

      <table className="invoice-paper-items">
        <thead>
          <tr>
            <th>S.NO.</th>
            <th>ITEMS</th>
            <th>HSN</th>
            <th>QTY</th>
            <th>RATE</th>
            <th>AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          <tr className="invoice-item-row">
            <td>1</td>
            <td>{invoice.itemName}</td>
            <td>{invoice.hsn}</td>
            <td>{invoice.qty} PCS</td>
            <td>{invoice.rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>{invoice.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td />
            <td className="tax-label">CGST @2.5%</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>{formatMoney(invoice.cgst, 2)}</td>
          </tr>
          <tr>
            <td />
            <td className="tax-label">SGST @2.5%</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>{formatMoney(invoice.sgst, 2)}</td>
          </tr>
          <tr className="invoice-total-row">
            <td />
            <td>TOTAL</td>
            <td />
            <td>{invoice.qty}</td>
            <td />
            <td>{formatMoney(invoice.amount)}</td>
          </tr>
        </tbody>
      </table>

      <table className="invoice-tax-table">
        <thead>
          <tr>
            <th>HSN/SAC</th>
            <th>Taxable Value</th>
            <th colSpan={2}>CGST</th>
            <th colSpan={2}>SGST</th>
            <th>Total Tax Amount</th>
          </tr>
          <tr>
            <th />
            <th />
            <th>Rate</th>
            <th>Amount</th>
            <th>Rate</th>
            <th>Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{invoice.hsn}</td>
            <td>{invoice.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>2.5%</td>
            <td>{invoice.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>2.5%</td>
            <td>{invoice.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>{formatMoney(invoice.cgst + invoice.sgst, 2)}</td>
          </tr>
          <tr>
            <td>Total</td>
            <td>{invoice.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td />
            <td>{invoice.cgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td />
            <td>{invoice.sgst.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>{formatMoney(invoice.cgst + invoice.sgst, 2)}</td>
          </tr>
        </tbody>
      </table>

      <section className="invoice-words">
        <strong>Total Amount (in words)</strong>
        <span>{formatMoney(invoice.amount)} only</span>
      </section>

      <section className="invoice-bank-details">
        <strong>Bank Details</strong>
        <p>
          <span>Name:</span> {business.name || "-"}
        </p>
      </section>

      <footer className="invoice-paper-footer">
        <span>Balance Amount</span>
        <strong>{formatMoney(balance)}</strong>
      </footer>
    </article>
  );
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
