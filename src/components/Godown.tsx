import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileBarChart,
  Keyboard,
  MapPin,
  MoreVertical,
  Package,
  Plus,
  Search,
  Settings2,
  Warehouse,
  X
} from "lucide-react";
import {
  createGodown,
  deleteGodown,
  getGodownSummary,
  getGodownTransfers,
  getStockMovements,
  setDefaultGodown,
  transferItemStock,
  updateGodown
} from "../api";
import type { Godown as GodownType, GodownTransfer, Item, StockMovement } from "../types";

interface GodownProps {
  godowns: GodownType[];
  items: Item[];
  onNavigate?: (tab: string) => void;
  onWorkspaceRefresh?: () => Promise<unknown> | unknown;
}

type StockRow = Item & {
  itemCode: string;
  allocations: Record<string, number>;
};

type DateFilter = "30" | "365" | "all";

const RUPEE = "\u20b9";

const formatMoney = (amount: number) =>
  `${RUPEE} ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const movementLabel = (type: string) =>
  type
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function Godown({ godowns, items, onNavigate, onWorkspaceRefresh }: GodownProps) {
  const [warehouseList, setWarehouseList] = useState<GodownType[]>(godowns);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [transferRows, setTransferRows] = useState<GodownTransfer[]>([]);
  const [selectedGodownId, setSelectedGodownId] = useState(godowns[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [godownSearchQuery, setGodownSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"stock" | "transfers" | "ledger">("stock");
  const [showAddGodown, setShowAddGodown] = useState(false);
  const [editingGodown, setEditingGodown] = useState<GodownType | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [newGodown, setNewGodown] = useState({ name: "", location: "" });
  const [transferDraft, setTransferDraft] = useState({
    itemId: items[0]?.id ?? "",
    from: godowns[0]?.id ?? "",
    to: godowns[1]?.id ?? godowns[0]?.id ?? "",
    quantity: 1,
    notes: ""
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("365");
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [openGodownMenuId, setOpenGodownMenuId] = useState<string | null>(null);
  const [openStockMenuId, setOpenStockMenuId] = useState<string | null>(null);

  useEffect(() => {
    setWarehouseList(godowns);
    setSelectedGodownId(current => current || godowns[0]?.id || "");
    setTransferDraft(current => ({
      ...current,
      itemId: current.itemId || items[0]?.id || "",
      from: current.from || godowns[0]?.id || "",
      to: current.to || godowns.find(godown => godown.id !== current.from)?.id || godowns[0]?.id || ""
    }));
  }, [godowns, items]);

  const loadWarehouseSummary = async () => {
    try {
      const rows = await getGodownSummary();
      setWarehouseList(rows);
      setErrorMessage("");
    } catch (error) {
      setWarehouseList(godowns);
      setErrorMessage(error instanceof Error ? error.message : "Godown summary could not be loaded");
    }
  };

  const loadMovements = async () => {
    setIsLoadingLedger(true);
    try {
      const [movementRows, transferHistory] = await Promise.all([
        getStockMovements(),
        getGodownTransfers()
      ]);
      setMovements(movementRows);
      setTransferRows(transferHistory);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Stock ledger could not be loaded");
    } finally {
      setIsLoadingLedger(false);
    }
  };

  useEffect(() => {
    loadWarehouseSummary();
    loadMovements();
  }, []);

  const stockRows = useMemo<StockRow[]>(() => {
    const allocationMap = new Map<string, Record<string, number>>();

    movements.forEach(movement => {
      if (!movement.itemId || !movement.godownId) return;
      const allocations = allocationMap.get(movement.itemId) ?? {};
      allocations[movement.godownId] = (allocations[movement.godownId] ?? 0) + movement.quantity;
      allocationMap.set(movement.itemId, allocations);
    });

    return items.map(item => {
      const balanceAllocations = item.godownStocks?.reduce<Record<string, number>>((allocations, stock) => {
        allocations[stock.godownId] = stock.currentStock;
        return allocations;
      }, {});
      const movementAllocations = allocationMap.get(item.id);
      const fallbackAllocations = item.godownId ? { [item.godownId]: item.stock } : {};

      return {
        ...item,
        itemCode: item.itemCode || "",
        allocations: balanceAllocations && Object.keys(balanceAllocations).length
          ? balanceAllocations
          : movementAllocations && Object.keys(movementAllocations).length
            ? movementAllocations
            : fallbackAllocations
      };
    });
  }, [items, movements]);

  const isWithinDateFilter = (dateValue: string) => {
    if (dateFilter === "all" || !dateValue || dateValue === "-") return true;
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return true;
    const ageMs = Date.now() - parsed.getTime();
    return ageMs <= Number(dateFilter) * 24 * 60 * 60 * 1000;
  };

  const transfers = useMemo(() => {
    return transferRows.filter(transfer => {
      const matchesGodown =
        !selectedGodownId ||
        transfer.fromGodownId === selectedGodownId ||
        transfer.toGodownId === selectedGodownId;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        transfer.itemName.toLowerCase().includes(query) ||
        transfer.fromGodownName.toLowerCase().includes(query) ||
        transfer.toGodownName.toLowerCase().includes(query) ||
        transfer.notes.toLowerCase().includes(query);

      return matchesGodown && matchesSearch && isWithinDateFilter(transfer.date);
    });
  }, [dateFilter, searchQuery, selectedGodownId, transferRows]);

  const selectedGodown = warehouseList.find(godown => godown.id === selectedGodownId) ?? warehouseList[0];
  const filteredWarehouses = warehouseList.filter(godown => {
    const query = godownSearchQuery.trim().toLowerCase();
    return !query || godown.name.toLowerCase().includes(query) || godown.location.toLowerCase().includes(query);
  });

  const filteredRows = stockRows.filter(row => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      row.name.toLowerCase().includes(query) ||
      row.category.toLowerCase().includes(query) ||
      row.itemCode.toLowerCase().includes(query);

    return matchesSearch;
  });

  const filteredLedger = movements.filter(movement => {
    const query = searchQuery.trim().toLowerCase();
    const matchesGodown = !selectedGodownId || movement.godownId === selectedGodownId;
    const matchesSearch =
      !query ||
      movement.itemName.toLowerCase().includes(query) ||
      movement.godownName.toLowerCase().includes(query) ||
      movement.referenceType.toLowerCase().includes(query);

    return matchesGodown && matchesSearch && isWithinDateFilter(movement.date);
  });

  const totalWarehouseStock = stockRows.reduce((sum, row) => sum + (row.allocations[selectedGodownId] ?? 0), 0);
  const totalStockValue = stockRows.reduce(
    (sum, row) => sum + (row.allocations[selectedGodownId] ?? 0) * row.purchasePrice,
    0
  );
  const activeGodownCount = warehouseList.length;

  const refreshGodownWorkspace = async () => {
    await onWorkspaceRefresh?.();
    await loadWarehouseSummary();
    await loadMovements();
  };

  const handleAddGodown = async () => {
    const name = newGodown.name.trim();
    if (!name) return;

    setIsSaving(true);
    try {
      const created = await createGodown({
        name,
        location: newGodown.location.trim()
      });
      setWarehouseList(current => [created, ...current]);
      setSelectedGodownId(created.id);
      setNewGodown({ name: "", location: "" });
      setShowAddGodown(false);
      setStatusMessage("Godown saved to tenant database.");
      setErrorMessage("");
      await onWorkspaceRefresh?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Godown could not be saved");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateGodown = async () => {
    if (!editingGodown) return;
    const name = editingGodown.name.trim();
    if (!name) {
      setErrorMessage("Godown name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await updateGodown({
        id: editingGodown.id,
        name,
        location: editingGodown.location.trim(),
        isDefault: editingGodown.isDefault
      });
      setWarehouseList(current => current.map(godown => {
        if (saved.isDefault && godown.id !== saved.id) {
          return { ...godown, isDefault: false };
        }
        return godown.id === saved.id ? { ...godown, ...saved } : godown;
      }));
      setEditingGodown(null);
      setSelectedGodownId(saved.id);
      setStatusMessage("Godown details updated in tenant database.");
      setErrorMessage("");
      await refreshGodownWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Godown could not be updated");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefaultGodown = async (godown: GodownType) => {
    setOpenGodownMenuId(null);
    if (godown.isDefault) {
      setStatusMessage(`${godown.name} is already the default godown.`);
      return;
    }

    try {
      const saved = await setDefaultGodown(godown.id);
      setWarehouseList(current => current.map(row => ({ ...row, isDefault: row.id === saved.id })));
      setSelectedGodownId(saved.id);
      setStatusMessage(`${saved.name} is now the default godown.`);
      setErrorMessage("");
      await refreshGodownWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Default godown could not be changed");
    }
  };

  const handleDeleteGodown = async (godown: GodownType) => {
    setOpenGodownMenuId(null);
    if (!window.confirm(`Delete ${godown.name}? Only empty godowns without ledger history can be deleted.`)) {
      return;
    }

    try {
      await deleteGodown(godown.id);
      setWarehouseList(current => current.filter(row => row.id !== godown.id));
      setSelectedGodownId(current => current === godown.id ? warehouseList.find(row => row.id !== godown.id)?.id || "" : current);
      setStatusMessage(`${godown.name} deleted from tenant godowns.`);
      setErrorMessage("");
      await refreshGodownWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Godown could not be deleted");
    }
  };

  const openTransferForItem = (item: Item) => {
    setOpenStockMenuId(null);
    const destination = warehouseList.find(godown => godown.id !== selectedGodownId) ?? warehouseList[0];
    setTransferDraft(current => ({
      ...current,
      itemId: item.id,
      from: selectedGodownId || item.godownId || warehouseList[0]?.id || "",
      to: destination?.id || "",
      quantity: 1,
      notes: `Transfer ${item.name}`
    }));
    setShowTransfer(true);
  };

  const handleTransfer = async () => {
    const item = items.find(entry => entry.id === transferDraft.itemId);
    if (!item || !transferDraft.from || !transferDraft.to || transferDraft.from === transferDraft.to) {
      setErrorMessage("Choose an item and two different godowns.");
      return;
    }

    setIsSaving(true);
    try {
      await transferItemStock({
        itemId: item.id,
        fromGodownId: transferDraft.from,
        toGodownId: transferDraft.to,
        quantity: transferDraft.quantity,
        notes: transferDraft.notes
      });
      setSelectedGodownId(transferDraft.to);
      setShowTransfer(false);
      setStatusMessage("Stock transfer posted to the tenant stock ledger.");
      setErrorMessage("");
      await refreshGodownWorkspace();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Stock transfer could not be saved");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mbb-screen godown-screen">
      <div className="mbb-page-card godown-card">
        <div className="mbb-items-header godown-header">
          <h1>Godown (Warehouse)</h1>
          <div className="mbb-header-actions">
            <button className="mbb-report-btn" onClick={loadMovements} type="button">
              <FileBarChart size={16} />
              Refresh Ledger
            </button>
            <button className="mbb-icon-btn" aria-label="Settings" onClick={() => onNavigate?.("settings")} type="button">
              <Settings2 size={18} />
            </button>
            <button className="mbb-icon-btn" aria-label="Keyboard shortcuts" onClick={() => setShowShortcuts(value => !value)} type="button">
              <Keyboard size={18} />
            </button>
          </div>
        </div>

        {(errorMessage || statusMessage || showShortcuts) && (
          <div className={errorMessage ? "godown-inline-message error" : "godown-inline-message"}>
            {errorMessage || statusMessage || "Shortcuts: / search items, Alt+T transfer stock, Alt+G add godown."}
          </div>
        )}

        <div className="godown-summary-grid">
          <div className="godown-summary-card active">
            <span><Warehouse size={17} /> Total Godowns</span>
            <strong>{warehouseList.length}</strong>
            <small>{activeGodownCount} Active</small>
          </div>
          <div className="godown-summary-card">
            <span><Boxes size={17} /> Stock in {selectedGodown?.name || "Godown"}</span>
            <strong>{totalWarehouseStock} PCS</strong>
            <small>{filteredRows.length} Items</small>
          </div>
          <div className="godown-summary-card">
            <span><Package size={17} /> Stock Value</span>
            <strong>{formatMoney(totalStockValue)}</strong>
            <small>Purchase value</small>
          </div>
          <div className="godown-summary-card orange">
            <span><ArrowLeftRight size={17} /> Transfers</span>
            <strong>{transfers.length}</strong>
            <small>From stock ledger</small>
          </div>
        </div>

        <div className="godown-layout">
          <aside className="godown-list-panel">
            <div className="godown-panel-header">
              <strong>Godowns</strong>
              <button onClick={() => setShowAddGodown(true)} type="button">
                <Plus size={16} />
                Add
              </button>
            </div>
            <label className="godown-search" htmlFor="godown-search">
              <Search size={17} />
              <input
                id="godown-search"
                onChange={event => setGodownSearchQuery(event.target.value)}
                placeholder="Search Godown"
                type="text"
                value={godownSearchQuery}
              />
            </label>
            <div className="godown-list">
              {filteredWarehouses.map(godown => {
                const stock = godown.stockQty ?? stockRows.reduce((sum, row) => sum + (row.allocations[godown.id] ?? 0), 0);
                return (
                  <button
                    className={selectedGodownId === godown.id ? "active" : ""}
                    key={godown.id}
                    onClick={() => setSelectedGodownId(godown.id)}
                    type="button"
                  >
                    <span>
                      <Building2 size={17} />
                      {godown.name}
                    </span>
                    <small>{godown.location || "No address added"}</small>
                    <b>{stock} PCS</b>
                    <span className="godown-row-actions">
                      <span
                        aria-label={`Actions for ${godown.name}`}
                        className="godown-row-menu-trigger"
                        onClick={event => {
                          event.stopPropagation();
                          setOpenGodownMenuId(current => current === godown.id ? null : godown.id);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <MoreVertical size={17} />
                      </span>
                      {openGodownMenuId === godown.id && (
                        <span className="godown-row-menu" onClick={event => event.stopPropagation()}>
                          <span role="button" tabIndex={0} onClick={() => { setOpenGodownMenuId(null); setEditingGodown(godown); }}>
                            Edit Godown
                          </span>
                          <span role="button" tabIndex={0} onClick={() => handleSetDefaultGodown(godown)}>
                            Make Default
                          </span>
                          <span className="danger" role="button" tabIndex={0} onClick={() => handleDeleteGodown(godown)}>
                            Delete Godown
                          </span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="godown-main-panel">
            <div className="godown-detail-strip">
              <div>
                <strong>{selectedGodown?.name || "No godown selected"}</strong>
                <span><MapPin size={15} /> {selectedGodown?.location || "No address added"}</span>
              </div>
              <div>
                <span>Default</span>
                <strong>{selectedGodown?.isDefault ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Ledger Rows</span>
                <strong>{filteredLedger.length}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong className="godown-status">Active</strong>
              </div>
            </div>

            <div className="godown-tabs">
              <button className={activeTab === "stock" ? "active" : ""} onClick={() => setActiveTab("stock")} type="button">
                Stock Items
              </button>
              <button className={activeTab === "transfers" ? "active" : ""} onClick={() => setActiveTab("transfers")} type="button">
                Transfer History
              </button>
              <button className={activeTab === "ledger" ? "active" : ""} onClick={() => setActiveTab("ledger")} type="button">
                Stock Ledger
              </button>
            </div>

            <div className="godown-toolbar">
              <label className="mbb-search-box" htmlFor="godown-item-search">
                <Search size={18} />
                <input
                  id="godown-item-search"
                  type="text"
                  placeholder="Search by Item Name / Code"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                />
              </label>
              <div className="godown-date-filter">
                <button className="sales-filter-btn" onClick={() => setShowDateMenu(value => !value)} type="button">
                  <CalendarDays size={16} />
                  {dateFilter === "all" ? "All Time" : `Last ${dateFilter} Days`}
                  <ChevronDown size={16} />
                </button>
                {showDateMenu && (
                  <div className="godown-date-menu">
                    <button onClick={() => { setDateFilter("30"); setShowDateMenu(false); }} type="button">Last 30 Days</button>
                    <button onClick={() => { setDateFilter("365"); setShowDateMenu(false); }} type="button">Last 365 Days</button>
                    <button onClick={() => { setDateFilter("all"); setShowDateMenu(false); }} type="button">All Time</button>
                  </div>
                )}
              </div>
              <div className="mbb-tools-spacer" />
              <button className="mbb-bulk-btn" onClick={loadMovements} type="button">
                <ClipboardList size={18} />
                {isLoadingLedger ? "Loading" : "Refresh"}
              </button>
              <button className="mbb-primary-btn" disabled={warehouseList.length < 2 || !items.length} onClick={() => setShowTransfer(true)} type="button">
                Transfer Stock
              </button>
            </div>

            {activeTab === "stock" && (
              <div className="godown-table-wrap">
                <table className="mbb-items-table godown-table">
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Item Code</th>
                      <th>Category</th>
                      <th>Stock QTY</th>
                      <th>Purchase Price</th>
                      <th>Stock Value</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => {
                      const qty = row.allocations[selectedGodownId] ?? 0;
                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="mbb-item-name">{row.name}</div>
                            <span className="mbb-category-chip">{row.category}</span>
                          </td>
                          <td>{row.itemCode || "-"}</td>
                          <td>{row.category}</td>
                          <td>{qty} PCS</td>
                          <td>{formatMoney(row.purchasePrice)}</td>
                          <td>{formatMoney(qty * row.purchasePrice)}</td>
                          <td>
                            <div className="godown-stock-actions">
                              <button
                                className="mbb-row-menu"
                                aria-label={`More actions for ${row.name}`}
                                onClick={() => setOpenStockMenuId(current => current === row.id ? null : row.id)}
                                type="button"
                              >
                                <MoreVertical size={19} />
                              </button>
                              {openStockMenuId === row.id && (
                                <div className="godown-stock-menu">
                                  <button onClick={() => openTransferForItem(row)} disabled={warehouseList.length < 2} type="button">
                                    Transfer Stock
                                  </button>
                                  <button onClick={() => { setOpenStockMenuId(null); setActiveTab("ledger"); setSearchQuery(row.name); }} type="button">
                                    View Stock Ledger
                                  </button>
                                  <button onClick={() => { setOpenStockMenuId(null); setActiveTab("transfers"); setSearchQuery(row.name); }} type="button">
                                    View Transfers
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredRows.length && (
                      <tr>
                        <td colSpan={7}>No stock ledger balance found for this godown.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "transfers" && (
              <div className="godown-table-wrap">
                <table className="mbb-items-table godown-transfer-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item Name</th>
                      <th>From Godown</th>
                      <th>To Godown</th>
                      <th>Quantity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map(transfer => (
                      <tr key={transfer.id}>
                        <td>{transfer.date}</td>
                        <td>{transfer.itemName}</td>
                        <td>{transfer.fromGodownName}</td>
                        <td>{transfer.toGodownName}</td>
                        <td>{transfer.quantity} PCS</td>
                        <td><span className="godown-status-pill">Completed</span></td>
                      </tr>
                    ))}
                    {!transfers.length && (
                      <tr>
                        <td colSpan={6}>No stock transfers recorded yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "ledger" && (
              <div className="godown-table-wrap">
                <table className="mbb-items-table godown-transfer-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item Name</th>
                      <th>Godown</th>
                      <th>Movement</th>
                      <th>Quantity</th>
                      <th>Balance</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map(movement => (
                      <tr key={movement.id}>
                        <td>{movement.date}</td>
                        <td>{movement.itemName}</td>
                        <td>{movement.godownName}</td>
                        <td>{movementLabel(movement.movementType)}</td>
                        <td>{movement.quantity} PCS</td>
                        <td>{movement.balanceAfter} PCS</td>
                        <td>{movement.referenceType || "-"}</td>
                      </tr>
                    ))}
                    {!filteredLedger.length && (
                      <tr>
                        <td colSpan={7}>No ledger entries found for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        </div>
      </div>

      {showAddGodown && (
        <GodownModal title="Add Godown" onClose={() => setShowAddGodown(false)}>
          <div className="godown-modal-grid">
            <label>
              <span>Godown Name *</span>
              <input value={newGodown.name} onChange={event => setNewGodown({ ...newGodown, name: event.target.value })} placeholder="ex: Main Store" />
            </label>
            <label>
              <span>Location</span>
              <input value={newGodown.location} onChange={event => setNewGodown({ ...newGodown, location: event.target.value })} placeholder="Address or area" />
            </label>
          </div>
          <div className="godown-modal-footer">
            <button className="mbb-cancel-btn" disabled={isSaving} onClick={() => setShowAddGodown(false)} type="button">Cancel</button>
            <button className="mbb-save-btn" disabled={isSaving} onClick={handleAddGodown} type="button">
              {isSaving ? "Saving..." : "Save Godown"}
            </button>
          </div>
        </GodownModal>
      )}

      {editingGodown && (
        <GodownModal title="Edit Godown" onClose={() => setEditingGodown(null)}>
          <div className="godown-modal-grid">
            <label>
              <span>Godown Name *</span>
              <input
                value={editingGodown.name}
                onChange={event => setEditingGodown({ ...editingGodown, name: event.target.value })}
                placeholder="ex: Main Store"
              />
            </label>
            <label>
              <span>Location</span>
              <input
                value={editingGodown.location}
                onChange={event => setEditingGodown({ ...editingGodown, location: event.target.value })}
                placeholder="Address or area"
              />
            </label>
            <label className="godown-modal-wide godown-default-check">
              <input
                checked={Boolean(editingGodown.isDefault)}
                onChange={event => setEditingGodown({ ...editingGodown, isDefault: event.target.checked })}
                type="checkbox"
              />
              <span>Make this the default godown</span>
            </label>
          </div>
          <div className="godown-modal-footer">
            <button className="mbb-cancel-btn" disabled={isSaving} onClick={() => setEditingGodown(null)} type="button">Cancel</button>
            <button className="mbb-save-btn" disabled={isSaving} onClick={handleUpdateGodown} type="button">
              {isSaving ? "Saving..." : "Save Godown"}
            </button>
          </div>
        </GodownModal>
      )}

      {showTransfer && (
        <GodownModal title="Transfer Stock" onClose={() => setShowTransfer(false)}>
          <div className="godown-modal-grid">
            <label>
              <span>Item</span>
              <select value={transferDraft.itemId} onChange={event => setTransferDraft({ ...transferDraft, itemId: event.target.value })}>
                {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Quantity</span>
              <input
                type="number"
                min="1"
                value={transferDraft.quantity}
                onChange={event => setTransferDraft({ ...transferDraft, quantity: Math.max(1, Number(event.target.value) || 1) })}
              />
            </label>
            <label>
              <span>From Godown</span>
              <select value={transferDraft.from} onChange={event => setTransferDraft({ ...transferDraft, from: event.target.value })}>
                {warehouseList.map(godown => <option key={godown.id} value={godown.id}>{godown.name}</option>)}
              </select>
            </label>
            <label>
              <span>To Godown</span>
              <select value={transferDraft.to} onChange={event => setTransferDraft({ ...transferDraft, to: event.target.value })}>
                {warehouseList.map(godown => <option key={godown.id} value={godown.id}>{godown.name}</option>)}
              </select>
            </label>
            <label className="godown-modal-wide">
              <span>Notes</span>
              <input value={transferDraft.notes} onChange={event => setTransferDraft({ ...transferDraft, notes: event.target.value })} placeholder="Optional transfer note" />
            </label>
          </div>
          <div className="godown-modal-footer">
            <button className="mbb-cancel-btn" disabled={isSaving} onClick={() => setShowTransfer(false)} type="button">Cancel</button>
            <button className="mbb-save-btn" disabled={isSaving} onClick={handleTransfer} type="button">
              {isSaving ? "Posting..." : "Transfer Stock"}
            </button>
          </div>
        </GodownModal>
      )}
    </div>
  );
}

function GodownModal({
  children,
  onClose,
  title
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="mbb-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="godown-modal-title">
      <div className="godown-modal">
        <div className="mbb-edit-header">
          <h2 id="godown-modal-title">{title}</h2>
          <button aria-label="Close modal" onClick={onClose} type="button">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
