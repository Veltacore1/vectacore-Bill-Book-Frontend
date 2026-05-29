import { useEffect, useState } from "react";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { getSharedLedgerPortal } from "../api";
import type { SharedLedgerPortalData } from "../types";

interface PublicSharedLedgerProps {
  token: string;
  onExit: () => void;
}

const RUPEE = "\u20b9";

const formatMoney = (amount: number) =>
  `${amount < 0 ? "- " : ""}${RUPEE} ${Math.abs(amount || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  })}`;

export default function PublicSharedLedger({ token, onExit }: PublicSharedLedgerProps) {
  const [data, setData] = useState<SharedLedgerPortalData | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadLedger = async () => {
    setIsLoading(true);
    setError("");
    try {
      setData(await getSharedLedgerPortal(token));
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Shared ledger could not be opened");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLedger();
  }, [token]);

  return (
    <div className="public-ledger-screen">
      <main className="public-ledger-card">
        <header className="public-ledger-header">
          <button type="button" onClick={onExit}>
            <ArrowLeft size={17} />
          </button>
          <div>
            <strong>{data?.business.name || "SharedLedger"}</strong>
            <span>View Only Mode</span>
          </div>
          <button type="button" onClick={loadLedger} disabled={isLoading}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </header>

        {isLoading && <div className="parties-ledger-loading">Loading shared ledger...</div>}
        {error && <div className="tenant-api-banner"><strong>SharedLedger</strong><span>{error}</span></div>}

        {data && (
          <>
            <section className="public-ledger-summary">
              <div>
                <span>Party</span>
                <strong>{data.party.name}</strong>
              </div>
              <div>
                <span>Current Balance</span>
                <strong>{formatMoney(data.summary.currentBalance)}</strong>
              </div>
              <div>
                <span>Transactions</span>
                <strong>{data.summary.entries}</strong>
              </div>
            </section>

            <div className="public-ledger-table-wrap">
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
                  {data.ledger.map((row, index) => (
                    <tr key={`${row.date}-${row.number}-${index}`}>
                      <td>{row.date}</td>
                      <td><FileText size={14} /> {row.type}</td>
                      <td>{row.number}</td>
                      <td>{formatMoney(row.amount ?? (row.debit || row.credit))}</td>
                      <td>{row.status || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
