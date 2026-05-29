import { type FormEvent, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Edit3,
  FileBarChart,
  Keyboard,
  Link2,
  MoreVertical,
  Search,
  Settings2,
  Share2,
  Trash2,
  X,
  Users
} from "lucide-react";
import { deleteParty, generateSharedLedger, getPartyLedger, updateParty } from "../api";
import type { Party, PartyLedgerEntry } from "../types";

interface PartiesProps {
  parties: Party[];
  onAddPartyClick: () => void;
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh: () => Promise<void> | void;
}

type PartyRow = {
  id: string;
  name: string;
  category: string;
  mobile: string;
  type: "Customer" | "Supplier";
  balance: number;
};

const RUPEE = "\u20b9";

const formatMoney = (amount: number, decimals = 0) =>
  `${amount < 0 ? "- " : ""}${RUPEE} ${Math.abs(amount).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;

type PartyTypeFilter = "all" | "customer" | "supplier";

type PartyFormState = {
  id: string;
  name: string;
  mobile: string;
  type: "customer" | "supplier";
  balance: string;
  category: string;
  email: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  creditLimit: string;
  creditDays: string;
};

const formFromParty = (party: Party): PartyFormState => ({
  id: party.id,
  name: party.name,
  mobile: party.mobile === "-" ? "" : party.mobile,
  type: party.type,
  balance: String(Math.abs(party.balance || 0)),
  category: party.category === "-" ? "" : party.category || "",
  email: party.email || "",
  gstin: party.gstin || "",
  address: party.address || "",
  city: party.city || "",
  state: party.state || "Tamil Nadu",
  pincode: party.pincode || "",
  creditLimit: party.creditLimit === undefined ? "" : String(party.creditLimit),
  creditDays: party.creditDays === undefined ? "" : String(party.creditDays)
});

export default function Parties({ parties, onAddPartyClick, onNavigate, onWorkspaceRefresh }: PartiesProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sharedLink, setSharedLink] = useState("");
  const [partyTypeFilter, setPartyTypeFilter] = useState<PartyTypeFilter>("all");
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [showBulkSummary, setShowBulkSummary] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [rowMenuPartyId, setRowMenuPartyId] = useState<string | null>(null);
  const [editingParty, setEditingParty] = useState<PartyFormState | null>(null);
  const [ledgerRows, setLedgerRows] = useState<PartyLedgerEntry[]>([]);
  const [isLedgerLoading, setIsLedgerLoading] = useState(false);
  const [isSavingParty, setIsSavingParty] = useState(false);
  const [partyNotice, setPartyNotice] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const customRows: PartyRow[] = parties.map(party => ({
      id: party.id,
      name: party.name.toUpperCase(),
      category: party.category || "-",
      mobile: party.mobile || "-",
      type: party.type === "supplier" ? "Supplier" : "Customer",
      balance: party.balance
    }));

    return customRows.filter(row => {
      const haystack = `${row.name} ${row.category} ${row.mobile}`.toLowerCase();
      const matchesSearch = haystack.includes(searchQuery.toLowerCase());
      const matchesType = partyTypeFilter === "all" || row.type.toLowerCase() === partyTypeFilter;
      const matchesDue = !showDueOnly || row.balance !== 0;
      return matchesSearch && matchesType && matchesDue;
    });
  }, [parties, partyTypeFilter, searchQuery, showDueOnly]);

  const toCollect = parties.reduce((sum, party) => sum + Math.max(0, party.balance), 0);
  const toPay = parties.reduce((sum, party) => sum + Math.abs(Math.min(0, party.balance)), 0);
  const selectedParty = rows.find(row => row.id === selectedPartyId) ?? null;
  const dueRows = rows.filter(row => row.balance !== 0);

  const openPartyLedger = async (partyId: string) => {
    setSelectedPartyId(partyId);
    setIsLedgerLoading(true);
    setPartyNotice("");
    try {
      const data = await getPartyLedger(partyId);
      setLedgerRows(data.ledger);
    } catch (error) {
      setLedgerRows([]);
      setPartyNotice(error instanceof Error ? error.message : "Unable to load party ledger");
    } finally {
      setIsLedgerLoading(false);
    }
  };

  const handleShareLedger = async (partyIdOverride?: string) => {
    const partyId = partyIdOverride ?? selectedPartyId ?? rows[0]?.id;
    if (!partyId) {
      setPartyNotice("Create a party before generating a shared ledger link.");
      return;
    }

    try {
      if (partyId !== selectedPartyId) {
        await openPartyLedger(partyId);
      }
      const data = await generateSharedLedger(partyId);
      const origin = window.location.origin;
      setSharedLink(`${origin}${data.url}`);
      setPartyNotice("Shared ledger link generated from Postgres party data.");
      await onWorkspaceRefresh();
    } catch (error) {
      setPartyNotice(error instanceof Error ? error.message : "Unable to generate shared ledger link");
    }
  };

  const copySharedLink = async () => {
    if (!sharedLink) return;
    try {
      await navigator.clipboard?.writeText(sharedLink);
      setPartyNotice("Shared ledger link copied.");
    } catch {
      setPartyNotice(sharedLink);
    }
  };

  const handlePendingActions = () => {
    setShowDueOnly(current => !current);
    setPartyTypeFilter("all");
  };

  const handleBulkGenerateLedgers = async () => {
    if (dueRows.length === 0) {
      setPartyNotice("No open party balances need shared ledger links.");
      return;
    }

    setShowBulkMenu(false);
    setPartyNotice("Generating shared ledger links from live party balances...");
    try {
      await Promise.all(dueRows.map(row => generateSharedLedger(row.id)));
      await onWorkspaceRefresh();
      setPartyNotice(`${dueRows.length} shared ledger link${dueRows.length === 1 ? "" : "s"} generated for open balances.`);
    } catch (error) {
      setPartyNotice(error instanceof Error ? error.message : "Bulk shared ledger generation failed");
    }
  };

  const handleEditParty = (partyId: string) => {
    const party = parties.find(row => row.id === partyId);
    if (!party) return;
    setEditingParty(formFromParty(party));
    setRowMenuPartyId(null);
  };

  const handleSaveParty = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingParty) return;

    setIsSavingParty(true);
    setPartyNotice("");
    try {
      await updateParty({
        id: editingParty.id,
        name: editingParty.name,
        mobile: editingParty.mobile,
        type: editingParty.type,
        balance: Number(editingParty.balance) || 0,
        category: editingParty.category,
        email: editingParty.email,
        gstin: editingParty.gstin,
        address: editingParty.address,
        city: editingParty.city,
        state: editingParty.state,
        pincode: editingParty.pincode,
        creditLimit: editingParty.creditLimit ? Number(editingParty.creditLimit) : undefined,
        creditDays: editingParty.creditDays ? Number(editingParty.creditDays) : undefined
      });
      await onWorkspaceRefresh();
      setEditingParty(null);
      setPartyNotice("Party updated in Postgres.");
    } catch (error) {
      setPartyNotice(error instanceof Error ? error.message : "Party update failed");
    } finally {
      setIsSavingParty(false);
    }
  };

  const handleDeleteParty = async (partyId: string) => {
    const party = parties.find(row => row.id === partyId);
    if (!party) return;
    setRowMenuPartyId(null);

    if (!window.confirm(`Delete ${party.name} from this tenant?`)) return;

    try {
      await deleteParty(partyId);
      await onWorkspaceRefresh();
      if (selectedPartyId === partyId) {
        setSelectedPartyId(null);
        setLedgerRows([]);
      }
      setPartyNotice(`${party.name} removed from All Parties.`);
    } catch (error) {
      setPartyNotice(error instanceof Error ? error.message : "Party delete failed");
    }
  };

  return (
    <div className="mbb-screen parties-screen">
      <div className="mbb-page-card parties-card">
        <div className="mbb-items-header parties-header">
          <h1>Parties</h1>
          <div className="mbb-header-actions">
            <button className="mbb-outline-purple" type="button" onClick={() => onNavigate("shared-ledger")}>
              <Share2 size={16} />
              SharedLedger Portal
            </button>
            <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
              <FileBarChart size={16} />
              Reports
              <ChevronDown size={15} />
            </button>
            <button className="mbb-icon-btn has-alert" aria-label="Settings" onClick={() => onNavigate("settings")} type="button">
              <Settings2 size={18} />
            </button>
            <button className="mbb-icon-btn" aria-label="Keyboard shortcuts" onClick={() => setShowShortcuts(current => !current)} type="button">
              <Keyboard size={18} />
            </button>
          </div>
        </div>

        <div className="parties-ledger-banner">
          <div className="ledger-notebook" aria-hidden="true" />
          <div>
            <strong>Are you Tired of asking Party's Ledger?</strong>
            <span>Access sharedledgers and turn invoices into purchases instantly.</span>
          </div>
          <button type="button" onClick={() => onNavigate("shared-ledger")}>View SharedLedgers</button>
        </div>

        {(sharedLink || partyNotice || showShortcuts || showBulkSummary) && (
          <div className="parties-action-strip">
            {sharedLink && <span>{sharedLink}</span>}
            {partyNotice && <span>{partyNotice}</span>}
            {showShortcuts && <span>Shortcuts: / search, Enter opens selected ledger, Ctrl+N creates party.</span>}
            {showBulkSummary && <span>{dueRows.length} parties have open balances. Collect {formatMoney(toCollect, 2)} and pay {formatMoney(toPay, 2)}.</span>}
            {sharedLink && <button type="button" onClick={copySharedLink}>Copy</button>}
          </div>
        )}

        <div className="parties-stat-grid">
          <button className={`parties-stat-card ${partyTypeFilter === "all" && !showDueOnly ? "active" : ""}`} onClick={() => { setPartyTypeFilter("all"); setShowDueOnly(false); }} type="button">
            <span><Users size={15} /> All Parties</span>
            <strong>{parties.length}</strong>
          </button>
          <button className={`parties-stat-card ${partyTypeFilter === "customer" ? "active" : ""}`} onClick={() => { setPartyTypeFilter("customer"); setShowDueOnly(false); }} type="button">
            <span className="green">To Collect</span>
            <strong>{formatMoney(toCollect, 2)}</strong>
          </button>
          <button className={`parties-stat-card ${partyTypeFilter === "supplier" ? "active" : ""}`} onClick={() => { setPartyTypeFilter("supplier"); setShowDueOnly(false); }} type="button">
            <span className="red">To Pay</span>
            <strong>{formatMoney(toPay, 2)}</strong>
          </button>
        </div>

        <div className="parties-toolbar">
          <button className="sales-square-btn" aria-label="Search" onClick={() => searchRef.current?.focus()} type="button">
            <Search size={18} />
          </button>
          <label className="mbb-search-box parties-search">
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search parties"
            />
            <ChevronDown size={17} />
          </label>
          <div className="sales-toolbar-spacer" />
          <div className="parties-bulk-menu-wrap">
            <button className="mbb-bulk-btn" onClick={() => setShowBulkMenu(current => !current)} type="button">
              Bulk Action
              <ChevronDown size={15} />
            </button>
            {showBulkMenu && (
              <div className="parties-bulk-menu">
                <button type="button" onClick={() => { setShowBulkSummary(current => !current); setShowBulkMenu(false); }}>
                  <Check size={14} />
                  Open balance summary
                </button>
                <button type="button" onClick={handleBulkGenerateLedgers}>
                  <Link2 size={14} />
                  Generate shared ledgers
                </button>
                <button type="button" onClick={() => { onNavigate("reports"); setShowBulkMenu(false); }}>
                  <FileBarChart size={14} />
                  Party reports
                </button>
              </div>
            )}
          </div>
          <button className="mbb-primary-btn parties-create-btn" onClick={onAddPartyClick} type="button">
            Create Party
          </button>
        </div>

        {selectedParty && (
          <section className="parties-detail-panel">
            <header>
              <div>
                <strong>{selectedParty.name}</strong>
                <span>{selectedParty.type} · {selectedParty.mobile} · {selectedParty.category}</span>
              </div>
              <div>
                <button className="mbb-outline-purple" onClick={() => handleShareLedger(selectedParty.id)} type="button">
                  <Share2 size={15} />
                  Share Ledger
                </button>
                <button className="mbb-report-btn" onClick={() => setSelectedPartyId(null)} type="button">
                  Close
                </button>
              </div>
            </header>
            <div className="parties-ledger-table-wrap">
              {isLedgerLoading ? (
                <div className="parties-ledger-loading">Loading real-time ledger...</div>
              ) : (
                <table className="parties-ledger-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Number</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map(entry => (
                      <tr key={`${entry.date}-${entry.type}-${entry.number}-${entry.balance}`}>
                        <td>{entry.date}</td>
                        <td>{entry.type}</td>
                        <td>{entry.number}</td>
                        <td>{entry.debit ? formatMoney(entry.debit) : "-"}</td>
                        <td>{entry.credit ? formatMoney(entry.credit) : "-"}</td>
                        <td>{formatMoney(entry.balance)}</td>
                      </tr>
                    ))}
                    {ledgerRows.length === 0 && (
                      <tr>
                        <td colSpan={6}>No ledger entries found for this party.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        <div className="parties-table-wrap">
          <table className="mbb-items-table parties-table">
            <thead>
              <tr>
                <th>Party Name</th>
                <th>Category</th>
                <th>Mobile Number</th>
                <th>Party type</th>
                <th>Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr className={selectedPartyId === row.id ? "selected" : ""} key={row.id} onClick={() => openPartyLedger(row.id)}>
                  <td>{row.name}</td>
                  <td>{row.category}</td>
                  <td>{row.mobile}</td>
                  <td>{row.type}</td>
                  <td className={row.balance > 0 ? "parties-balance-positive" : row.balance < 0 ? "parties-balance-negative" : ""}>
                    {row.balance > 0 && <ArrowDown size={14} />}
                    {row.balance < 0 && <ArrowUp size={14} />}
                    {formatMoney(Math.abs(row.balance))}
                  </td>
                  <td>
                    <div className="parties-row-actions">
                      <button
                        className="mbb-row-menu"
                        aria-label={`Open actions for ${row.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRowMenuPartyId(current => current === row.id ? null : row.id);
                        }}
                        type="button"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {rowMenuPartyId === row.id && (
                        <div className="parties-row-menu">
                          <button type="button" onClick={(event) => { event.stopPropagation(); openPartyLedger(row.id); setRowMenuPartyId(null); }}>
                            <FileBarChart size={14} />
                            View Ledger
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); handleShareLedger(row.id); setRowMenuPartyId(null); }}>
                            <Share2 size={14} />
                            Share Ledger
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); handleEditParty(row.id); }}>
                            <Edit3 size={14} />
                            Edit
                          </button>
                          <button className="danger" type="button" onClick={(event) => { event.stopPropagation(); handleDeleteParty(row.id); }}>
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>No parties match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <button className="mbb-pending-actions" onClick={handlePendingActions} type="button">
          <span>Pending Actions</span>
          <b>{parties.filter(party => party.balance !== 0).length}</b>
        </button>
      </div>

      {editingParty && (
        <div className="party-edit-backdrop">
          <form className="party-edit-modal" onSubmit={handleSaveParty}>
            <header>
              <strong>Edit Party</strong>
              <button type="button" onClick={() => setEditingParty(null)} aria-label="Close edit party">
                <X size={18} />
              </button>
            </header>
            <div className="party-edit-grid">
              <label>
                Party Name
                <input required value={editingParty.name} onChange={event => setEditingParty({ ...editingParty, name: event.target.value })} />
              </label>
              <label>
                Mobile Number
                <input value={editingParty.mobile} onChange={event => setEditingParty({ ...editingParty, mobile: event.target.value })} />
              </label>
              <label>
                Party Type
                <select value={editingParty.type} onChange={event => setEditingParty({ ...editingParty, type: event.target.value as "customer" | "supplier" })}>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                </select>
              </label>
              <label>
                Category
                <input value={editingParty.category} onChange={event => setEditingParty({ ...editingParty, category: event.target.value })} />
              </label>
              <label>
                Opening Balance
                <input type="number" min="0" value={editingParty.balance} onChange={event => setEditingParty({ ...editingParty, balance: event.target.value })} />
              </label>
              <label>
                GSTIN
                <input value={editingParty.gstin} onChange={event => setEditingParty({ ...editingParty, gstin: event.target.value })} />
              </label>
              <label>
                Email
                <input value={editingParty.email} onChange={event => setEditingParty({ ...editingParty, email: event.target.value })} />
              </label>
              <label>
                City
                <input value={editingParty.city} onChange={event => setEditingParty({ ...editingParty, city: event.target.value })} />
              </label>
              <label>
                State
                <input value={editingParty.state} onChange={event => setEditingParty({ ...editingParty, state: event.target.value })} />
              </label>
              <label>
                Pincode
                <input value={editingParty.pincode} onChange={event => setEditingParty({ ...editingParty, pincode: event.target.value })} />
              </label>
              <label>
                Credit Limit
                <input type="number" min="0" value={editingParty.creditLimit} onChange={event => setEditingParty({ ...editingParty, creditLimit: event.target.value })} />
              </label>
              <label>
                Credit Days
                <input type="number" min="0" value={editingParty.creditDays} onChange={event => setEditingParty({ ...editingParty, creditDays: event.target.value })} />
              </label>
              <label className="party-edit-wide">
                Billing Address
                <textarea value={editingParty.address} onChange={event => setEditingParty({ ...editingParty, address: event.target.value })} />
              </label>
            </div>
            <footer>
              <button className="mbb-report-btn" type="button" onClick={() => setEditingParty(null)}>Cancel</button>
              <button className="mbb-primary-btn" disabled={isSavingParty} type="submit">
                {isSavingParty ? "Saving..." : "Save Party"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
