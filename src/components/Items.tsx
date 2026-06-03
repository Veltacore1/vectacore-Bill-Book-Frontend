import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeIndianRupee,
  BadgePercent,
  Boxes,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileBarChart,
  Info,
  Keyboard,
  MoreVertical,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import {
  activateItemOffer,
  adjustItemStock,
  createBarcodeLabel,
  createBulkBarcodeLabels,
  createItem,
  createItemOffer,
  deleteItem,
  deleteItemPartyPrice,
  getBarcodeLabelPrintHtml,
  getBarcodeLabelSizes,
  getItemOffers,
  getItemPartyPrices,
  pauseItemOffer,
  updateItem,
  updateItemOffer,
  upsertItemPartyPrice,
  type BarcodeLabelOptions,
  type BarcodeLabelPriceSource,
  type BarcodeLabelSize
} from "../api";
import { getModulePermission } from "../types";
import type { Godown, Item, ItemOffer, ItemOfferDiscountType, ItemOfferStatus, ItemPartyPrice, ModulePermissions, Party } from "../types";

type ItemEditorTab = "basic" | "stock" | "pricing" | "party" | "custom";
type ViewMode = "inventory" | "detail";

type OfferDraft = {
  id?: string;
  itemId: string;
  title: string;
  discountType: ItemOfferDiscountType;
  discountValue: number;
  startsOn: string;
  endsOn: string;
  channel: string;
  status: ItemOfferStatus;
  notes: string;
};

type InventoryItem = Item & {
  itemCode: string;
  mrp: number;
  unit: string;
  asOfDate: string;
  description: string;
  onlineStore: boolean;
  lowStockQuantity?: number;
  secondaryUnit?: string;
  serialisationEnabled?: boolean;
  customFields: {
    color: string;
    cinDate: string;
    grnDate: string;
    billNo: string;
  };
};

interface ItemsProps {
  items: Item[];
  godowns: Godown[];
  parties: Party[];
  modulePermissions?: ModulePermissions;
  hideZeroStockBarcodes?: boolean;
  onNavigate: (tab: string) => void;
  onWorkspaceRefresh: () => Promise<void> | void;
}

const RUPEE = "\u20b9";
const DEFAULT_BARCODE_LABEL_SIZES: BarcodeLabelSize[] = [
  {
    id: "50x25",
    name: "50 x 25 mm",
    width_mm: 50,
    height_mm: 25,
    columns: 3,
    gap_mm: 3,
    description: "Standard textile SKU label"
  }
];

const normalizeItem = (item: Item): InventoryItem => {
  return {
    ...item,
    itemCode: item.itemCode ?? "",
    mrp: item.mrp ?? 0,
    unit: "Pieces(PCS)",
    asOfDate: "",
    description: item.description ?? "",
    onlineStore: Boolean(item.onlineStore),
    lowStockQuantity: item.lowStockQuantity,
    secondaryUnit: item.secondaryUnit ?? "-",
    serialisationEnabled: Boolean(item.serialisationEnabled),
    customFields: {
      color: item.color ?? "",
      cinDate: item.cinDate ?? "",
      grnDate: item.grnDate ?? item.grn ?? "",
      billNo: item.billNo ?? ""
    }
  };
};

const formatMoney = (amount: number, decimals = 0) =>
  `${RUPEE} ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

const offerPriceForItem = (item: InventoryItem, offer?: ItemOffer | null) => {
  const activeOffer = offer ?? item.activeOffer;
  if (!activeOffer || activeOffer.status !== "active") {
    return item.price;
  }
  return activeOffer.offerPrice || item.price;
};

const makeOfferDraft = (item: InventoryItem, offer?: ItemOffer | null): OfferDraft => ({
  id: offer?.id,
  itemId: offer?.itemId || item.id,
  title: offer?.title || `${item.name} offer`,
  discountType: offer?.discountType || "percent",
  discountValue: offer?.discountValue || 5,
  startsOn: offer?.startsOn || todayIso(),
  endsOn: offer?.endsOn || "",
  channel: offer?.channel || "billing",
  status: offer?.status || "active",
  notes: offer?.notes || ""
});

const DEFAULT_BARCODE_OPTIONS: Required<Pick<BarcodeLabelOptions, "priceSource" | "includeBusinessName" | "includeItemName" | "includePrice" | "includeMrp">> = {
  priceSource: "selling",
  includeBusinessName: true,
  includeItemName: true,
  includePrice: true,
  includeMrp: true
};

export default function Items({
  items,
  godowns,
  parties,
  modulePermissions,
  hideZeroStockBarcodes = false,
  onNavigate,
  onWorkspaceRefresh
}: ItemsProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>(() =>
    items.map(item => normalizeItem(item))
  );
  const [viewMode, setViewMode] = useState<ViewMode>("inventory");
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [editorTab, setEditorTab] = useState<ItemEditorTab>("stock");
  const [draftItem, setDraftItem] = useState<InventoryItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [itemsNotice, setItemsNotice] = useState("");
  const [showBulkSummary, setShowBulkSummary] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [printingBarcodeId, setPrintingBarcodeId] = useState<string | null>(null);
  const [selectedBarcodeItemIds, setSelectedBarcodeItemIds] = useState<Set<string>>(() => new Set());
  const [barcodeLabelSizes, setBarcodeLabelSizes] = useState<BarcodeLabelSize[]>(DEFAULT_BARCODE_LABEL_SIZES);
  const [barcodeLabelSize, setBarcodeLabelSize] = useState(DEFAULT_BARCODE_LABEL_SIZES[0].id);
  const [barcodeCopies, setBarcodeCopies] = useState(1);
  const [barcodeOptions, setBarcodeOptions] = useState(DEFAULT_BARCODE_OPTIONS);
  const [isBulkBarcodePrinting, setIsBulkBarcodePrinting] = useState(false);
  const [barcodePreview, setBarcodePreview] = useState<{ title: string; html: string } | null>(null);
  const [offers, setOffers] = useState<ItemOffer[]>([]);
  const [offerDraft, setOfferDraft] = useState<OfferDraft | null>(null);
  const [isOfferSaving, setIsOfferSaving] = useState(false);
  const itemPermission = getModulePermission(modulePermissions, "items", "admin");
  const stockPermission = getModulePermission(modulePermissions, "stock", "admin");
  const reportsPermission = getModulePermission(modulePermissions, "reports", "admin");
  const settingsPermission = getModulePermission(modulePermissions, "settings", "admin");
  const canCreateItems = itemPermission.create;
  const canManageItems = itemPermission.manage;
  const canManageStock = stockPermission.create || stockPermission.manage;
  const canPrintBarcodes = canCreateItems || canManageItems;
  const canViewReports = reportsPermission.view;
  const canViewSettings = settingsPermission.view;

  useEffect(() => {
    const normalized = items.map(item => normalizeItem(item));
    setInventory(normalized);
    setSelectedItemId(current =>
      current && normalized.some(item => item.id === current) ? current : normalized[0]?.id ?? ""
    );
    setSelectedBarcodeItemIds(current => {
      const validIds = new Set(normalized.map(item => item.id));
      const stockById = new Map(normalized.map(item => [item.id, item.stock]));
      const next = new Set([...current].filter(id => validIds.has(id) && (!hideZeroStockBarcodes || (stockById.get(id) ?? 0) > 0)));
      return next.size === current.size ? current : next;
    });
  }, [hideZeroStockBarcodes, items]);

  useEffect(() => {
    let mounted = true;
    getBarcodeLabelSizes()
      .then(payload => {
        if (!mounted || payload.sizes.length === 0) return;
        setBarcodeLabelSizes(payload.sizes);
        setBarcodeLabelSize(current => payload.sizes.some(size => size.id === current) ? current : payload.sizes[0].id);
      })
      .catch(error => {
        if (!mounted) return;
        setItemsNotice(error instanceof Error ? error.message : "Barcode label sizes could not be loaded.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    getItemOffers()
      .then(rows => {
        if (mounted) setOffers(rows);
      })
      .catch(error => {
        if (mounted) {
          setItemsNotice(error instanceof Error ? error.message : "Item offers could not be loaded.");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(inventory.map(item => item.category)))],
    [inventory]
  );

  const selectedItem = useMemo(
    () => inventory.find(item => item.id === selectedItemId) ?? inventory[0],
    [inventory, selectedItemId]
  );

  const activeOfferByItemId = useMemo(() => {
    const map = new Map<string, ItemOffer>();
    offers
      .filter(offer => offer.status === "active")
      .forEach(offer => {
        if (!map.has(offer.itemId)) {
          map.set(offer.itemId, offer);
        }
      });
    return map;
  }, [offers]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return inventory.filter(item => {
      const matchesSearch =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.itemCode.includes(query) ||
        item.category.toLowerCase().includes(query);
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchesLowStock =
        !lowStockOnly ||
        (typeof item.lowStockQuantity === "number" && item.stock <= item.lowStockQuantity);

      return matchesSearch && matchesCategory && matchesLowStock;
    });
  }, [inventory, lowStockOnly, searchQuery, selectedCategory]);

  const stockValue = inventory.reduce((total, item) => total + item.purchasePrice * item.stock, 0);
  const lowStockCount = inventory.filter(
    item => typeof item.lowStockQuantity === "number" && item.stock <= item.lowStockQuantity
  ).length;

  const openDetail = (item: InventoryItem) => {
    setSelectedItemId(item.id);
    setViewMode("detail");
  };

  const openEditor = (item: InventoryItem, tab: ItemEditorTab = "basic") => {
    if (tab === "stock" && !canManageStock) {
      setItemsNotice("Your role can view stock but cannot adjust stock.");
      return;
    }
    if (tab !== "stock" && !canManageItems) {
      setItemsNotice("Your role can view inventory but cannot edit item details.");
      return;
    }
    setIsCreating(false);
    setDraftItem({ ...item, customFields: { ...item.customFields } });
    setEditorTab(tab);
  };

  const openCreator = () => {
    if (!canCreateItems) {
      setItemsNotice("Your role can view inventory but cannot create items.");
      return;
    }
    const defaultGodown = godowns[0];
    setIsCreating(true);
    setDraftItem({
      id: `item-${Date.now()}`,
      name: "",
      hsn: "",
      price: 0,
      purchasePrice: 0,
      stock: 0,
      godown: defaultGodown?.name ?? "-",
      godownId: defaultGodown?.id,
      category: "KHADI COTTON",
      gstRate: 5,
      color: "",
      grn: "",
      itemCode: "",
      mrp: 0,
      unit: "Pieces(PCS)",
      asOfDate: "7 Jun 2024",
      description: "",
      onlineStore: false,
      secondaryUnit: "-",
      serialisationEnabled: false,
      customFields: {
        color: "",
        cinDate: "",
        grnDate: "",
        billNo: ""
      }
    });
    setEditorTab("basic");
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!canManageItems) {
      setItemsNotice("Your role cannot delete item records.");
      return;
    }
    if (!window.confirm(`Delete ${item.name} from this tenant inventory?`)) {
      return;
    }

    try {
      setItemsNotice(`Deleting ${item.name} from Postgres...`);
      await deleteItem(item.id);
      setInventory(current => current.filter(row => row.id !== item.id));
      setSelectedBarcodeItemIds(current => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
      if (selectedItemId === item.id) {
        setSelectedItemId("");
        setViewMode("inventory");
      }
      setItemsNotice(`${item.name} was removed from active inventory.`);
      await onWorkspaceRefresh();
    } catch (error) {
      setItemsNotice(error instanceof Error ? error.message : "Item could not be deleted");
    }
  };

  const handleViewBarcodeFromEditor = (item: InventoryItem) => {
    if (isCreating) {
      setItemsNotice("Save the item before generating a barcode label.");
      return;
    }
    handlePrintBarcode(item);
  };

  const saveDraft = () => {
    if (!draftItem) {
      return;
    }
    if (isCreating && !canCreateItems) {
      setItemsNotice("Your role cannot create items.");
      return;
    }
    if (!isCreating && editorTab === "stock" && !canManageStock) {
      setItemsNotice("Your role cannot adjust stock.");
      return;
    }
    if (!isCreating && editorTab !== "stock" && !canManageItems) {
      setItemsNotice("Your role cannot edit item details.");
      return;
    }

    const persistDraft = async () => {
      setItemsNotice("Saving item to Postgres...");
      const existingItem = inventory.find(item => item.id === draftItem.id);
      const saved = isCreating ? normalizeItem(await createItem(draftItem)) : normalizeItem(await updateItem(draftItem));
      const stockDelta = existingItem ? draftItem.stock - existingItem.stock : 0;

      if (!isCreating && stockDelta !== 0) {
        const currentStock = await adjustItemStock({
          itemId: draftItem.id,
          quantity: Math.abs(stockDelta),
          movementType: stockDelta > 0 ? "adjustment_in" : "adjustment_out",
          godownId: draftItem.godownId,
          notes: "Adjusted from inventory editor"
        });
        saved.stock = currentStock;
      }

      setInventory(current => {
        const exists = current.some(item => item.id === saved.id);
        if (!exists) {
          return [saved, ...current];
        }

        return current.map(item => (item.id === saved.id ? saved : item));
      });
      setSelectedItemId(saved.id);
      setDraftItem(null);
      setIsCreating(false);
      setItemsNotice("Item saved in Postgres.");
      await onWorkspaceRefresh();
    };

    persistDraft().catch(error => {
      setItemsNotice(error instanceof Error ? error.message : "Item could not be saved");
    });
  };

  const updateDraft = (patch: Partial<InventoryItem>) => {
    setDraftItem(current => (current ? { ...current, ...patch } : current));
  };

  const updateCustomField = (field: keyof InventoryItem["customFields"], value: string) => {
    setDraftItem(current =>
      current
        ? {
            ...current,
            customFields: {
              ...current.customFields,
              [field]: value
            }
          }
        : current
    );
  };

  const toggleBarcodeItem = (itemId: string) => {
    const item = inventory.find(row => row.id === itemId);
    if (hideZeroStockBarcodes && item && item.stock <= 0) {
      setItemsNotice(`${item.name} has zero stock and is hidden from barcode printing by Print Settings.`);
      return;
    }
    setSelectedBarcodeItemIds(current => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const toggleAllFilteredBarcodeItems = () => {
    setSelectedBarcodeItemIds(current => {
      const printableItems = hideZeroStockBarcodes ? filteredItems.filter(item => item.stock > 0) : filteredItems;
      const visibleIds = printableItems.map(item => item.id);
      if (hideZeroStockBarcodes && printableItems.length < filteredItems.length) {
        setItemsNotice("Zero-stock items were skipped because Print Settings hides barcode labels for them.");
      }
      const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => current.has(id));
      const next = new Set(current);
      visibleIds.forEach(id => {
        if (allVisibleSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  const handleBulkPrintBarcodes = async () => {
    if (!canPrintBarcodes) {
      setItemsNotice("Your role can view items but cannot create barcode labels.");
      return;
    }
    const itemIds = [...selectedBarcodeItemIds];
    if (itemIds.length === 0) {
      setItemsNotice("Select one or more items before preparing barcode labels.");
      return;
    }

    try {
      setIsBulkBarcodePrinting(true);
      setItemsNotice(`Preparing ${itemIds.length} item barcode batch...`);
      const payload = await createBulkBarcodeLabels({
        itemIds,
        copies: barcodeCopies,
        labelSize: barcodeLabelSize,
        ...barcodeOptions
      });
      const html = await getBarcodeLabelPrintHtml(payload.labels.map(label => label.id));
      setBarcodePreview({ title: "Bulk Barcode Labels", html });
      setItemsNotice(`${payload.labels.length} barcode label group(s) ready in print preview.`);
      await onWorkspaceRefresh();
    } catch (error) {
      setItemsNotice(error instanceof Error ? error.message : "Barcode labels could not be prepared.");
    } finally {
      setIsBulkBarcodePrinting(false);
    }
  };

  const handlePrintBarcode = async (item: InventoryItem) => {
    if (!canPrintBarcodes) {
      setItemsNotice("Your role can view items but cannot create barcode labels.");
      return;
    }
    if (hideZeroStockBarcodes && item.stock <= 0) {
      setItemsNotice(`${item.name} has zero stock and is hidden from barcode printing by Print Settings.`);
      return;
    }
    try {
      setPrintingBarcodeId(item.id);
      setItemsNotice(`Preparing barcode label for ${item.name}...`);
      const label = await createBarcodeLabel({
        itemId: item.id,
        copies: 1,
        labelSize: barcodeLabelSize,
        ...barcodeOptions
      });
      const html = await getBarcodeLabelPrintHtml([label.id]);
      setBarcodePreview({ title: `${item.name} Barcode`, html });
      setItemsNotice("Barcode print preview is ready from Postgres label data.");
      await onWorkspaceRefresh();
    } catch (error) {
      setItemsNotice(error instanceof Error ? error.message : "Barcode label could not be prepared.");
    } finally {
      setPrintingBarcodeId(null);
    }
  };

  const offerForItem = (itemId: string) =>
    activeOfferByItemId.get(itemId) || inventory.find(item => item.id === itemId)?.activeOffer || null;

  const openOfferManager = (item?: InventoryItem) => {
    if (!canManageItems) {
      setItemsNotice("Your role can view inventory but cannot manage item offers.");
      return;
    }

    const targetItem = item || selectedItem || inventory[0];
    if (!targetItem) {
      setItemsNotice("Create an item before launching an offer.");
      return;
    }

    const existingOffer =
      offerForItem(targetItem.id) ||
      offers.find(offer => offer.itemId === targetItem.id) ||
      null;
    setOfferDraft(makeOfferDraft(targetItem, existingOffer));
  };

  const syncOfferIntoInventory = (offer: ItemOffer) => {
    setInventory(current =>
      current.map(item => {
        if (item.id !== offer.itemId) return item;
        const activeOffer = offer.status === "active"
          ? offer
          : item.activeOffer?.id === offer.id
            ? null
            : item.activeOffer;
        return { ...item, activeOffer };
      })
    );
  };

  const saveOfferDraft = async () => {
    if (!offerDraft) return;
    const targetItem = inventory.find(item => item.id === offerDraft.itemId);
    if (!targetItem) {
      setItemsNotice("Choose a valid item for this offer.");
      return;
    }
    if (!offerDraft.title.trim()) {
      setItemsNotice("Enter an offer title before saving.");
      return;
    }
    if (offerDraft.discountValue <= 0) {
      setItemsNotice("Offer discount must be greater than zero.");
      return;
    }

    try {
      setIsOfferSaving(true);
      const saved = offerDraft.id
        ? await updateItemOffer({ ...offerDraft, id: offerDraft.id })
        : await createItemOffer(offerDraft);
      setOffers(current => [saved, ...current.filter(offer => offer.id !== saved.id)]);
      syncOfferIntoInventory(saved);
      setOfferDraft(makeOfferDraft(targetItem, saved));
      setItemsNotice(`${saved.title} saved for ${saved.itemName || targetItem.name}.`);
      await onWorkspaceRefresh();
    } catch (error) {
      setItemsNotice(error instanceof Error ? error.message : "Item offer could not be saved.");
    } finally {
      setIsOfferSaving(false);
    }
  };

  const changeOfferStatus = async (offerId: string, action: "activate" | "pause") => {
    try {
      setIsOfferSaving(true);
      const saved = action === "activate" ? await activateItemOffer(offerId) : await pauseItemOffer(offerId);
      setOffers(current => [saved, ...current.filter(offer => offer.id !== saved.id)]);
      syncOfferIntoInventory(saved);
      const item = inventory.find(row => row.id === saved.itemId);
      if (item) setOfferDraft(makeOfferDraft(item, saved));
      setItemsNotice(`${saved.title} ${action === "activate" ? "activated" : "paused"}.`);
      await onWorkspaceRefresh();
    } catch (error) {
      setItemsNotice(error instanceof Error ? error.message : "Offer status could not be changed.");
    } finally {
      setIsOfferSaving(false);
    }
  };

  return (
    <div className="mbb-screen items-screen">
      {viewMode === "inventory" || !selectedItem ? (
        <InventoryList
          categories={categories}
          activeOfferByItemId={activeOfferByItemId}
          filteredItems={filteredItems}
          lowStockCount={lowStockCount}
          lowStockOnly={lowStockOnly}
          onCreateItem={openCreator}
          onDeleteItem={handleDeleteItem}
          onEditItem={openEditor}
          onOpenDetail={openDetail}
          onPrintBarcode={handlePrintBarcode}
          onBarcodeCopiesChange={value => setBarcodeCopies(Math.max(1, Math.min(99, Number(value) || 1)))}
          onBarcodeLabelSizeChange={setBarcodeLabelSize}
          onBarcodeOptionsChange={setBarcodeOptions}
          onPrintSelectedBarcodes={handleBulkPrintBarcodes}
          onSearchChange={setSearchQuery}
          onSelectedCategoryChange={setSelectedCategory}
          onToggleSelectAll={toggleAllFilteredBarcodeItems}
          onToggleSelectItem={toggleBarcodeItem}
          onToggleLowStock={() => setLowStockOnly(value => !value)}
          searchQuery={searchQuery}
          selectedCategory={selectedCategory}
          selectedItemIds={selectedBarcodeItemIds}
          stockValue={stockValue}
          barcodeCopies={barcodeCopies}
          barcodeLabelSize={barcodeLabelSize}
          barcodeLabelSizes={barcodeLabelSizes}
          barcodeOptions={barcodeOptions}
          hideZeroStockBarcodes={hideZeroStockBarcodes}
          isBulkBarcodePrinting={isBulkBarcodePrinting}
          notice={itemsNotice}
          showBulkSummary={showBulkSummary}
          showShortcuts={showShortcuts}
          totalItems={inventory.length}
          canCreateItems={canCreateItems}
          canManageItems={canManageItems}
          canManageStock={canManageStock}
          canPrintBarcodes={canPrintBarcodes}
          canViewReports={canViewReports}
          canViewSettings={canViewSettings}
          onNavigate={onNavigate}
          onDismissOffer={() => setItemsNotice("Offer banner dismissed for this session.")}
          onManageOffer={openOfferManager}
          onToggleBulkSummary={() => setShowBulkSummary(current => !current)}
          onToggleShortcuts={() => setShowShortcuts(current => !current)}
        />
      ) : (
        <ItemDetailView
          inventory={inventory}
          selectedItem={selectedItem}
          selectedItemId={selectedItemId}
          onBack={() => setViewMode("inventory")}
          onCreateItem={openCreator}
          onEditItem={openEditor}
          onNavigate={onNavigate}
          onPrintBarcode={handlePrintBarcode}
          onDeleteItem={handleDeleteItem}
          onSelectItem={setSelectedItemId}
          printingBarcodeId={printingBarcodeId}
          canCreateItems={canCreateItems}
          canManageItems={canManageItems}
          canManageStock={canManageStock}
          canPrintBarcodes={canPrintBarcodes}
          canViewReports={canViewReports}
          canViewSettings={canViewSettings}
        />
      )}

      {draftItem && (
        <EditItemModal
          draftItem={draftItem}
          editorTab={editorTab}
          isCreating={isCreating}
          onCancel={() => {
            setDraftItem(null);
            setIsCreating(false);
          }}
          onSave={saveDraft}
          onTabChange={setEditorTab}
          onUpdateCustomField={updateCustomField}
          onUpdateDraft={updateDraft}
          onViewBarcode={handleViewBarcodeFromEditor}
          parties={parties}
          onNotice={setItemsNotice}
          onWorkspaceRefresh={onWorkspaceRefresh}
        />
      )}

      {barcodePreview && (
        <HtmlPrintPreviewModal
          html={barcodePreview.html}
          onClose={() => setBarcodePreview(null)}
          title={barcodePreview.title}
        />
      )}

      {offerDraft && (
        <ItemOfferModal
          draft={offerDraft}
          inventory={inventory}
          isSaving={isOfferSaving}
          offers={offers}
          onActivate={(offerId) => changeOfferStatus(offerId, "activate")}
          onCancel={() => setOfferDraft(null)}
          onDraftChange={patch => setOfferDraft(current => current ? { ...current, ...patch } : current)}
          onPause={(offerId) => changeOfferStatus(offerId, "pause")}
          onSave={saveOfferDraft}
        />
      )}
    </div>
  );
}

interface InventoryListProps {
  activeOfferByItemId: Map<string, ItemOffer>;
  barcodeCopies: number;
  barcodeLabelSize: string;
  barcodeLabelSizes: BarcodeLabelSize[];
  barcodeOptions: typeof DEFAULT_BARCODE_OPTIONS;
  categories: string[];
  filteredItems: InventoryItem[];
  hideZeroStockBarcodes: boolean;
  isBulkBarcodePrinting: boolean;
  lowStockCount: number;
  lowStockOnly: boolean;
  notice: string;
  onBarcodeCopiesChange: (value: number) => void;
  onBarcodeLabelSizeChange: (value: string) => void;
  onBarcodeOptionsChange: (value: typeof DEFAULT_BARCODE_OPTIONS) => void;
  onCreateItem: () => void;
  onDeleteItem: (item: InventoryItem) => void;
  onDismissOffer: () => void;
  onEditItem: (item: InventoryItem, tab?: ItemEditorTab) => void;
  onManageOffer: (item?: InventoryItem) => void;
  onNavigate: (tab: string) => void;
  onOpenDetail: (item: InventoryItem) => void;
  onPrintBarcode: (item: InventoryItem) => void;
  onPrintSelectedBarcodes: () => void;
  onSearchChange: (value: string) => void;
  onSelectedCategoryChange: (value: string) => void;
  onToggleBulkSummary: () => void;
  onToggleLowStock: () => void;
  onToggleSelectAll: () => void;
  onToggleSelectItem: (itemId: string) => void;
  onToggleShortcuts: () => void;
  searchQuery: string;
  selectedCategory: string;
  selectedItemIds: Set<string>;
  showBulkSummary: boolean;
  showShortcuts: boolean;
  stockValue: number;
  totalItems: number;
  canCreateItems: boolean;
  canManageItems: boolean;
  canManageStock: boolean;
  canPrintBarcodes: boolean;
  canViewReports: boolean;
  canViewSettings: boolean;
}

function InventoryList({
  activeOfferByItemId,
  barcodeCopies,
  barcodeLabelSize,
  barcodeLabelSizes,
  barcodeOptions,
  categories,
  filteredItems,
  hideZeroStockBarcodes,
  isBulkBarcodePrinting,
  lowStockCount,
  lowStockOnly,
  notice,
  onBarcodeCopiesChange,
  onBarcodeLabelSizeChange,
  onBarcodeOptionsChange,
  onCreateItem,
  onDeleteItem,
  onDismissOffer,
  onEditItem,
  onManageOffer,
  onNavigate,
  onOpenDetail,
  onPrintBarcode,
  onPrintSelectedBarcodes,
  onSearchChange,
  onSelectedCategoryChange,
  onToggleBulkSummary,
  onToggleLowStock,
  onToggleSelectAll,
  onToggleSelectItem,
  onToggleShortcuts,
  searchQuery,
  selectedCategory,
  selectedItemIds,
  showBulkSummary,
  showShortcuts,
  stockValue,
  totalItems,
  canCreateItems,
  canManageItems,
  canManageStock,
  canPrintBarcodes,
  canViewReports,
  canViewSettings
}: InventoryListProps) {
  const printableFilteredItems = hideZeroStockBarcodes ? filteredItems.filter(item => item.stock > 0) : filteredItems;
  const allVisibleSelected = printableFilteredItems.length > 0 && printableFilteredItems.every(item => selectedItemIds.has(item.id));
  const [openActionItemId, setOpenActionItemId] = useState<string | null>(null);
  const patchBarcodeOptions = (patch: Partial<typeof DEFAULT_BARCODE_OPTIONS>) => {
    onBarcodeOptionsChange({ ...barcodeOptions, ...patch });
  };

  return (
    <div className="mbb-page-card">
      <div className="mbb-items-header">
        <h1>Items</h1>
        <div className="mbb-header-actions">
          {canManageItems && (
            <button className="mbb-outline-purple" onClick={() => onManageOffer()} type="button">
              <BadgePercent size={16} />
              Manage Offer
            </button>
          )}
          {canViewReports && (
            <button className="mbb-report-btn" onClick={() => onNavigate("reports")} type="button">
              <FileBarChart size={16} />
              Reports
              <ChevronDown size={15} />
            </button>
          )}
          {canViewSettings && (
            <button className="mbb-icon-btn" aria-label="Settings" onClick={() => onNavigate("settings")} type="button">
              <Settings2 size={18} />
            </button>
          )}
          <button className="mbb-icon-btn" aria-label="Keyboard shortcuts" onClick={onToggleShortcuts} type="button">
            <Keyboard size={18} />
          </button>
        </div>
      </div>

      <div className="mbb-offer-banner">
        <div className="mbb-offer-art">
          <span className="mbb-gift-box" />
          <span className="mbb-shop-bag" />
          <span className="mbb-spark one" />
          <span className="mbb-spark two" />
        </div>
        <span>Launch Offers on Your Items</span>
        {canManageItems && <button onClick={() => onManageOffer()} type="button">Create Offer Now</button>}
        <button aria-label="Dismiss offer banner" className="mbb-offer-close" onClick={onDismissOffer} type="button">
          <X size={22} />
        </button>
      </div>

      {(notice || showShortcuts || showBulkSummary) && (
        <div className="items-action-strip">
          {notice && <span>{notice}</span>}
          {showShortcuts && <span>Shortcuts: / search, Enter opens item detail, Ctrl+N creates item.</span>}
          {showBulkSummary && <span>{selectedItemIds.size} selected. {filteredItems.length} visible of {totalItems} items. Current stock value is {formatMoney(stockValue, 2)}.</span>}
        </div>
      )}
      {!canManageItems && (
        <div className="permission-readonly-banner">
          <span>You can view inventory, but your role cannot create, edit, or print item records.</span>
        </div>
      )}

      <div className="mbb-summary-grid">
        <button className="mbb-summary-card" onClick={() => onSelectedCategoryChange("all")} type="button">
          <span className="mbb-summary-title blue">
            <BadgeIndianRupee size={17} />
            Stock Value
            <Info size={14} />
          </span>
          <strong>{formatMoney(stockValue, 2)}</strong>
          <ExternalLink size={16} className="mbb-card-corner" />
        </button>
        <button className="mbb-summary-card" onClick={onToggleLowStock} type="button">
          <span className="mbb-summary-title orange">
            <Package size={17} />
            Low Stock
          </span>
          <strong>{lowStockCount}</strong>
          <ExternalLink size={16} className="mbb-card-corner" />
        </button>
      </div>

      <div className="mbb-tools">
        <label className="mbb-search-box" htmlFor="item-search">
          <Search size={20} />
          <input
            id="item-search"
            type="text"
            placeholder="Search by SKU Code"
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
            aria-label="Search items"
          />
          <ScanBarcode size={19} />
        </label>

        <label className="mbb-select-box" htmlFor="category-filter">
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={event => onSelectedCategoryChange(event.target.value)}
            aria-label="Search categories"
          >
            <option value="all">Search Categories</option>
            {categories
              .filter(category => category !== "all")
              .map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
          </select>
          <ChevronDown size={18} />
        </label>

        <button
          className={`mbb-low-stock-btn ${lowStockOnly ? "active" : ""}`}
          onClick={onToggleLowStock}
          type="button"
        >
          <Boxes size={18} />
          Low Stock
        </button>

        <div className="mbb-tools-spacer" />

        <button className="mbb-bulk-btn" disabled={!canPrintBarcodes} onClick={onToggleBulkSummary} type="button">
          <ClipboardList size={19} />
          Bulk Actions
          <ChevronDown size={18} />
        </button>
        {canCreateItems && (
          <button className="mbb-primary-btn" onClick={onCreateItem} type="button">
            Create Item
          </button>
        )}
      </div>

      {showBulkSummary && (
        <div className="items-bulk-panel">
          <div>
            <strong>Bulk Barcode Print</strong>
            <span>{selectedItemIds.size} selected item(s)</span>
            {hideZeroStockBarcodes && <span>Zero-stock labels hidden</span>}
          </div>
          <label>
            Label size
            <select value={barcodeLabelSize} onChange={event => onBarcodeLabelSizeChange(event.target.value)}>
              {barcodeLabelSizes.map(size => (
                <option key={size.id} value={size.id}>
                  {size.name} - {size.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            Copies
            <input
              min="1"
              max="99"
              type="number"
              value={barcodeCopies}
              onChange={event => onBarcodeCopiesChange(Number(event.target.value))}
            />
          </label>
          <label>
            Price
            <select
              value={barcodeOptions.priceSource}
              onChange={event => patchBarcodeOptions({ priceSource: event.target.value as BarcodeLabelPriceSource })}
            >
              <option value="selling">Selling Price</option>
              <option value="mrp">MRP</option>
              <option value="none">No Price</option>
            </select>
          </label>
          <div className="items-bulk-checks">
            <label>
              <input
                checked={barcodeOptions.includeBusinessName}
                onChange={event => patchBarcodeOptions({ includeBusinessName: event.target.checked })}
                type="checkbox"
              />
              Business
            </label>
            <label>
              <input
                checked={barcodeOptions.includeItemName}
                onChange={event => patchBarcodeOptions({ includeItemName: event.target.checked })}
                type="checkbox"
              />
              Item
            </label>
            <label>
              <input
                checked={barcodeOptions.includePrice}
                onChange={event => patchBarcodeOptions({ includePrice: event.target.checked })}
                type="checkbox"
              />
              Price
            </label>
            <label>
              <input
                checked={barcodeOptions.includeMrp}
                onChange={event => patchBarcodeOptions({ includeMrp: event.target.checked })}
                type="checkbox"
              />
              MRP
            </label>
          </div>
          <button
            className="mbb-primary-btn"
            disabled={!canPrintBarcodes || selectedItemIds.size === 0 || isBulkBarcodePrinting}
            onClick={onPrintSelectedBarcodes}
            type="button"
          >
            <Printer size={17} />
            {isBulkBarcodePrinting ? "Preparing..." : "Preview & Print"}
          </button>
        </div>
      )}

      <div className="mbb-table-wrap">
        <table className="mbb-items-table">
          <thead>
            <tr>
              <th className="mbb-checkbox-cell">
                <button
                  aria-label={allVisibleSelected ? "Clear selected items" : "Select visible items"}
                  className={`mbb-checkbox ${allVisibleSelected ? "active" : ""}`}
                  disabled={!canPrintBarcodes}
                  onClick={onToggleSelectAll}
                  type="button"
                />
              </th>
              <th>
                <span className="mbb-sort-label">
                  Item Name
                  <ChevronDown size={15} />
                </span>
              </th>
              <th>Item Code</th>
              <th>
                <span className="mbb-sort-label">
                  Stock QTY
                  <ChevronDown size={15} />
                </span>
              </th>
              <th>Selling Price</th>
              <th>Purchase Price</th>
              <th>MRP</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={8} className="mbb-empty-table-cell">
                  No items found for this tenant inventory.
                </td>
              </tr>
            )}
            {filteredItems.map((item, index) => {
              const activeOffer = activeOfferByItemId.get(item.id) || item.activeOffer || null;
              const displayPrice = offerPriceForItem(item, activeOffer);
              return (
              <tr
                key={item.id}
                className={index === 3 ? "is-selected-row" : ""}
                onClick={() => onOpenDetail(item)}
              >
                <td className="mbb-checkbox-cell">
                  <button
                    className={`mbb-checkbox ${selectedItemIds.has(item.id) ? "active" : ""}`}
                    aria-label={`Select ${item.name}`}
                    disabled={!canPrintBarcodes}
                    onClick={event => {
                      event.stopPropagation();
                      onToggleSelectItem(item.id);
                    }}
                    type="button"
                  />
                </td>
                <td>
                  <div className="mbb-item-name">{item.name}</div>
                  <span className="mbb-category-chip">{item.category}</span>
                  {activeOffer && (
                    <span className="item-offer-chip">
                      {activeOffer.title}
                    </span>
                  )}
                </td>
                <td>{item.itemCode}</td>
                <td>{item.stock} PCS</td>
                <td>
                  {activeOffer ? (
                    <span className="item-offer-price">
                      <strong>{formatMoney(displayPrice)}</strong>
                      <small>{formatMoney(item.price)}</small>
                    </span>
                  ) : (
                    formatMoney(item.price)
                  )}
                </td>
                <td>{formatMoney(item.purchasePrice)}</td>
                <td>{formatMoney(item.mrp)}</td>
                <td>
                  {(canManageItems || canPrintBarcodes || canManageStock) && (
                    <div className="items-row-actions">
                      <button
                        className="mbb-row-menu"
                        aria-label={`Actions for ${item.name}`}
                        onClick={event => {
                          event.stopPropagation();
                          setOpenActionItemId(current => current === item.id ? null : item.id);
                        }}
                        type="button"
                      >
                        <MoreVertical size={19} />
                      </button>
                      {openActionItemId === item.id && (
                        <div className="items-row-menu" onClick={event => event.stopPropagation()}>
                          <button onClick={() => { setOpenActionItemId(null); onOpenDetail(item); }} type="button">
                            View Details
                          </button>
                          {canManageItems && (
                            <button onClick={() => { setOpenActionItemId(null); onEditItem(item, "basic"); }} type="button">
                              Edit Item
                            </button>
                          )}
                          {canManageStock && (
                            <button onClick={() => { setOpenActionItemId(null); onEditItem(item, "stock"); }} type="button">
                              Adjust Stock
                            </button>
                          )}
                          {canPrintBarcodes && (
                            <button onClick={() => { setOpenActionItemId(null); onPrintBarcode(item); }} type="button">
                              Print Barcode
                            </button>
                          )}
                          {canManageItems && (
                            <button onClick={() => { setOpenActionItemId(null); onManageOffer(item); }} type="button">
                              Manage Offer
                            </button>
                          )}
                          {canManageItems && (
                            <button className="danger" onClick={() => { setOpenActionItemId(null); onDeleteItem(item); }} type="button">
                              Delete Item
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button className="mbb-help-bubble" aria-label="Help" onClick={() => onNavigate("settings")} type="button">
        ?
      </button>
      <button className="mbb-pending-actions" onClick={onToggleLowStock} type="button">
        <Boxes size={25} />
        Pending Actions
        <span>{lowStockCount}</span>
      </button>
    </div>
  );
}

interface ItemDetailViewProps {
  inventory: InventoryItem[];
  selectedItem: InventoryItem;
  selectedItemId: string;
  onBack: () => void;
  onCreateItem: () => void;
  onDeleteItem: (item: InventoryItem) => void;
  onEditItem: (item: InventoryItem, tab?: ItemEditorTab) => void;
  onNavigate: (tab: string) => void;
  onPrintBarcode: (item: InventoryItem) => void;
  onSelectItem: (id: string) => void;
  printingBarcodeId: string | null;
  canCreateItems: boolean;
  canManageItems: boolean;
  canManageStock: boolean;
  canPrintBarcodes: boolean;
  canViewReports: boolean;
  canViewSettings: boolean;
}

function ItemDetailView({
  inventory,
  selectedItem,
  selectedItemId,
  onBack,
  onCreateItem,
  onDeleteItem,
  onEditItem,
  onNavigate,
  onPrintBarcode,
  onSelectItem,
  printingBarcodeId,
  canCreateItems,
  canManageItems,
  canManageStock,
  canPrintBarcodes,
  canViewReports,
  canViewSettings
}: ItemDetailViewProps) {
  const discountAmount = Math.max(0, selectedItem.mrp - selectedItem.price);
  const discountPercent = selectedItem.mrp > 0 ? (discountAmount / selectedItem.mrp) * 100 : 0;
  const offerPrice = offerPriceForItem(selectedItem, selectedItem.activeOffer);

  return (
    <div className="mbb-detail-shell">
      <aside className="mbb-detail-list">
        <label className="mbb-detail-search" htmlFor="detail-search">
          <Search size={19} />
          <input id="detail-search" placeholder="Search by SKU Code" type="text" />
        </label>

        {canCreateItems && (
          <button className="mbb-create-dashed" onClick={onCreateItem} type="button">
            <Plus size={17} />
            Create Item
          </button>
        )}

        <div className="mbb-sku-list">
          {inventory.map(item => (
            <button
              key={item.id}
              className={`mbb-sku-card ${selectedItemId === item.id ? "active" : ""}`}
              onClick={() => onSelectItem(item.id)}
              type="button"
            >
              <span>{item.name}</span>
              <small>{item.stock}PCS</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="mbb-detail-main">
        <div className="mbb-detail-titlebar">
          <div className="mbb-detail-heading">
            <button className="mbb-back-btn" onClick={onBack} aria-label="Back to items" type="button">
              <ArrowLeft size={30} />
            </button>
            <h1>{selectedItem.name}</h1>
            <span className={selectedItem.stock > 0 ? "mbb-stock-badge" : "mbb-stock-badge low"}>
              {selectedItem.stock > 0 ? "In Stock" : "Out of Stock"}
            </span>
          </div>

          <div className="mbb-detail-actions">
            {canPrintBarcodes && (
              <button onClick={() => onPrintBarcode(selectedItem)} disabled={printingBarcodeId === selectedItem.id} type="button">
                <ScanBarcode size={17} />
                {printingBarcodeId === selectedItem.id ? "Preparing..." : "Print Barcode"}
              </button>
            )}
            {canManageStock && (
              <button onClick={() => onEditItem(selectedItem, "stock")} type="button">
                <PackageCheck size={17} />
                Adjust Stock
              </button>
            )}
            {canManageItems && (
              <button onClick={() => onEditItem(selectedItem, "basic")} type="button">
                <Pencil size={17} />
                Edit
              </button>
            )}
            {canManageItems && (
              <button className="danger" aria-label="Delete item" onClick={() => onDeleteItem(selectedItem)} type="button">
                <Trash2 size={17} />
              </button>
            )}
            {canViewSettings && (
              <button aria-label="Keyboard shortcuts" onClick={() => onNavigate("settings")} type="button">
                <Keyboard size={17} />
              </button>
            )}
          </div>
        </div>

        <div className="mbb-detail-tabs">
          <button className="active" type="button">
            <ReceiptText size={18} />
            Item Details
          </button>
          {canManageStock && (
            <button onClick={() => onEditItem(selectedItem, "stock")} type="button">
              <Package size={18} />
              Stock Details
            </button>
          )}
          {canViewReports && (
            <button onClick={() => onNavigate("reports")} type="button">
              <FileBarChart size={18} />
              Party Wise Report
            </button>
          )}
          {canManageItems && (
            <button onClick={() => onEditItem(selectedItem, "party")} type="button">
              <ReceiptText size={18} />
              Party Wise Prices
            </button>
          )}
        </div>

        <div className="mbb-detail-grid">
          <article className="mbb-info-panel">
            <header>
              <ReceiptText size={17} />
              General Details
            </header>
            <div className="mbb-general-grid">
              <DetailField label="Item Name" value={selectedItem.name} />
              <DetailField label="Item Code" value={selectedItem.itemCode} />
              <DetailField label="Category" value={selectedItem.category} />
              <DetailField label="Current Stock" value={`${selectedItem.stock} PCS`} />
              <DetailField label="Stock Value" value={formatMoney(selectedItem.purchasePrice * selectedItem.stock)} />
              <DetailField label="Low Stock Quantity" value={selectedItem.lowStockQuantity?.toString() ?? "-"} />
              <DetailField
                label="Low Stock Warning"
                value={typeof selectedItem.lowStockQuantity === "number" ? "Enabled" : "Disabled"}
                tone={typeof selectedItem.lowStockQuantity === "number" ? "green" : "red"}
              />
              <DetailField label="Show in Online Store" value={selectedItem.onlineStore ? "Yes" : "No"} tone={selectedItem.onlineStore ? "green" : undefined} />
            </div>
            <div className="mbb-description">
              <span>Item Description</span>
              <p>{selectedItem.description}</p>
            </div>
          </article>

          <div className="mbb-side-panels">
            <article className="mbb-info-panel">
              <header>
                <ReceiptText size={17} />
                Pricing Details
              </header>
              <div className="mbb-pricing-grid">
                <DetailField label="Sales Price" value={`${formatMoney(selectedItem.price)} With Tax`} />
                {selectedItem.activeOffer && <DetailField label="Active Offer Price" value={formatMoney(offerPrice)} tone="green" />}
                <DetailField label="Purchase Price" value={`${formatMoney(selectedItem.purchasePrice)} Without Tax`} />
                <DetailField label="MRP" value={formatMoney(selectedItem.mrp)} />
                <DetailField label="Disc. on MRP" value={`${discountPercent.toFixed(2)}% (${formatMoney(discountAmount, 2)})`} />
                <DetailField label="GST Tax Rate" value={`${selectedItem.gstRate}%`} />
                <DetailField label="HSN Code" value={selectedItem.hsn} />
                <DetailField label="Secondary Unit" value={selectedItem.secondaryUnit ?? "-"} />
              </div>
            </article>

            <article className="mbb-info-panel mbb-stock-panel">
              <header>
                <Package size={17} />
                Stock Details
              </header>
              <DetailField
                label="Serialisation"
                value={selectedItem.serialisationEnabled ? "Enabled" : "Disabled"}
                tone={selectedItem.serialisationEnabled ? "green" : "red"}
              />
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value: string;
  tone?: "green" | "red";
}

function DetailField({ label, value, tone }: DetailFieldProps) {
  return (
    <div className="mbb-detail-field">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

interface EditItemModalProps {
  draftItem: InventoryItem;
  editorTab: ItemEditorTab;
  isCreating: boolean;
  onCancel: () => void;
  onNotice: (message: string) => void;
  onSave: () => void;
  onTabChange: (tab: ItemEditorTab) => void;
  onUpdateCustomField: (field: keyof InventoryItem["customFields"], value: string) => void;
  onUpdateDraft: (patch: Partial<InventoryItem>) => void;
  onViewBarcode: (item: InventoryItem) => void;
  onWorkspaceRefresh: () => Promise<void> | void;
  parties: Party[];
}

function EditItemModal({
  draftItem,
  editorTab,
  isCreating,
  onCancel,
  onNotice,
  onSave,
  onTabChange,
  onUpdateCustomField,
  onUpdateDraft,
  onViewBarcode,
  onWorkspaceRefresh,
  parties
}: EditItemModalProps) {
  return (
    <div className="mbb-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-item-title">
      <div className="mbb-edit-modal">
        <div className="mbb-edit-header">
          <h2 id="edit-item-title">{isCreating ? "Create Item" : "Edit Item"}</h2>
          <button aria-label="Close modal" onClick={onCancel} type="button">
            <X size={22} />
          </button>
        </div>

        <div className="mbb-edit-body">
          <aside className="mbb-edit-tabs">
            <button
              className={editorTab === "basic" ? "active top" : "top"}
              onClick={() => onTabChange("basic")}
              type="button"
            >
              <ReceiptText size={21} />
              Basic Details
              <sup>*</sup>
            </button>
            <span>Advance Details</span>
            <button
              className={editorTab === "stock" ? "active" : ""}
              onClick={() => onTabChange("stock")}
              type="button"
            >
              <Package size={22} />
              Stock Details
            </button>
            <button
              className={editorTab === "pricing" ? "active" : ""}
              onClick={() => onTabChange("pricing")}
              type="button"
            >
              <ReceiptText size={22} />
              Pricing Details
            </button>
            <button
              className={editorTab === "party" ? "active" : ""}
              onClick={() => onTabChange("party")}
              type="button"
            >
              <ReceiptText size={22} />
              Party Wise Prices
            </button>
            <button
              className={editorTab === "custom" ? "active" : ""}
              onClick={() => onTabChange("custom")}
              type="button"
            >
              <SlidersHorizontal size={22} />
              Custom Fields
            </button>
          </aside>

          <section className="mbb-edit-content">
            {editorTab === "basic" && (
              <BasicEditor draftItem={draftItem} onUpdateDraft={onUpdateDraft} />
            )}
            {editorTab === "stock" && (
              <StockEditor draftItem={draftItem} onUpdateDraft={onUpdateDraft} onViewBarcode={onViewBarcode} />
            )}
            {editorTab === "pricing" && (
              <PricingEditor draftItem={draftItem} onUpdateDraft={onUpdateDraft} />
            )}
            {editorTab === "party" && (
              <PartyWiseEditor
                draftItem={draftItem}
                isCreating={isCreating}
                onNotice={onNotice}
                onWorkspaceRefresh={onWorkspaceRefresh}
                parties={parties}
              />
            )}
            {editorTab === "custom" && (
              <CustomFieldsEditor
                customFields={draftItem.customFields}
                onUpdateCustomField={onUpdateCustomField}
              />
            )}
          </section>
        </div>

        <div className="mbb-edit-footer">
          <button className="mbb-cancel-btn" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="mbb-save-btn" onClick={onSave} type="button">
            Save Item
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditorProps {
  draftItem: InventoryItem;
  onUpdateDraft: (patch: Partial<InventoryItem>) => void;
}

function BasicEditor({ draftItem, onUpdateDraft }: EditorProps) {
  return (
    <div className="mbb-form-card basic-card">
      <div className="mbb-basic-grid">
        <div className="mbb-item-type">
          <span>
            Item Type
            <sup>*</sup>
          </span>
          <div className="mbb-radio-row">
            <button className="selected" type="button">
              Product
              <span />
            </button>
            <button type="button">
              Service
              <span />
            </button>
          </div>
        </div>

        <label className="mbb-field">
          <span>Category</span>
          <div className="mbb-category-input">
            <input
              value={draftItem.category}
              onChange={event => onUpdateDraft({ category: event.target.value })}
            />
            <X size={17} />
          </div>
        </label>
      </div>

      <div className="mbb-form-grid two">
        <FormInput
          label="Item Name"
          value={draftItem.name}
          onChange={value => onUpdateDraft({ name: value })}
        />
        <div className="mbb-online-toggle">
          <span>Show Item in Online Store</span>
        <button className={draftItem.onlineStore ? "on" : ""} onClick={() => onUpdateDraft({ onlineStore: !draftItem.onlineStore })} type="button">
            <span />
          </button>
        </div>
      </div>

      <div className="mbb-form-grid two">
        <PriceInput
          label="Sales Price"
          value={draftItem.price}
          trailing="With Tax"
          onChange={value => onUpdateDraft({ price: value })}
        />
        <label className="mbb-field">
          <span>GST Tax Rate(%)</span>
          <div className="mbb-input-select">
            <Search size={18} />
            <input value={`GST @ ${draftItem.gstRate}%`} readOnly />
            <ChevronDown size={19} />
          </div>
        </label>
      </div>

      <div className="mbb-form-grid two">
        <label className="mbb-field">
          <span>Measuring Unit</span>
          <div className="mbb-input-select">
            <Search size={18} />
            <input value={draftItem.unit} readOnly />
            <ChevronDown size={19} />
          </div>
        </label>
        <label className="mbb-field">
          <span>Opening Stock</span>
          <div className="mbb-input-suffix">
            <input
              placeholder="ex: 150 PCS"
              value={draftItem.stock ? String(draftItem.stock) : ""}
              onChange={event => onUpdateDraft({ stock: Number(event.target.value) || 0 })}
            />
            <span>PCS</span>
          </div>
        </label>
      </div>

      <div className="mbb-serialisation-strip">
        <label>
          Enable Serialisation
          <Info size={16} />
        </label>
        <button
          className={draftItem.serialisationEnabled ? "on" : ""}
          onClick={() => onUpdateDraft({ serialisationEnabled: !draftItem.serialisationEnabled })}
          type="button"
          aria-label="Enable Serialisation"
        >
          <span />
        </button>
      </div>
    </div>
  );
}

interface StockEditorProps extends EditorProps {
  onViewBarcode: (item: InventoryItem) => void;
}

function StockEditor({ draftItem, onUpdateDraft, onViewBarcode }: StockEditorProps) {
  const lowStockEnabled = typeof draftItem.lowStockQuantity === "number";

  return (
    <div className="mbb-form-card scrollable">
      <div className="mbb-form-grid two">
        <div className="mbb-code-row">
          <FormInput
            label="Item Code"
            value={draftItem.itemCode}
            onChange={value => onUpdateDraft({ itemCode: value })}
          />
          <button onClick={() => onViewBarcode(draftItem)} type="button">View Barcode</button>
        </div>
        <FormInput label="HSN code" value={draftItem.hsn} onChange={value => onUpdateDraft({ hsn: value })} />
      </div>

      <button className="mbb-hsn-link" type="button">
        Find HSN Code
      </button>

      <div className="mbb-form-grid two stock-grid">
        <label className="mbb-field">
          <span>Measuring Unit</span>
          <div className="mbb-input-select">
            <Search size={18} />
            <input value={draftItem.unit} readOnly />
            <ChevronDown size={19} />
          </div>
        </label>
      </div>

      <button
        className="mbb-link-row"
        onClick={() => onUpdateDraft({ secondaryUnit: draftItem.secondaryUnit && draftItem.secondaryUnit !== "-" ? "-" : "BOX" })}
        type="button"
      >
        <Plus size={18} />
        Alternative Unit
      </button>
      {draftItem.secondaryUnit && draftItem.secondaryUnit !== "-" && (
        <div className="mbb-form-grid two stock-grid">
          <FormInput
            label="Alternative Unit"
            value={draftItem.secondaryUnit}
            onChange={value => onUpdateDraft({ secondaryUnit: value || "-" })}
          />
        </div>
      )}

      <div className="mbb-form-grid two stock-grid">
        <label className="mbb-field">
          <span>Opening Stock</span>
          <div className="mbb-input-suffix">
            <input
              placeholder="ex: 150 PCS"
              value={draftItem.stock ? String(draftItem.stock) : ""}
              onChange={event => onUpdateDraft({ stock: Number(event.target.value) || 0 })}
            />
            <span>PCS</span>
          </div>
        </label>
        <label className="mbb-field">
          <span>As of Date</span>
          <div className="mbb-input-select">
            <CalendarDays size={18} />
            <input value={draftItem.asOfDate} onChange={event => onUpdateDraft({ asOfDate: event.target.value })} />
            <ChevronDown size={19} />
          </div>
        </label>
      </div>

      <button
        className="mbb-link-row"
        onClick={() => onUpdateDraft({ lowStockQuantity: lowStockEnabled ? undefined : Math.max(1, draftItem.stock || 1) })}
        type="button"
      >
        <Plus size={18} />
        {lowStockEnabled ? "Disable Low stock quantity warning" : "Enable Low stock quantity warning"}
        <Info size={16} />
      </button>

      {lowStockEnabled && (
        <label className="mbb-field low-stock-warning-field">
          <span>Low Stock Quantity</span>
          <div className="mbb-input-suffix">
            <input
              min="0"
              type="number"
              value={draftItem.lowStockQuantity ?? ""}
              onChange={event => onUpdateDraft({ lowStockQuantity: Number(event.target.value) || 0 })}
            />
            <span>PCS</span>
          </div>
        </label>
      )}

      <label className="mbb-field full">
        <span>Description</span>
        <textarea
          value={draftItem.description}
          onChange={event => onUpdateDraft({ description: event.target.value })}
          placeholder="Description"
        />
      </label>
    </div>
  );
}

function PricingEditor({ draftItem, onUpdateDraft }: EditorProps) {
  const discountAmount = Math.max(0, draftItem.mrp - draftItem.price);
  const discountPercent = draftItem.mrp > 0 ? (discountAmount / draftItem.mrp) * 100 : 0;

  return (
    <div className="mbb-form-card pricing-card">
      <div className="mbb-form-grid two">
        <PriceInput
          label="Sales Price"
          value={draftItem.price}
          trailing="With Tax"
          onChange={value => onUpdateDraft({ price: value })}
        />
        <PriceInput
          label="Purchase Price"
          value={draftItem.purchasePrice}
          trailing="Without Tax"
          onChange={value => onUpdateDraft({ purchasePrice: value })}
        />
        <PriceInput
          label="Maximum Retail Price (MRP)"
          value={draftItem.mrp}
          onChange={value => onUpdateDraft({ mrp: value })}
          showInfo
        />
        <label className="mbb-field">
          <span>GST Tax Rate(%)</span>
          <div className="mbb-input-select">
            <Search size={18} />
            <input value={`GST @ ${draftItem.gstRate}%`} readOnly />
            <ChevronDown size={19} />
          </div>
        </label>
      </div>

      <div className="mbb-discount-line">
        Disc. on MRP: <strong>{discountPercent.toFixed(2)}%</strong> ({formatMoney(discountAmount, 2)})
      </div>

      <label className="mbb-field discount-field">
        <span>
          Discount on Sales Price
          <Info size={15} />
        </span>
        <div className="mbb-input-suffix">
          <input placeholder="ex: 12" />
          <span>%</span>
        </div>
      </label>
    </div>
  );
}

interface PartyWiseEditorProps {
  draftItem: InventoryItem;
  isCreating: boolean;
  onNotice: (message: string) => void;
  onWorkspaceRefresh: () => Promise<void> | void;
  parties: Party[];
}

function PartyWiseEditor({ draftItem, isCreating, onNotice, onWorkspaceRefresh, parties }: PartyWiseEditorProps) {
  const [partyPrices, setPartyPrices] = useState<ItemPartyPrice[]>([]);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [salesPrice, setSalesPrice] = useState(draftItem.price);
  const [taxInclusive, setTaxInclusive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSalesPrice(draftItem.price);
  }, [draftItem.price]);

  useEffect(() => {
    let mounted = true;
    if (isCreating) {
      setPartyPrices([]);
      return () => {
        mounted = false;
      };
    }

    getItemPartyPrices(draftItem.id)
      .then(rows => {
        if (!mounted) return;
        setPartyPrices(rows);
      })
      .catch(error => {
        if (!mounted) return;
        onNotice(error instanceof Error ? error.message : "Party wise prices could not be loaded.");
      });

    return () => {
      mounted = false;
    };
  }, [draftItem.id, isCreating, onNotice]);

  const handleAdd = async () => {
    if (isCreating) {
      onNotice("Save the item before adding party wise prices.");
      return;
    }
    if (!selectedPartyId) {
      onNotice("Select a party before adding a party wise price.");
      return;
    }
    if (salesPrice <= 0) {
      onNotice("Enter a valid sales price.");
      return;
    }

    try {
      setIsSaving(true);
      const saved = await upsertItemPartyPrice({
        itemId: draftItem.id,
        partyId: selectedPartyId,
        salesPrice,
        taxInclusive
      });
      setPartyPrices(current => {
        const exists = current.some(row => row.id === saved.id || row.partyId === saved.partyId);
        return exists
          ? current.map(row => (row.id === saved.id || row.partyId === saved.partyId ? saved : row))
          : [...current, saved].sort((a, b) => a.partyName.localeCompare(b.partyName));
      });
      setSelectedPartyId("");
      setSalesPrice(draftItem.price);
      onNotice("Party wise item price saved in Postgres.");
      await onWorkspaceRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Party wise price could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrice = async (price: ItemPartyPrice) => {
    if (!window.confirm(`Remove party wise price for ${price.partyName}?`)) {
      return;
    }
    try {
      await deleteItemPartyPrice(price.id);
      setPartyPrices(current => current.filter(row => row.id !== price.id));
      onNotice("Party wise item price removed.");
      await onWorkspaceRefresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Party wise price could not be removed.");
    }
  };

  const availableParties = parties.filter(party => party.id && !partyPrices.some(price => price.partyId === party.id));

  return (
    <div className="mbb-form-card party-card">
      <h3>Add Party Wise Prices</h3>
      <div className="mbb-party-form">
        <label className="mbb-field">
          <span>Select Party</span>
          <div className="mbb-input-select">
            <select
              value={selectedPartyId}
              onChange={event => setSelectedPartyId(event.target.value)}
              disabled={isCreating}
            >
              <option value="">{isCreating ? "Save item first" : "Search Party"}</option>
              {availableParties.map(party => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
            <ChevronDown size={19} />
          </div>
        </label>
        <PriceInput
          label="Sales Price"
          value={salesPrice}
          trailing={taxInclusive ? "With Tax" : "Without Tax"}
          onChange={setSalesPrice}
        />
        <button
          className="mbb-party-add-btn"
          disabled={isCreating || !selectedPartyId || isSaving}
          onClick={handleAdd}
          type="button"
        >
          {isSaving ? "Saving..." : "Add"}
        </button>
      </div>
      <button className="mbb-party-tax-toggle" onClick={() => setTaxInclusive(value => !value)} type="button">
        {taxInclusive ? "With Tax" : "Without Tax"}
        <ChevronDown size={16} />
      </button>

      <table className="mbb-party-table">
        <thead>
          <tr>
            <th>Party Name</th>
            <th>Sales Price</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>All Parties Price</td>
            <td>{formatMoney(draftItem.price)}</td>
            <td />
          </tr>
          {partyPrices.map(price => (
            <tr key={price.id}>
              <td>
                {price.partyName}
                {price.partyMobile && <small className="party-price-mobile"> {price.partyMobile}</small>}
              </td>
              <td>{formatMoney(price.salesPrice)} {price.taxInclusive ? "With Tax" : "Without Tax"}</td>
              <td>
                <button className="party-price-delete" onClick={() => handleDeletePrice(price)} type="button">
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CustomFieldsEditorProps {
  customFields: InventoryItem["customFields"];
  onUpdateCustomField: (field: keyof InventoryItem["customFields"], value: string) => void;
}

function CustomFieldsEditor({ customFields, onUpdateCustomField }: CustomFieldsEditorProps) {
  return (
    <div className="mbb-form-card custom-card">
      <div className="mbb-form-grid two">
        <FormInput
          label="COLOR"
          value={customFields.color}
          placeholder="Enter Value"
          onChange={value => onUpdateCustomField("color", value)}
        />
        <FormInput
          label="CIN / DATE"
          value={customFields.cinDate}
          placeholder="Enter Value"
          onChange={value => onUpdateCustomField("cinDate", value)}
        />
        <FormInput
          label="GRN / DATE"
          value={customFields.grnDate}
          placeholder="Enter Value"
          onChange={value => onUpdateCustomField("grnDate", value)}
        />
        <FormInput
          label="BILL NO"
          value={customFields.billNo}
          placeholder="Enter Value"
          onChange={value => onUpdateCustomField("billNo", value)}
        />
      </div>
      <button className="mbb-link-row" type="button">
        <Plus size={18} />
        Add Item Custom Fields
      </button>
    </div>
  );
}

interface FormInputProps {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

function FormInput({ label, onChange, placeholder, value }: FormInputProps) {
  return (
    <label className="mbb-field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

interface PriceInputProps {
  label: string;
  onChange: (value: number) => void;
  showInfo?: boolean;
  trailing?: string;
  value: number;
}

function PriceInput({ label, onChange, showInfo, trailing, value }: PriceInputProps) {
  return (
    <label className="mbb-field">
      <span>
        {label}
        {showInfo && <Info size={15} />}
      </span>
      <div className="mbb-price-input">
        <span>{RUPEE}</span>
        <input
          value={value ? String(value.toFixed(1)) : ""}
          onChange={event => onChange(Number(event.target.value) || 0)}
        />
        {trailing && (
          <button type="button">
            {trailing}
            <ChevronDown size={16} />
          </button>
        )}
      </div>
    </label>
  );
}

function ItemOfferModal({
  draft,
  inventory,
  isSaving,
  offers,
  onActivate,
  onCancel,
  onDraftChange,
  onPause,
  onSave
}: {
  draft: OfferDraft;
  inventory: InventoryItem[];
  isSaving: boolean;
  offers: ItemOffer[];
  onActivate: (offerId: string) => void;
  onCancel: () => void;
  onDraftChange: (patch: Partial<OfferDraft>) => void;
  onPause: (offerId: string) => void;
  onSave: () => void;
}) {
  const selectedItem = inventory.find(item => item.id === draft.itemId) || inventory[0];
  const basePrice = selectedItem?.price || 0;
  const discount = Math.max(0, Number(draft.discountValue) || 0);
  const previewPrice = draft.discountType === "flat"
    ? Math.max(0, basePrice - discount)
    : Math.max(0, basePrice - (basePrice * discount / 100));
  const itemOffers = offers.filter(offer => offer.itemId === draft.itemId);

  return (
    <div className="sales-register-modal-backdrop">
      <div className="sales-register-modal item-offer-modal">
        <div className="sales-register-modal-header">
          <div>
            <h2>Manage Item Offer</h2>
            <span>{selectedItem?.name || "Select item"}</span>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="item-offer-preview">
          <div>
            <span>Current Price</span>
            <strong>{formatMoney(basePrice)}</strong>
          </div>
          <div>
            <span>Offer Price</span>
            <strong>{formatMoney(previewPrice)}</strong>
          </div>
          <div>
            <span>Discount</span>
            <strong>{draft.discountType === "percent" ? `${discount}%` : formatMoney(discount)}</strong>
          </div>
        </div>

        <div className="sales-register-form-grid item-offer-grid">
          <label className="wide">
            <span>Item</span>
            <select value={draft.itemId} onChange={event => {
              const item = inventory.find(row => row.id === event.target.value);
              onDraftChange({
                itemId: event.target.value,
                title: item ? `${item.name} offer` : draft.title
              });
            }}>
              {inventory.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name} - {item.itemCode || "No code"}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            <span>Offer Title</span>
            <input value={draft.title} onChange={event => onDraftChange({ title: event.target.value })} />
          </label>
          <label>
            <span>Discount Type</span>
            <select value={draft.discountType} onChange={event => onDraftChange({ discountType: event.target.value as ItemOfferDiscountType })}>
              <option value="percent">Percentage</option>
              <option value="flat">Flat Amount</option>
            </select>
          </label>
          <label>
            <span>Discount Value</span>
            <input
              min="0"
              type="number"
              value={draft.discountValue}
              onChange={event => onDraftChange({ discountValue: Number(event.target.value) || 0 })}
            />
          </label>
          <label>
            <span>Starts On</span>
            <input type="date" value={draft.startsOn} onChange={event => onDraftChange({ startsOn: event.target.value })} />
          </label>
          <label>
            <span>Ends On</span>
            <input type="date" value={draft.endsOn} onChange={event => onDraftChange({ endsOn: event.target.value })} />
          </label>
          <label>
            <span>Channel</span>
            <select value={draft.channel} onChange={event => onDraftChange({ channel: event.target.value })}>
              <option value="billing">Billing</option>
              <option value="pos">POS</option>
              <option value="online_store">Online Store</option>
              <option value="all">All Channels</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select value={draft.status} onChange={event => onDraftChange({ status: event.target.value as ItemOfferStatus })}>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="wide">
            <span>Notes</span>
            <textarea value={draft.notes} onChange={event => onDraftChange({ notes: event.target.value })} />
          </label>
        </div>

        {itemOffers.length > 0 && (
          <div className="item-offer-history">
            <strong>Offer History</strong>
            {itemOffers.slice(0, 5).map(offer => (
              <div className="item-offer-history-row" key={offer.id}>
                <div>
                  <span>{offer.title}</span>
                  <small>{formatMoney(offer.offerPrice)} from {formatMoney(offer.sellingPrice)}</small>
                </div>
                <span className={`sales-status-pill sales-register-status ${offer.status}`}>{offer.status}</span>
                {offer.status === "active" ? (
                  <button type="button" disabled={isSaving} onClick={() => onPause(offer.id)}>Pause</button>
                ) : (
                  <button type="button" disabled={isSaving} onClick={() => onActivate(offer.id)}>Activate</button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="sales-register-modal-footer">
          <button type="button" className="mbb-bulk-btn" onClick={onCancel}>Close</button>
          <button type="button" className="mbb-primary-btn" onClick={onSave} disabled={isSaving || !selectedItem}>
            {isSaving ? "Saving..." : "Save Offer"}
          </button>
        </div>
      </div>
    </div>
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
