import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CirclePlay,
  Edit3,
  PackagePlus,
  ScanBarcode,
  Search,
  X
} from "lucide-react";
import { getSalesInvoicePrintHtml, updateBusinessSettings } from "../api";
import type { InvoiceItem, Item, Party, SalesInvoice, SettingsData } from "../types";

interface POSBillingProps {
  items: Item[];
  parties: Party[];
  onCheckout: (invoiceData: {
    partyId?: string;
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
  onCreateItem?: (item: Item) => Promise<Item | null>;
  settings?: SettingsData | null;
  onExit?: () => void;
}

const RUPEE = "\u20b9";
type PosAdjustmentKind = "price" | "quantity" | "discount" | "billDiscount" | "charge";
type PosAdjustmentModal = {
  kind: PosAdjustmentKind;
  title: string;
  value: number;
  suffix?: string;
};
type QuickItemDraft = {
  name: string;
  itemCode: string;
  category: string;
  price: number;
  purchasePrice: number;
  mrp: number;
  stock: number;
  gstRate: number;
  hsn: string;
};
type PosPanel = "settings" | "watch" | null;
type PosPreferences = {
  printPreview: boolean;
  autoPrintAfterSale: boolean;
  printOriginalDuplicate: boolean;
};
const CASH_SALE_PARTY_ID = "__cash_sale__";

const quickItemDraft = (name = ""): QuickItemDraft => ({
  name,
  itemCode: "",
  category: "POS QUICK ITEMS",
  price: 0,
  purchasePrice: 0,
  mrp: 0,
  stock: 1,
  gstRate: 5,
  hsn: ""
});

const effectiveItemRate = (item: Item) =>
  item.activeOffer?.status === "active" && item.activeOffer.offerPrice > 0
    ? item.activeOffer.offerPrice
    : item.price;

const defaultPosPreferences: PosPreferences = {
  printPreview: true,
  autoPrintAfterSale: false,
  printOriginalDuplicate: false
};

export default function POSBilling({ items, parties, onCheckout, onCreateItem, settings, onExit }: POSBillingProps) {
  const [selectedPartyId, setSelectedPartyId] = useState(CASH_SALE_PARTY_ID);
  const [posItems, setPosItems] = useState<InvoiceItem[]>([]);
  const [localItems, setLocalItems] = useState<Item[]>(items);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [searchItemQuery, setSearchItemQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [billDiscount, setBillDiscount] = useState(0);
  const [additionalCharge, setAdditionalCharge] = useState(0);
  const [heldBillCount, setHeldBillCount] = useState(0);
  const [adjustmentModal, setAdjustmentModal] = useState<PosAdjustmentModal | null>(null);
  const [printPreview, setPrintPreview] = useState<{ title: string; html: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isQuickItemSaving, setIsQuickItemSaving] = useState(false);
  const [quickItem, setQuickItem] = useState<QuickItemDraft | null>(null);
  const [posPanel, setPosPanel] = useState<PosPanel>(null);
  const [posPreferences, setPosPreferences] = useState<PosPreferences>(defaultPosPreferences);
  const [isPosSettingsSaving, setIsPosSettingsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const receivedInputRef = useRef<HTMLInputElement>(null);
  const customerSelectRef = useRef<HTMLSelectElement>(null);
  const customerOptions = parties.filter(party => party.type === "customer");
  const printPreviewEnabled = posPreferences.printPreview;
  const autoPrintAfterSale = posPreferences.autoPrintAfterSale;

  useEffect(() => {
    setLocalItems(current => {
      const incomingIds = new Set(items.map(item => item.id));
      const localOnly = current.filter(item => !incomingIds.has(item.id));
      return [...items, ...localOnly];
    });
  }, [items]);

  useEffect(() => {
    setPosPreferences({
      printPreview: settings?.businessProfile.printPreview !== false,
      autoPrintAfterSale: settings?.businessProfile.autoPrintAfterSale === true,
      printOriginalDuplicate: settings?.businessProfile.printOriginalDuplicate === true
    });
  }, [settings]);

  const posCategories = useMemo(
    () => ["all", ...Array.from(new Set(localItems.map(item => item.category || "-"))).sort()],
    [localItems]
  );

  const filteredItems = localItems
    .filter(item => {
      const haystack = `${item.name} ${item.itemCode ?? ""} ${item.hsn} ${item.category}`.toLowerCase();
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      return matchesCategory && haystack.includes(searchItemQuery.toLowerCase());
    })
    .slice(0, 8);

  const totals = useMemo(() => {
    const subtotal = posItems.reduce((sum, line) => {
      const gross = line.rate * line.quantity;
      const discount = gross * ((line.discountPct || 0) / 100);
      return sum + Math.max(0, gross - discount);
    }, 0);
    const tax = posItems.reduce((sum, line) => {
      const gross = line.rate * line.quantity;
      const discount = gross * ((line.discountPct || 0) / 100);
      const taxable = Math.max(0, gross - discount);
      return sum + (taxable * line.item.gstRate) / 100;
    }, 0);
    const total = Math.max(0, subtotal + tax - billDiscount + additionalCharge);
    return { subtotal, tax, total };
  }, [additionalCharge, billDiscount, posItems]);

  const effectiveReceivedAmount = receivedAmount > 0 ? receivedAmount : totals.total;
  const selectedLine = selectedLineIndex === null ? null : posItems[selectedLineIndex] ?? null;

  const addItem = (item: Item) => {
    const existingLine = posItems.find(line => line.item.id === item.id);
    if (existingLine && existingLine.quantity + 1 > item.stock) {
      setNotice(`Only ${item.stock} PCS available for ${item.name}.`);
      return;
    }
    if (!existingLine && item.stock < 1) {
      setNotice(`${item.name} is out of stock.`);
      return;
    }

    setPosItems(current => {
      const existing = current.find(line => line.item.id === item.id);
      if (existing) {
        return current.map(line =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...current, { item, quantity: 1, freeQuantity: 0, rate: effectiveItemRate(item), discountPct: 0 }];
    });
    setSelectedLineIndex(current => current ?? posItems.length);
    setSearchItemQuery("");
    setShowCategoryMenu(false);
    setNotice(`${item.name} added.`);
  };

  const openQuickItem = () => {
    if (!onCreateItem) {
      setNotice("Your role can view POS but cannot create items.");
      return;
    }
    setQuickItem(quickItemDraft(searchItemQuery.trim()));
  };

  const updateQuickItem = (patch: Partial<QuickItemDraft>) => {
    setQuickItem(current => current ? { ...current, ...patch } : current);
  };

  const saveQuickItem = async () => {
    if (!quickItem || !onCreateItem) return;
    if (!quickItem.name.trim()) {
      setNotice("Enter item name before saving.");
      return;
    }
    if (quickItem.price <= 0) {
      setNotice("Enter selling price before saving the POS item.");
      return;
    }
    if (quickItem.stock < 1) {
      setNotice("Opening stock must be at least 1 PCS to add it to this POS bill.");
      return;
    }

    try {
      setIsQuickItemSaving(true);
      const created = await onCreateItem({
        id: "",
        name: quickItem.name.trim(),
        hsn: quickItem.hsn.trim(),
        itemCode: quickItem.itemCode.trim() || undefined,
        price: quickItem.price,
        purchasePrice: quickItem.purchasePrice,
        mrp: quickItem.mrp || quickItem.price,
        stock: quickItem.stock,
        godown: "-",
        category: quickItem.category.trim() || "POS QUICK ITEMS",
        gstRate: quickItem.gstRate,
        color: "",
        grn: "",
        onlineStore: true,
        description: "Created from POS quick item"
      });
      if (!created) {
        setNotice("POS item could not be saved.");
        return;
      }
      setLocalItems(current => [created, ...current.filter(item => item.id !== created.id)]);
      addItem(created);
      setQuickItem(null);
      setNotice(`${created.name} created and added to this POS bill.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "POS item could not be saved.");
    } finally {
      setIsQuickItemSaving(false);
    }
  };

  const updateSelectedLine = (patch: Partial<InvoiceItem>) => {
    if (selectedLineIndex === null || !posItems[selectedLineIndex]) {
      setNotice("Select an item row first.");
      return;
    }
    setPosItems(current => current.map((line, index) => (
      index === selectedLineIndex ? { ...line, ...patch } : line
    )));
  };

  const openLineAdjustment = (kind: PosAdjustmentKind) => {
    if ((kind === "price" || kind === "quantity" || kind === "discount") && !selectedLine) {
      setNotice("Select an item row before changing price, quantity, or discount.");
      return;
    }
    const modalByKind: Record<PosAdjustmentKind, PosAdjustmentModal> = {
      price: { kind, title: "Change Price", value: selectedLine?.rate ?? 0 },
      quantity: { kind, title: "Change QTY", value: selectedLine?.quantity ?? 1 },
      discount: { kind, title: "Change Discount", value: selectedLine?.discountPct ?? 0, suffix: "%" },
      billDiscount: { kind, title: "Add Discount", value: billDiscount },
      charge: { kind, title: "Add Additional Charge", value: additionalCharge }
    };
    setAdjustmentModal(modalByKind[kind]);
  };

  const applyAdjustment = () => {
    if (!adjustmentModal) return;
    const value = Math.max(0, Number(adjustmentModal.value) || 0);
    if (adjustmentModal.kind === "price") updateSelectedLine({ rate: value });
    if (adjustmentModal.kind === "quantity") updateSelectedLine({ quantity: Math.max(1, value) });
    if (adjustmentModal.kind === "discount") updateSelectedLine({ discountPct: Math.min(100, value) });
    if (adjustmentModal.kind === "billDiscount") setBillDiscount(value);
    if (adjustmentModal.kind === "charge") setAdditionalCharge(value);
    setAdjustmentModal(null);
  };

  const deleteSelectedItem = () => {
    if (selectedLineIndex === null || !posItems[selectedLineIndex]) {
      setNotice("Select an item row before deleting.");
      return;
    }
    const deletedName = posItems[selectedLineIndex].item.name;
    setPosItems(current => current.filter((_, index) => index !== selectedLineIndex));
    setSelectedLineIndex(null);
    setNotice(`${deletedName} removed.`);
  };

  const resetBill = () => {
    setPosItems([]);
    setSelectedLineIndex(null);
    setReceivedAmount(0);
    setBillDiscount(0);
    setAdditionalCharge(0);
    setSearchItemQuery("");
  };

  const selectCategory = (category: string) => {
    setSelectedCategory(category);
    setShowCategoryMenu(false);
  };

  const holdBill = () => {
    if (!posItems.length) {
      setNotice("Add items before holding this bill.");
      return;
    }
    setHeldBillCount(count => count + 1);
    resetBill();
    setNotice("Bill held. New billing screen is ready.");
  };

  const savePosSettings = async () => {
    try {
      setIsPosSettingsSaving(true);
      await updateBusinessSettings(posPreferences);
      setNotice("POS settings saved for this tenant.");
      setPosPanel(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "POS settings could not be saved.");
    } finally {
      setIsPosSettingsSaving(false);
    }
  };

  const saveBill = async (shouldPrint = false) => {
    if (!posItems.length) return;
    if (!selectedPartyId) {
      setNotice("Select a customer before saving the POS bill.");
      return;
    }
    const overStockLine = posItems.find(line => line.quantity + line.freeQuantity > line.item.stock);
    if (overStockLine) {
      setNotice(`Only ${overStockLine.item.stock} PCS available for ${overStockLine.item.name}.`);
      return;
    }

    setIsSaving(true);
    setNotice("");
    try {
      const invoice = await onCheckout({
        partyId: selectedPartyId === CASH_SALE_PARTY_ID ? "" : selectedPartyId,
        items: posItems,
        subtotal: totals.subtotal,
        total: totals.total,
        paidAmount: Math.min(effectiveReceivedAmount, totals.total),
        paymentMode,
        isPos: true,
        discountAmount: billDiscount,
        additionalCharge,
        additionalChargeLabel: additionalCharge ? "Additional Charge" : "",
        taxAmount: totals.tax
      });
      if (!invoice) {
        setNotice("POS invoice could not be saved. Check customer and stock.");
        return;
      }
      setNotice(`${invoice.invoiceNumber} saved.`);
      if (shouldPrint || autoPrintAfterSale) {
        const html = await getSalesInvoicePrintHtml(invoice.id, "thermal");
        if (printPreviewEnabled) {
          setPrintPreview({ title: `${invoice.invoiceNumber} Thermal Print`, html });
        } else {
          const popup = window.open("", "_blank", "width=420,height=720");
          if (popup) {
            popup.document.write(html);
            popup.document.close();
            window.setTimeout(() => popup.print(), 350);
            resetBill();
          } else {
            setPrintPreview({ title: `${invoice.invoiceNumber} Thermal Print`, html });
          }
        }
      } else {
        resetBill();
      }
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName || "");
      const isFunctionShortcut = ["F2", "F3", "F4", "F5", "F6", "F7"].includes(event.key);
      if (isTyping && !isFunctionShortcut && !(event.ctrlKey && ["Escape", "b", "B", "i", "I", "s", "S"].includes(event.key))) {
        return;
      }
      if (event.ctrlKey && event.key === "Escape") {
        event.preventDefault();
        onExit?.();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        holdBill();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        openQuickItem();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setPosPanel("settings");
      }
      if (event.key === "F2") {
        event.preventDefault();
        openLineAdjustment("billDiscount");
      }
      if (event.key === "F3") {
        event.preventDefault();
        openLineAdjustment("charge");
      }
      if (event.key === "F4") {
        event.preventDefault();
        receivedInputRef.current?.focus();
      }
      if (event.key === "F5") {
        event.preventDefault();
        customerSelectRef.current?.focus();
      }
      if (event.key === "F6") {
        event.preventDefault();
        void saveBill(true);
      }
      if (event.key === "F7") {
        event.preventDefault();
        void saveBill(false);
      }
      if (event.key.toLowerCase() === "p") openLineAdjustment("price");
      if (event.key.toLowerCase() === "q") openLineAdjustment("quantity");
      if (event.key.toLowerCase() === "d") openLineAdjustment("discount");
      if (event.key === "Delete") deleteSelectedItem();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="pos-mbb-shell">
      <header className="pos-topbar">
        <button className="pos-exit-btn" onClick={onExit} type="button">
          <ArrowLeft size={18} />
          Exit POS <span>[CTRL + ESC]</span>
        </button>
        <h1>POS Billing</h1>
        <div className="pos-top-actions">
          <button onClick={() => setPosPanel("watch")} type="button"><CirclePlay size={16} /> Watch how to use POS Billing</button>
          <button onClick={() => setPosPanel("settings")} type="button">Settings <span>[CTRL + S]</span></button>
        </div>
      </header>

      <div className="pos-tab-row">
        <button className="active" type="button">
          Billing Screen 1 <span>[CTRL + 1]</span>
          <X size={15} />
        </button>
        <button onClick={holdBill} type="button">+ Hold Bill & Create Another <span>[CTRL + B]</span></button>
        {heldBillCount > 0 && <small>{heldBillCount} held</small>}
      </div>

      <main className="pos-workspace">
        <section className="pos-billing-area">
          <div className="pos-command-row">
            <button onClick={openQuickItem} type="button">+ New Item <span>[CTRL + I]</span></button>
            <button onClick={() => openLineAdjustment("price")} type="button">Change Price <span>[P]</span></button>
            <button onClick={() => openLineAdjustment("quantity")} type="button">Change QTY <span>[Q]</span></button>
            <button onClick={() => openLineAdjustment("discount")} type="button">Change Discount <span>[D]</span></button>
            <button className="danger" onClick={deleteSelectedItem} type="button">Delete Item <span>[DEL]</span></button>
          </div>

          <div className="pos-search-row">
            <div className="pos-category-filter">
              <button
                className={selectedCategory !== "all" ? "active" : ""}
                onClick={() => setShowCategoryMenu(current => !current)}
                type="button"
              >
                {selectedCategory === "all" ? "Category" : selectedCategory}
                <ChevronDown size={15} />
              </button>
              {showCategoryMenu && (
                <div className="pos-category-menu">
                  {posCategories.map(category => (
                    <button
                      className={selectedCategory === category ? "active" : ""}
                      key={category}
                      onClick={() => selectCategory(category)}
                      type="button"
                    >
                      {category === "all" ? "All Categories" : category}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label>
              <Search size={16} />
              <input
                value={searchItemQuery}
                onChange={(event) => setSearchItemQuery(event.target.value)}
                placeholder="Search by Item/ Serial no./ HSN code/ SKU/ Custom Field / Category or Scan Barcode"
              />
              <kbd>F1</kbd>
            </label>
          </div>

          <div className="pos-line-table">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Items</th>
                  <th>Item Code</th>
                  <th>MRP</th>
                  <th>SP ({RUPEE})</th>
                  <th>Disc (%)</th>
                  <th>Quantity</th>
                  <th>Amount ({RUPEE})</th>
                </tr>
              </thead>
              <tbody>
                {posItems.map((line, index) => (
                  <tr
                    className={selectedLineIndex === index ? "active" : ""}
                    key={line.item.id}
                    onClick={() => setSelectedLineIndex(index)}
                  >
                    <td>{index + 1}</td>
                    <td>{line.item.name}</td>
                    <td>{line.item.itemCode ?? "-"}</td>
                    <td>{line.item.mrp?.toLocaleString("en-IN") ?? "-"}</td>
                    <td>{line.rate.toLocaleString("en-IN")}</td>
                    <td>{line.discountPct}</td>
                    <td>{line.quantity}</td>
                    <td>{(line.rate * line.quantity * (1 - (line.discountPct || 0) / 100)).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pos-suggestion-panel">
              <div className="pos-suggestion-head">
                <span>Item Name</span>
                <kbd>Esc</kbd>
                <X size={15} />
              </div>
              {filteredItems.slice(0, 4).map(item => (
                <button key={item.id} type="button" onClick={() => addItem(item)}>
                  <span>
                    {item.name}
                    <small>STOCK : {item.stock} PCS &nbsp;&nbsp; PP : {RUPEE} {item.purchasePrice.toLocaleString("en-IN")} / PCS</small>
                  </span>
                  <strong>{RUPEE} {effectiveItemRate(item).toLocaleString("en-IN")}<small>/PCS</small></strong>
                </button>
              ))}
              <button className="create-item-row" onClick={openQuickItem} type="button">+ Create Item</button>
            </div>

            {posItems.length === 0 && (
              <div className="pos-empty">
                <PackagePlus size={56} />
                <span><Search size={18} /> Add items by searching item name or item code</span>
                <em>Or</em>
                <span><ScanBarcode size={16} /> Simply scan barcode to add items</span>
              </div>
            )}
          </div>
        </section>

        <aside className="pos-bill-panel">
          <button onClick={() => openLineAdjustment("billDiscount")} type="button">Add Discount <span>[F2]</span></button>
          <button onClick={() => openLineAdjustment("charge")} type="button">Add Additional Charge <span>[F3]</span></button>

          <section>
            <h2>Bill details</h2>
            <div><span>Sub Total</span><strong>{RUPEE} {totals.subtotal.toLocaleString("en-IN")}</strong></div>
            <div><span>Tax</span><strong>{RUPEE} {totals.tax.toLocaleString("en-IN")}</strong></div>
            {billDiscount > 0 && <div><span>Discount</span><strong>- {RUPEE} {billDiscount.toLocaleString("en-IN")}</strong></div>}
            {additionalCharge > 0 && <div><span>Additional Charge</span><strong>{RUPEE} {additionalCharge.toLocaleString("en-IN")}</strong></div>}
            <div className="total"><span>Total Amount</span><strong>{RUPEE} {totals.total.toLocaleString("en-IN")}</strong></div>
          </section>

          <section>
            <h2>Received Amount <span>[F4]</span></h2>
            <div className="pos-payment-box">
              <input
                aria-label="Received amount"
                ref={receivedInputRef}
                min="0"
                onChange={event => setReceivedAmount(Math.max(0, Number(event.target.value) || 0))}
                placeholder={`${RUPEE} ${totals.total.toLocaleString("en-IN")}`}
                type="number"
                value={receivedAmount || ""}
              />
              <select value={paymentMode} onChange={event => setPaymentMode(event.target.value)} aria-label="POS payment mode">
                <option>Cash</option>
                <option>UPI</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
              </select>
            </div>
          </section>

          <section>
            <h2>Customer Details <span>[F5]</span></h2>
            <label className="pos-customer-picker">
              <Edit3 size={17} />
              <select ref={customerSelectRef} value={selectedPartyId} onChange={event => setSelectedPartyId(event.target.value)} aria-label="POS customer">
                <option value={CASH_SALE_PARTY_ID}>Cash Sale</option>
                {(customerOptions.length ? customerOptions : parties).map(party => (
                  <option key={party.id} value={party.id}>{party.name}</option>
                ))}
              </select>
            </label>
          </section>

          {notice && <div className="pos-save-notice">{notice}</div>}

          <div className="pos-save-row">
            <button disabled={!posItems.length || isSaving} onClick={() => saveBill(true)} type="button">
              {isSaving ? "Saving..." : "Save & Print [F6]"}
            </button>
            <button disabled={!posItems.length || isSaving} onClick={() => saveBill(false)} type="button">
              {isSaving ? "Saving..." : "Save Bill [F7]"}
            </button>
          </div>
        </aside>
      </main>

      {adjustmentModal && (
        <div className="pos-modal-backdrop">
          <div className="pos-adjust-modal">
            <div>
              <strong>{adjustmentModal.title}</strong>
              <button aria-label="Close" onClick={() => setAdjustmentModal(null)} type="button">
                <X size={16} />
              </button>
            </div>
            <label>
              <span>{adjustmentModal.title}</span>
              <input
                autoFocus
                min="0"
                max={adjustmentModal.kind === "discount" ? 100 : undefined}
                onChange={event => setAdjustmentModal(current => current ? { ...current, value: Number(event.target.value) } : current)}
                type="number"
                value={adjustmentModal.value}
              />
              {adjustmentModal.suffix && <em>{adjustmentModal.suffix}</em>}
            </label>
            <footer>
              <button onClick={() => setAdjustmentModal(null)} type="button">Cancel</button>
              <button onClick={applyAdjustment} type="button">Apply</button>
            </footer>
          </div>
        </div>
      )}

      {quickItem && (
        <div className="pos-modal-backdrop">
          <div className="pos-adjust-modal pos-quick-item-modal">
            <div>
              <strong>Create POS Item</strong>
              <button aria-label="Close" onClick={() => setQuickItem(null)} type="button">
                <X size={16} />
              </button>
            </div>
            <div className="pos-quick-item-grid">
              <label className="wide">
                <span>Item Name</span>
                <input autoFocus value={quickItem.name} onChange={event => updateQuickItem({ name: event.target.value })} />
              </label>
              <label>
                <span>Item Code</span>
                <input value={quickItem.itemCode} onChange={event => updateQuickItem({ itemCode: event.target.value })} />
              </label>
              <label>
                <span>HSN Code</span>
                <input value={quickItem.hsn} onChange={event => updateQuickItem({ hsn: event.target.value })} />
              </label>
              <label>
                <span>Selling Price</span>
                <input min="0" type="number" value={quickItem.price || ""} onChange={event => updateQuickItem({ price: Number(event.target.value) || 0 })} />
              </label>
              <label>
                <span>Purchase Price</span>
                <input min="0" type="number" value={quickItem.purchasePrice || ""} onChange={event => updateQuickItem({ purchasePrice: Number(event.target.value) || 0 })} />
              </label>
              <label>
                <span>MRP</span>
                <input min="0" type="number" value={quickItem.mrp || ""} onChange={event => updateQuickItem({ mrp: Number(event.target.value) || 0 })} />
              </label>
              <label>
                <span>Opening Stock</span>
                <input min="0" type="number" value={quickItem.stock} onChange={event => updateQuickItem({ stock: Number(event.target.value) || 0 })} />
              </label>
              <label>
                <span>GST</span>
                <select value={quickItem.gstRate} onChange={event => updateQuickItem({ gstRate: Number(event.target.value) || 0 })}>
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </label>
              <label>
                <span>Category</span>
                <input value={quickItem.category} onChange={event => updateQuickItem({ category: event.target.value })} />
              </label>
            </div>
            <footer>
              <button onClick={() => setQuickItem(null)} type="button">Cancel</button>
              <button onClick={saveQuickItem} disabled={isQuickItemSaving} type="button">
                {isQuickItemSaving ? "Saving..." : "Save & Add"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {posPanel && (
        <div className="pos-modal-backdrop">
          <div className="pos-adjust-modal pos-settings-modal">
            <div>
              <strong>{posPanel === "settings" ? "POS Settings" : "POS Billing Walkthrough"}</strong>
              <button aria-label="Close" onClick={() => setPosPanel(null)} type="button">
                <X size={16} />
              </button>
            </div>

            {posPanel === "settings" ? (
              <div className="pos-settings-body">
                <label>
                  <input
                    checked={posPreferences.printPreview}
                    onChange={event => setPosPreferences(current => ({ ...current, printPreview: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Show print preview before thermal print</span>
                </label>
                <label>
                  <input
                    checked={posPreferences.autoPrintAfterSale}
                    onChange={event => setPosPreferences(current => ({ ...current, autoPrintAfterSale: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Auto print after sale</span>
                </label>
                <label>
                  <input
                    checked={posPreferences.printOriginalDuplicate}
                    onChange={event => setPosPreferences(current => ({ ...current, printOriginalDuplicate: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>Print original and duplicate copies</span>
                </label>
              </div>
            ) : (
              <div className="pos-watch-body">
                <div className="pos-watch-frame">
                  <CirclePlay size={44} />
                  <strong>POS Billing</strong>
                </div>
                <div className="pos-watch-steps">
                  <span>Search or scan</span>
                  <span>Adjust bill</span>
                  <span>Receive payment</span>
                  <span>Save and print</span>
                </div>
              </div>
            )}

            <footer>
              <button onClick={() => setPosPanel(null)} type="button">Close</button>
              {posPanel === "settings" && (
                <button onClick={savePosSettings} disabled={isPosSettingsSaving} type="button">
                  {isPosSettingsSaving ? "Saving..." : "Save Settings"}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}

      {printPreview && (
        <PosPrintPreviewModal
          html={printPreview.html}
          onClose={() => {
            setPrintPreview(null);
            resetBill();
          }}
          title={printPreview.title}
        />
      )}
    </div>
  );
}

function PosPrintPreviewModal({
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
      <div className="print-preview-modal pos-print-preview-modal">
        <div className="print-preview-header">
          <div>
            <h2>{title}</h2>
            <span>Thermal invoice preview generated from the saved backend invoice.</span>
          </div>
          <div>
            <button className="mbb-bulk-btn" onClick={onClose} type="button">Close</button>
            <button className="mbb-primary-btn" onClick={printPreview} type="button">Print</button>
          </div>
        </div>
        <iframe className="print-preview-frame" ref={frameRef} srcDoc={html} title={title} />
      </div>
    </div>
  );
}
