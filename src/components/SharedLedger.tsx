import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  RefreshCw,
  Search,
  Share2,
  Users
} from "lucide-react";
import { generateSharedLedger, getPartyLedger, getSharedLedgers } from "../api";
import type { Business, Party, PartyLedgerEntry, SharedLedgerRow } from "../types";

interface SharedLedgerProps {
  business: Business;
  parties: Party[];
  onBack: () => void;
  onCreateParty: () => void;
}

const RUPEE = "\u20b9";

const formatMoney = (amount: number) =>
  `${amount < 0 ? "- " : ""}${RUPEE} ${Math.abs(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  })}`;

const balanceLabel = (balance: number) => {
  if (balance > 0) return "To Collect";
  if (balance < 0) return "To Pay";
  return "Settled";
};

export default function SharedLedger({ business, parties, onBack, onCreateParty }: SharedLedgerProps) {
  const [query, setQuery] = useState("");
  const [selectedPartyId, setSelectedPartyId] = useState(parties[0]?.id || "");
  const [ledgerRows, setLedgerRows] = useState<PartyLedgerEntry[]>([]);
  const [sharedRows, setSharedRows] = useState<SharedLedgerRow[]>([]);
  const [sharedLink, setSharedLink] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);

  const filteredParties = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return parties;
    return parties.filter(party =>
      [party.name, party.mobile, party.category, party.type].join(" ").toLowerCase().includes(normalized)
    );
  }, [parties, query]);

  const selectedParty = parties.find(party => party.id === selectedPartyId) || filteredParties[0] || null;
  const toCollect = parties.reduce((sum, party) => sum + Math.max(0, party.balance), 0);
  const toPay = parties.reduce((sum, party) => sum + Math.abs(Math.min(0, party.balance)), 0);
  const filteredSharedRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sharedRows;
    return sharedRows.filter(row =>
      [row.partyName, row.transactionType, row.transactionNumber, row.status].join(" ").toLowerCase().includes(normalized)
    );
  }, [query, sharedRows]);

  const loadSharedLedgerRegister = useCallback(async () => {
    setIsRegisterLoading(true);
    setNotice("");
    try {
      const data = await getSharedLedgers();
      setSharedRows(data.rows);
    } catch (error) {
      setSharedRows([]);
      setNotice(error instanceof Error ? error.message : "Unable to load SharedLedger register");
    } finally {
      setIsRegisterLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSharedLedgerRegister();
  }, [loadSharedLedgerRegister]);

  const openLedger = async (partyId: string) => {
    setSelectedPartyId(partyId);
    setIsLoading(true);
    setNotice("");
    setSharedLink("");
    try {
      const data = await getPartyLedger(partyId);
      setLedgerRows(data.ledger);
    } catch (error) {
      setLedgerRows([]);
      setNotice(error instanceof Error ? error.message : "Unable to load party ledger");
    } finally {
      setIsLoading(false);
    }
  };

  const shareLedger = async () => {
    const partyId = selectedParty?.id;
    if (!partyId) {
      setNotice("Create a party before generating a shared ledger link.");
      return;
    }

    try {
      setIsLoading(true);
      if (partyId !== selectedPartyId || ledgerRows.length === 0) {
        await openLedger(partyId);
      }
      const data = await generateSharedLedger(partyId);
      const url = `${window.location.origin}${data.url}`;
      setSharedLink(url);
      await loadSharedLedgerRegister();
      setNotice("Shared ledger link generated from live Postgres party data.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to generate shared ledger link");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mbb-screen shared-ledger-screen">
      <div className="mbb-page-card shared-ledger-card">
        <div className="mbb-items-header shared-ledger-header">
          <div>
            <button className="shared-ledger-back" onClick={onBack} type="button">
              <ArrowLeft size={17} />
            </button>
            <h1>SharedLedger</h1>
          </div>
          <div className="mbb-header-actions">
            <button className="mbb-report-btn" onClick={shareLedger} disabled={!selectedParty || isLoading} type="button">
              <Share2 size={16} />
              Share Ledger
            </button>
            <button className="mbb-primary-btn" onClick={onCreateParty} type="button">
              Create Party
            </button>
          </div>
        </div>

        {(notice || sharedLink) && (
          <div className="parties-action-strip">
            {notice && <span>{notice}</span>}
            {sharedLink && (
              <>
                <span>{sharedLink}</span>
                <button type="button" onClick={() => navigator.clipboard?.writeText(sharedLink)}>
                  <Copy size={14} />
                  Copy
                </button>
              </>
            )}
          </div>
        )}

        <div className="shared-ledger-stat-grid">
          <section className="business-stat-card active">
            <span><Users size={16} /> Parties</span>
            <strong>{parties.length}</strong>
          </section>
          <section className="business-stat-card green">
            <span>To Collect</span>
            <strong>{formatMoney(toCollect)}</strong>
          </section>
          <section className="business-stat-card red">
            <span>To Pay</span>
            <strong>{formatMoney(toPay)}</strong>
          </section>
          <section className="business-stat-card">
            <span>Business</span>
            <strong>{business.name}</strong>
          </section>
        </div>

        <section className="shared-ledger-register-card">
          <header>
            <div>
              <strong>View Only Mode</strong>
              <span>{filteredSharedRows.length} shared ledger transaction{filteredSharedRows.length === 1 ? "" : "s"}</span>
            </div>
            <button className="mbb-report-btn" onClick={loadSharedLedgerRegister} disabled={isRegisterLoading} type="button">
              <RefreshCw size={15} />
              Refresh
            </button>
          </header>
          <div className="shared-ledger-register-table-wrap">
            {isRegisterLoading ? (
              <div className="parties-ledger-loading">Loading SharedLedger register...</div>
            ) : (
              <table className="parties-ledger-table shared-ledger-register-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction Type</th>
                    <th>Transaction Number</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSharedRows.map(row => (
                    <tr key={row.id} onClick={() => openLedger(row.partyId)}>
                      <td>{row.date}</td>
                      <td>
                        <FileText size={14} />
                        {row.transactionType}
                        <small>{row.partyName}</small>
                      </td>
                      <td>{row.transactionNumber}</td>
                      <td>{formatMoney(row.amount)}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                  {filteredSharedRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>No shared ledgers found for this tenant.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <div className="shared-ledger-layout">
          <aside className="shared-ledger-party-panel">
            <label className="shared-ledger-search">
              <Search size={16} />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search parties" />
            </label>
            <div className="shared-ledger-party-list">
              {filteredParties.map(party => (
                <button
                  key={party.id}
                  className={selectedParty?.id === party.id ? "active" : ""}
                  onClick={() => openLedger(party.id)}
                  type="button"
                >
                  <span>
                    <strong>{party.name}</strong>
                    <small>{party.mobile || "-"} · {party.type}</small>
                  </span>
                  <b className={party.balance > 0 ? "collect" : party.balance < 0 ? "pay" : ""}>
                    {formatMoney(party.balance)}
                  </b>
                </button>
              ))}
              {filteredParties.length === 0 && <p>No parties found.</p>}
            </div>
          </aside>

          <main className="shared-ledger-detail-panel">
            {selectedParty ? (
              <>
                <header>
                  <div>
                    <span>{selectedParty.type === "supplier" ? "Supplier Ledger" : "Customer Ledger"}</span>
                    <h2>{selectedParty.name}</h2>
                    <p>{selectedParty.mobile || "-"} · {selectedParty.category || "-"} · {balanceLabel(selectedParty.balance)}</p>
                  </div>
                  <button className="mbb-outline-purple" onClick={shareLedger} disabled={isLoading} type="button">
                    <Link2 size={15} />
                    Generate Link
                  </button>
                </header>

                <div className="shared-ledger-summary">
                  <section>
                    <span>Current Balance</span>
                    <strong>{formatMoney(selectedParty.balance)}</strong>
                  </section>
                  <section>
                    <span>Ledger Entries</span>
                    <strong>{ledgerRows.length}</strong>
                  </section>
                  <section>
                    <span>Portal Status</span>
                    <strong>{sharedLink ? "Ready" : "Not generated"}</strong>
                  </section>
                </div>

                <div className="shared-ledger-table-wrap">
                  {isLoading ? (
                    <div className="parties-ledger-loading">Loading ledger from Postgres...</div>
                  ) : (
                    <table className="parties-ledger-table shared-ledger-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Voucher</th>
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
                            <td><FileText size={14} /> {entry.type}</td>
                            <td>{entry.number}</td>
                            <td>{entry.debit ? <><ArrowDown size={13} /> {formatMoney(entry.debit)}</> : "-"}</td>
                            <td>{entry.credit ? <><ArrowUp size={13} /> {formatMoney(entry.credit)}</> : "-"}</td>
                            <td>{formatMoney(entry.balance)}</td>
                          </tr>
                        ))}
                        {ledgerRows.length === 0 && (
                          <tr>
                            <td colSpan={6}>Select a party or generate a link to load real ledger entries.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                {sharedLink && (
                  <a className="shared-ledger-open-link" href={sharedLink} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} />
                    Open shared ledger portal
                  </a>
                )}
              </>
            ) : (
              <div className="online-orders-empty">
                <Users size={52} />
                <strong>No Parties Yet</strong>
                <span>A new tenant starts with fresh party data. Create a party to share ledgers.</span>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
