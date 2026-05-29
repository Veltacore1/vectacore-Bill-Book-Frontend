import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Ban,
  Banknote,
  CalendarDays,
  ChevronDown,
  FileBarChart,
  FileText,
  Keyboard,
  MessageCircle,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Settings2,
  X
} from "lucide-react";
import {
  cancelEInvoice,
  createAutomatedBill,
  createBankAccount,
  createBankTransaction,
  createExpense,
  getEInvoiceQrSvg,
  getEInvoiceRegister,
  retryEInvoice,
  transferMoney,
  triggerEInvoice
} from "../api";
import type { AccountingData, EInvoiceRecord, SalesInvoice } from "../types";

type AccountingView = "cash-bank" | "e-invoicing" | "automated-bills" | "expenses";

interface AccountingSolutionsProps {
  view: AccountingView;
  accounting: AccountingData;
  invoices: SalesInvoice[];
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh: () => Promise<void>;
}

const RUPEE = "\u20b9";

export default function AccountingSolutions({ view, accounting, invoices, onNavigate, onWorkspaceRefresh }: AccountingSolutionsProps) {
  if (view === "cash-bank") return <CashBankView accounting={accounting} onWorkspaceRefresh={onWorkspaceRefresh} />;
  if (view === "e-invoicing") return <EInvoicingView invoices={invoices} onWorkspaceRefresh={onWorkspaceRefresh} />;
  if (view === "automated-bills") return <AutomatedBillsView accounting={accounting} onWorkspaceRefresh={onWorkspaceRefresh} />;
  return <ExpensesView accounting={accounting} onNavigate={onNavigate} onWorkspaceRefresh={onWorkspaceRefresh} />;
}

function CashBankView({
  accounting,
  onWorkspaceRefresh
}: {
  accounting: AccountingData;
  onWorkspaceRefresh: () => Promise<void>;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounting.bankAccounts[0]?.id ?? "");
  const [modal, setModal] = useState<"money" | "transfer" | "account" | null>(null);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [moneyDraft, setMoneyDraft] = useState({
    accountId: accounting.bankAccounts[0]?.id ?? "",
    transactionType: "deposit" as "deposit" | "withdrawal",
    amount: 1000,
    description: "Manual cash adjustment"
  });
  const [transferDraft, setTransferDraft] = useState({
    fromAccountId: accounting.bankAccounts[0]?.id ?? "",
    toAccountId: accounting.bankAccounts[1]?.id ?? accounting.bankAccounts[0]?.id ?? "",
    amount: 1000,
    description: "Counter cash to bank transfer"
  });
  const [accountDraft, setAccountDraft] = useState({
    accountName: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    branch: "",
    openingBalance: 0
  });
  const totalBalance = accounting.bankAccounts.reduce((sum, account) => sum + account.balance, 0);
  const cashAccount = accounting.bankAccounts.find(account => account.name.toLowerCase().includes("cash"));
  const bankAccounts = accounting.bankAccounts.filter(account => account.id !== cashAccount?.id);
  const selectedAccount = accounting.bankAccounts.find(account => account.id === selectedAccountId) ?? accounting.bankAccounts[0];
  const visibleTransactions = useMemo(() => {
    if (!selectedAccount) return accounting.bankTransactions;
    return accounting.bankTransactions.filter(row => row.accountId === selectedAccount.id);
  }, [accounting.bankTransactions, selectedAccount]);

  const exportTransactions = () => {
    const rows = [
      ["Date", "Account", "Type", "Amount", "Reference", "Description"],
      ...visibleTransactions.map(row => [
        row.date,
        row.accountName,
        row.type,
        formatMoney(row.amount, 2),
        row.referenceNumber,
        row.description
      ])
    ];
    const blob = new Blob([rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cash-bank-transactions.csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("Cash and bank transactions exported as CSV.");
  };

  const saveMoney = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await createBankTransaction(moneyDraft);
      await onWorkspaceRefresh();
      setNotice("Money adjustment saved to Postgres.");
      setModal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Money adjustment could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveTransfer = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await transferMoney(transferDraft);
      await onWorkspaceRefresh();
      setNotice("Transfer saved to Postgres.");
      setModal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Transfer could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await createBankAccount(accountDraft);
      await onWorkspaceRefresh();
      setNotice("Bank account saved to Postgres.");
      setModal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Bank account could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mbb-screen accounting-screen">
      <div className="mbb-page-card cash-bank-card">
        <div className="accounting-titlebar">
          <h1>Cash and Bank</h1>
          <div className="accounting-actions">
            <button type="button" onClick={() => setModal("money")}><Plus size={15} /> Add/Reduce Money</button>
            <button type="button" onClick={() => setModal("transfer")}><ArrowLeftRight size={15} /> Transfer Money</button>
            <button className="mbb-primary-btn" type="button" onClick={() => setModal("account")}>+ Add New Account</button>
          </div>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}

        <div className="cash-bank-layout">
          <aside className="cash-accounts-panel">
            <div className="cash-total-row">
              <span>Total Balance:</span>
              <strong>{formatMoney(totalBalance, 2)}</strong>
            </div>
            <div className="cash-section-label">Cash</div>
            <button className={`cash-account-row ${selectedAccount?.id === cashAccount?.id ? "active" : ""}`} onClick={() => setSelectedAccountId(cashAccount?.id ?? "")} type="button">
              <span>{cashAccount?.name ?? "Cash in hand"}</span>
              <strong>{formatMoney(cashAccount?.balance ?? 0, 2)}</strong>
            </button>
            <div className="cash-section-label with-action">
              <span>Bank Accounts</span>
              <button type="button" onClick={() => setModal("account")}>+ Add New Bank</button>
            </div>
            {bankAccounts.map(account => (
              <button className={`cash-account-row bank-row ${selectedAccount?.id === account.id ? "active" : ""}`} onClick={() => setSelectedAccountId(account.id)} type="button" key={account.id}>
                <Banknote size={18} />
                <span>
                  {account.name}
                  <small>{account.accountNumber}</small>
                </span>
                <strong>{formatMoney(account.balance, 2)}</strong>
              </button>
            ))}
          </aside>

          <main className="cash-transactions-panel">
            <div className="cash-tabs">
              <button className="active" type="button">Transactions</button>
            </div>
            <div className="cash-filter-row">
              <button className="sales-filter-btn" type="button">
                <span><CalendarDays size={16} /> Last 30 Days</span>
                <ChevronDown size={16} />
              </button>
              <button className="cash-download-btn" aria-label="Download" onClick={exportTransactions} type="button">
                <ArrowDownToLine size={18} />
              </button>
            </div>
            {visibleTransactions.length > 0 ? (
              <div className="cash-transaction-table-wrap">
                <table className="mbb-items-table cash-transaction-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTransactions.map(row => (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <td>{row.type === "deposit" ? "Money In" : "Money Out"}</td>
                        <td className={row.type === "deposit" ? "positive-money" : "negative-money"}>
                          {row.type === "deposit" ? "+" : "-"} {formatMoney(row.amount, 2)}
                        </td>
                        <td>{row.referenceNumber}</td>
                        <td>{row.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="cash-empty-state">
                <div className="cash-empty-icon" aria-hidden="true">
                  <FileText size={58} />
                </div>
                <strong>No Transactions</strong>
                <span>You don't have any transaction in selected period</span>
              </div>
            )}
          </main>
        </div>
      </div>
      {modal === "money" && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveMoney}>
            <ModalHeader title="Add / Reduce Money" onClose={() => setModal(null)} />
            <div className="sales-register-form-grid">
              <label>
                <span>Account</span>
                <select value={moneyDraft.accountId} onChange={event => setMoneyDraft(current => ({ ...current, accountId: event.target.value }))}>
                  {accounting.bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label>
                <span>Type</span>
                <select value={moneyDraft.transactionType} onChange={event => setMoneyDraft(current => ({ ...current, transactionType: event.target.value as "deposit" | "withdrawal" }))}>
                  <option value="deposit">Add Money</option>
                  <option value="withdrawal">Reduce Money</option>
                </select>
              </label>
              <label>
                <span>Amount</span>
                <input min="1" type="number" value={moneyDraft.amount} onChange={event => setMoneyDraft(current => ({ ...current, amount: Number(event.target.value) }))} />
              </label>
              <label className="wide">
                <span>Description</span>
                <textarea value={moneyDraft.description} onChange={event => setMoneyDraft(current => ({ ...current, description: event.target.value }))} />
              </label>
            </div>
            <ModalFooter isSaving={isSaving} label="Save Money Entry" onCancel={() => setModal(null)} />
          </form>
        </div>
      )}
      {modal === "transfer" && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveTransfer}>
            <ModalHeader title="Transfer Money" onClose={() => setModal(null)} />
            <div className="sales-register-form-grid">
              <label>
                <span>From Account</span>
                <select value={transferDraft.fromAccountId} onChange={event => setTransferDraft(current => ({ ...current, fromAccountId: event.target.value }))}>
                  {accounting.bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label>
                <span>To Account</span>
                <select value={transferDraft.toAccountId} onChange={event => setTransferDraft(current => ({ ...current, toAccountId: event.target.value }))}>
                  {accounting.bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label>
                <span>Amount</span>
                <input min="1" type="number" value={transferDraft.amount} onChange={event => setTransferDraft(current => ({ ...current, amount: Number(event.target.value) }))} />
              </label>
              <label className="wide">
                <span>Description</span>
                <textarea value={transferDraft.description} onChange={event => setTransferDraft(current => ({ ...current, description: event.target.value }))} />
              </label>
            </div>
            <ModalFooter isSaving={isSaving} label="Save Transfer" onCancel={() => setModal(null)} />
          </form>
        </div>
      )}
      {modal === "account" && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveAccount}>
            <ModalHeader title="Add New Bank Account" onClose={() => setModal(null)} />
            <div className="sales-register-form-grid">
              <label>
                <span>Account Name</span>
                <input required value={accountDraft.accountName} onChange={event => setAccountDraft(current => ({ ...current, accountName: event.target.value }))} />
              </label>
              <label>
                <span>Bank Name</span>
                <input required value={accountDraft.bankName} onChange={event => setAccountDraft(current => ({ ...current, bankName: event.target.value }))} />
              </label>
              <label>
                <span>Account Number</span>
                <input required value={accountDraft.accountNumber} onChange={event => setAccountDraft(current => ({ ...current, accountNumber: event.target.value }))} />
              </label>
              <label>
                <span>IFSC Code</span>
                <input required value={accountDraft.ifscCode} onChange={event => setAccountDraft(current => ({ ...current, ifscCode: event.target.value }))} />
              </label>
              <label>
                <span>Branch</span>
                <input value={accountDraft.branch} onChange={event => setAccountDraft(current => ({ ...current, branch: event.target.value }))} />
              </label>
              <label>
                <span>Opening Balance</span>
                <input min="0" type="number" value={accountDraft.openingBalance} onChange={event => setAccountDraft(current => ({ ...current, openingBalance: Number(event.target.value) }))} />
              </label>
            </div>
            <ModalFooter isSaving={isSaving} label="Save Account" onCancel={() => setModal(null)} />
          </form>
        </div>
      )}
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="sales-register-modal-header">
      <h2>{title}</h2>
      <button type="button" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>
    </div>
  );
}

function ModalFooter({ isSaving, label, onCancel }: { isSaving: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="sales-register-modal-footer">
      <button type="button" className="mbb-bulk-btn" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit" className="mbb-primary-btn" disabled={isSaving}>
        {isSaving ? "Saving..." : label}
      </button>
    </div>
  );
}

function AutomatedBillsView({
  accounting,
  onWorkspaceRefresh
}: {
  accounting: AccountingData;
  onWorkspaceRefresh: () => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: "Showroom Rent",
    amount: 15000,
    frequency: "monthly",
    nextDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  });

  const saveAutomatedBill = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await createAutomatedBill(draft);
      await onWorkspaceRefresh();
      setNotice("Automated bill saved to Postgres.");
      setShowCreate(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Automated bill could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mbb-screen accounting-screen">
      <div className="mbb-page-card expenses-card">
        <div className="mbb-items-header expenses-header">
          <h1>Automated Bills</h1>
          <div className="mbb-header-actions">
            <button className="mbb-icon-btn" aria-label="Keyboard shortcuts" type="button">
              <Keyboard size={18} />
            </button>
            <button className="mbb-primary-btn expenses-create-btn" onClick={() => setShowCreate(true)} type="button">
              Create Automated Bill
            </button>
          </div>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}

        <div className="education-content automated-bills-content">
          {accounting.automatedBills.length === 0 ? (
            <>
              <div className="education-feature-grid">
                <article className="education-feature-card">
                  <div className="education-visual schedule">
                    <ReceiptText size={78} />
                  </div>
                  <div className="education-copy">
                    <strong>Creating repeated bills?</strong>
                    <span>Automate repeat bills based on a schedule and keep the register ready.</span>
                  </div>
                </article>
              </div>
              <div className="education-empty-note">No Automated Bills</div>
            </>
          ) : (
            <div className="expenses-table-wrap automated-bills-table-wrap">
              <table className="mbb-items-table expenses-table">
                <thead>
                  <tr>
                    <th>Bill Name</th>
                    <th>Frequency</th>
                    <th>Next Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounting.automatedBills.map(bill => (
                    <tr key={bill.id}>
                      <td>{bill.name}</td>
                      <td>{bill.frequency}</td>
                      <td>{bill.nextDueDate}</td>
                      <td>{formatMoney(bill.amount, 2)}</td>
                      <td>{bill.isActive ? "Active" : "Paused"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {showCreate && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveAutomatedBill}>
            <ModalHeader title="Create Automated Bill" onClose={() => setShowCreate(false)} />
            <div className="sales-register-form-grid">
              <label>
                <span>Bill Name</span>
                <input required value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Amount</span>
                <input min="1" type="number" value={draft.amount} onChange={event => setDraft(current => ({ ...current, amount: Number(event.target.value) }))} />
              </label>
              <label>
                <span>Frequency</span>
                <select value={draft.frequency} onChange={event => setDraft(current => ({ ...current, frequency: event.target.value }))}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label>
                <span>Next Due Date</span>
                <input required type="date" value={draft.nextDueDate} onChange={event => setDraft(current => ({ ...current, nextDueDate: event.target.value }))} />
              </label>
            </div>
            <ModalFooter isSaving={isSaving} label="Save Automated Bill" onCancel={() => setShowCreate(false)} />
          </form>
        </div>
      )}
    </div>
  );
}

function EInvoicingView({
  invoices,
  onWorkspaceRefresh
}: {
  invoices: SalesInvoice[];
  onWorkspaceRefresh: () => Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const [busyInvoiceId, setBusyInvoiceId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [registerRows, setRegisterRows] = useState<EInvoiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [qrPreview, setQrPreview] = useState<{ invoice: EInvoiceRecord; svg: string } | null>(null);
  const workspaceRows = useMemo(() => invoices.map(invoiceToEInvoiceRecord), [invoices]);
  const visibleInvoices = registerRows.length ? registerRows : workspaceRows;

  const loadRegister = async (filter = statusFilter) => {
    try {
      setIsLoading(true);
      const rows = await getEInvoiceRegister(filter);
      setRegisterRows(rows);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "E-Invoice register could not be loaded.");
      setRegisterRows(workspaceRows);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRegister(statusFilter);
    // workspaceRows is only a fallback; the register API is the source of truth here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const updateRow = (updated: EInvoiceRecord) => {
    setRegisterRows(current => current.map(row => row.id === updated.id ? updated : row));
  };

  const generateInvoice = async (invoice: EInvoiceRecord) => {
    try {
      setBusyInvoiceId(invoice.id);
      setNotice("");
      const result = await triggerEInvoice(invoice.id);
      updateRow(result.invoice);
      await onWorkspaceRefresh();
      setNotice(`${invoice.invoiceNumber} generated IRN ${result.irn.slice(0, 12)}...`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "E-Invoice could not be generated.");
    } finally {
      setBusyInvoiceId("");
    }
  };

  const retryInvoice = async (invoice: EInvoiceRecord) => {
    try {
      setBusyInvoiceId(invoice.id);
      const result = await retryEInvoice(invoice.id);
      updateRow(result.invoice);
      await onWorkspaceRefresh();
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "E-Invoice retry failed.");
    } finally {
      setBusyInvoiceId("");
    }
  };

  const cancelInvoice = async (invoice: EInvoiceRecord) => {
    const reason = window.prompt(`Cancel e-Invoice for ${invoice.invoiceNumber}?`, "Cancelled from e-invoicing workspace");
    if (!reason) return;
    try {
      setBusyInvoiceId(invoice.id);
      const result = await cancelEInvoice(invoice.id, reason);
      updateRow(result.invoice);
      await onWorkspaceRefresh();
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "E-Invoice cancel failed.");
    } finally {
      setBusyInvoiceId("");
    }
  };

  const openQrPreview = async (invoice: EInvoiceRecord) => {
    try {
      setBusyInvoiceId(invoice.id);
      const svg = await getEInvoiceQrSvg(invoice.id);
      setQrPreview({ invoice, svg });
      setNotice(`QR preview ready for ${invoice.invoiceNumber}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "QR preview could not be loaded.");
    } finally {
      setBusyInvoiceId("");
    }
  };

  return (
    <div className="mbb-screen accounting-screen">
      <div className="mbb-page-card expenses-card">
        <div className="accounting-titlebar education-titlebar">
          <div className="education-title-left">
            <h1>e-Invoicing</h1>
            <button type="button">What is e-Invoicing</button>
          </div>
          <button className="chat-support-btn" type="button">
            <MessageCircle size={15} />
            Chat Support
          </button>
        </div>
        {notice && <div className="sales-action-strip">{notice}</div>}

        <div className="einvoice-toolbar">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="generated">Generated</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button className="mbb-bulk-btn" onClick={() => loadRegister(statusFilter)} type="button">
            <RefreshCw size={16} />
            {isLoading ? "Refreshing..." : "Refresh Register"}
          </button>
        </div>

        <div className="expenses-table-wrap automated-bills-table-wrap">
          <table className="mbb-items-table expenses-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Party Name</th>
                <th>Date</th>
                <th>Amount</th>
                <th>IRN Status</th>
                <th>IRN / ACK</th>
                <th>Logs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map(invoice => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>
                    <strong>{invoice.partyName}</strong>
                    <small>{invoice.partyGstin || "GSTIN not set"}</small>
                  </td>
                  <td>{invoice.invoiceDate}</td>
                  <td>{formatMoney(invoice.totalAmount, 2)}</td>
                  <td>
                    <span className={`einvoice-status ${invoice.eInvoiceStatus}`}>{invoice.eInvoiceStatus}</span>
                    <small>Provider: {invoice.eInvoiceProvider || "not configured"}</small>
                    {invoice.eInvoiceLastError && <small>{invoice.eInvoiceLastError}</small>}
                    {invoice.eInvoiceCancelReason && <small>{invoice.eInvoiceCancelReason}</small>}
                  </td>
                  <td>
                    {invoice.irn ? (
                      <div className="einvoice-irn-cell">
                        <span>{invoice.irn.slice(0, 18)}...</span>
                        <small>ACK {invoice.ackNumber || "-"}</small>
                        {invoice.qrCodeData && (
                          <button className="einvoice-qr-link" type="button" onClick={() => openQrPreview(invoice)}>
                            <QrCode size={13} /> View QR
                          </button>
                        )}
                      </div>
                    ) : (
                      <small>Not generated</small>
                    )}
                  </td>
                  <td>
                    <div className="einvoice-log-stack">
                      {invoice.logs.slice(0, 2).map(log => (
                        <small key={log.id}>{log.event}: {log.status}</small>
                      ))}
                      {invoice.eInvoiceRetryCount > 0 && <small>{invoice.eInvoiceRetryCount} attempt(s)</small>}
                    </div>
                  </td>
                  <td>
                    <div className="einvoice-actions">
                      {invoice.eInvoiceStatus !== "generated" && invoice.eInvoiceStatus !== "cancelled" && (
                        <button
                          className="mbb-primary-btn"
                          disabled={busyInvoiceId === invoice.id}
                          onClick={() => generateInvoice(invoice)}
                          type="button"
                        >
                          {busyInvoiceId === invoice.id ? "Working..." : "Generate"}
                        </button>
                      )}
                      {invoice.eInvoiceStatus === "failed" && (
                        <button className="mbb-bulk-btn" disabled={busyInvoiceId === invoice.id} onClick={() => retryInvoice(invoice)} type="button">
                          Retry
                        </button>
                      )}
                      {invoice.eInvoiceStatus === "generated" && (
                        <button className="mbb-bulk-btn danger" disabled={busyInvoiceId === invoice.id} onClick={() => cancelInvoice(invoice)} type="button">
                          <Ban size={15} />
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleInvoices.length === 0 && (
            <div className="expenses-empty-state">
              <ReceiptText size={50} />
              <span>No sales invoices available for e-invoicing.</span>
            </div>
          )}
        </div>
        {qrPreview && (
          <div className="sales-register-modal-backdrop">
            <div className="einvoice-qr-modal">
              <div className="sales-register-modal-header">
                <h2>IRN QR Code</h2>
                <button type="button" onClick={() => setQrPreview(null)} aria-label="Close">
                  <X size={20} />
                </button>
              </div>
              <div className="einvoice-qr-body">
                <div className="einvoice-qr-svg" dangerouslySetInnerHTML={{ __html: qrPreview.svg }} />
                <div>
                  <strong>{qrPreview.invoice.invoiceNumber}</strong>
                  <span>{qrPreview.invoice.irn}</span>
                  <small>ACK {qrPreview.invoice.ackNumber || "-"}</small>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function invoiceToEInvoiceRecord(invoice: SalesInvoice): EInvoiceRecord {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    partyName: invoice.party.name,
    partyGstin: "",
    invoiceDate: invoice.date,
    totalAmount: invoice.total,
    invoiceStatus: invoice.status,
    irn: invoice.irn || "",
    ackNumber: invoice.ackNumber || "",
    ackDate: invoice.ackDate || "",
    qrCodeData: invoice.qrCodeData || "",
    eInvoiceStatus: invoice.eInvoiceStatus || (invoice.irn ? "generated" : "pending"),
    eInvoiceProvider: invoice.eInvoiceProvider || "local_stub",
    eInvoiceRetryCount: invoice.eInvoiceRetryCount || 0,
    eInvoiceLastError: invoice.eInvoiceLastError || "",
    eInvoiceCancelReason: invoice.eInvoiceCancelReason || "",
    eInvoiceCancelledAt: invoice.eInvoiceCancelledAt || "",
    logs: []
  };
}

function ExpensesView({
  accounting,
  onNavigate,
  onWorkspaceRefresh
}: {
  accounting: AccountingData;
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Expenses Categories");
  const [showCreate, setShowCreate] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({
    category: "Packing Saree boxes",
    amount: 1000,
    paidAmount: 1000,
    paymentMode: "Cash",
    referenceNumber: "",
    notes: ""
  });
  const categories = useMemo(() => {
    const unique = Array.from(new Set(accounting.expenses.map(expense => expense.category).filter(Boolean)));
    return ["All Expenses Categories", ...unique];
  }, [accounting.expenses]);
  const filteredExpenses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return accounting.expenses.filter(expense => {
      const matchesCategory = categoryFilter === "All Expenses Categories" || expense.category === categoryFilter;
      const matchesQuery = !normalized || [expense.number, expense.category, expense.paymentMode, expense.notes]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
      return matchesCategory && matchesQuery;
    });
  }, [accounting.expenses, categoryFilter, query]);

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      await createExpense(draft);
      await onWorkspaceRefresh();
      setNotice("Expense saved to Postgres.");
      setShowCreate(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Expense could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mbb-screen accounting-screen">
      <div className="mbb-page-card expenses-card">
        <div className="mbb-items-header expenses-header">
          <h1>Expenses</h1>
          <div className="mbb-header-actions">
            <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
              <FileBarChart size={16} />
              Reports
              <ChevronDown size={15} />
            </button>
            <button className="mbb-icon-btn has-alert" aria-label="Settings" onClick={() => onNavigate("settings")} type="button">
              <Settings2 size={18} />
            </button>
            <button className={`mbb-icon-btn ${showKeyboard ? "active" : ""}`} aria-label="Keyboard shortcuts" onClick={() => setShowKeyboard(current => !current)} type="button">
              <Keyboard size={18} />
            </button>
          </div>
        </div>
        {(notice || showKeyboard) && (
          <div className="sales-action-strip">
            {showKeyboard && <span>Shortcuts: / search, category filters expenses, Create Expense saves to Postgres.</span>}
            {notice && <span>{notice}</span>}
          </div>
        )}

        <div className="expenses-toolbar">
          <button className="sales-square-btn" aria-label="Search" type="button">
            <Search size={18} />
          </button>
          <label className="sales-search-field">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search expenses" />
          </label>
          <button className="sales-filter-btn" type="button">
            <span><CalendarDays size={16} /> Last 365 Days</span>
            <ChevronDown size={16} />
          </button>
          <label className="sales-filter-btn category-filter">
            <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
              {categories.map(category => <option key={category}>{category}</option>)}
            </select>
          </label>
          <div className="sales-toolbar-spacer" />
          <button className="mbb-primary-btn expenses-create-btn" onClick={() => setShowCreate(true)} type="button">Create Expense</button>
        </div>

        <div className="expenses-table-wrap">
          <table className="mbb-items-table expenses-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Expense Number</th>
                <th>Party Name</th>
                <th>Category</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map(expense => (
                <tr key={expense.id}>
                  <td>{expense.date}</td>
                  <td>{expense.number}</td>
                  <td>-</td>
                  <td>{expense.category}</td>
                  <td>{formatMoney(expense.amount, 2)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          {filteredExpenses.length === 0 && (
            <div className="expenses-empty-state">
              <ReceiptText size={50} />
              <X size={18} />
              <span>No Transactions Matching the current filter</span>
            </div>
          )}
        </div>
      </div>
      {showCreate && (
        <div className="sales-register-modal-backdrop">
          <form className="sales-register-modal purchase-register-modal" onSubmit={saveExpense}>
            <ModalHeader title="Create Expense" onClose={() => setShowCreate(false)} />
            <div className="sales-register-form-grid">
              <label>
                <span>Category</span>
                <input required value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} />
              </label>
              <label>
                <span>Amount</span>
                <input min="1" type="number" value={draft.amount} onChange={event => {
                  const amount = Number(event.target.value);
                  setDraft(current => ({ ...current, amount, paidAmount: amount }));
                }} />
              </label>
              <label>
                <span>Paid Amount</span>
                <input min="0" type="number" value={draft.paidAmount} onChange={event => setDraft(current => ({ ...current, paidAmount: Number(event.target.value) }))} />
              </label>
              <label>
                <span>Payment Mode</span>
                <select value={draft.paymentMode} onChange={event => setDraft(current => ({ ...current, paymentMode: event.target.value }))}>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>UPI</option>
                  <option>Cheque</option>
                </select>
              </label>
              <label>
                <span>Reference Number</span>
                <input value={draft.referenceNumber} onChange={event => setDraft(current => ({ ...current, referenceNumber: event.target.value }))} />
              </label>
              <label className="wide">
                <span>Notes</span>
                <textarea value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <ModalFooter isSaving={isSaving} label="Save Expense" onCancel={() => setShowCreate(false)} />
          </form>
        </div>
      )}
    </div>
  );
}

function formatMoney(amount: number, decimals = 0) {
  return `${amount < 0 ? "- " : ""}${RUPEE} ${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}
