import type { GodownTransfer, Item, ItemOffer, ItemPartyPrice, StockMovement } from "../types";
import { apiFetch, apiText, formatApiDate } from "./core";

export type BarcodeLabelResult = {
  id: string;
  item: string;
  item_name: string;
  item_code: string;
  barcode_value: string;
  label_size: string;
  copies: number;
  barcode_svg: string;
};

export type BarcodeLabelSize = {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  columns: number;
  gap_mm: number;
  description: string;
};

export type BarcodeLabelPriceSource = "selling" | "mrp" | "none";

export type BarcodeLabelOptions = {
  labelSize?: string;
  copies?: number;
  priceSource?: BarcodeLabelPriceSource;
  includeBusinessName?: boolean;
  includeItemName?: boolean;
  includePrice?: boolean;
  includeMrp?: boolean;
};

function mapItem(data: any): Item {
  return {
    id: data.id,
    name: data.name,
    hsn: data.hsn_code || "",
    categoryId: data.category || "",
    godownId: data.godown || "",
    itemCode: data.item_code || data.barcode || "",
    mrp: Number(data.mrp ?? 0),
    price: Number(data.selling_price ?? 0),
    purchasePrice: Number(data.purchase_price ?? 0),
    stock: Number(data.current_stock ?? data.opening_stock ?? 0),
    lowStockQuantity: data.low_stock_qty === null || data.low_stock_qty === undefined ? undefined : Number(data.low_stock_qty),
    godown: data.godown_details?.name || "-",
    onlineStore: Boolean(data.show_online_store ?? data.onlineStore),
    secondaryUnit: data.secondary_unit || data.secondaryUnit || "-",
    serialisationEnabled: Boolean(data.serialisation_enabled ?? data.serialisationEnabled),
    godownStocks: (data.godown_stocks || data.godownStocks || []).map((stock: any) => ({
      godownId: stock.godown || stock.godownId || "",
      godownName: stock.godown_name || stock.godownName || "-",
      openingStock: Number(stock.opening_stock ?? stock.openingStock ?? 0),
      currentStock: Number(stock.current_stock ?? stock.currentStock ?? 0)
    })),
    category: data.category_details?.name || "-",
    gstRate: Number(data.gst_rate ?? 0),
    color: data.color || "",
    cinDate: data.cin_date || data.cinDate || "",
    grn: data.grn_date || data.grnDate || data.grn || "",
    grnDate: data.grn_date || data.grnDate || data.grn || "",
    billNo: data.bill_no || data.billNo || "",
    description: data.description || "",
    activeOffer: data.active_offer ? mapItemOffer(data.active_offer) : (data.activeOffer ?? null)
  };
}

function mapItemOffer(data: any): ItemOffer {
  return {
    id: data.id,
    itemId: data.item || data.itemId || "",
    itemName: data.item_name || data.itemName || "",
    itemCode: data.item_code || data.itemCode || "",
    title: data.title || "",
    discountType: data.discount_type || data.discountType || "percent",
    discountValue: Number(data.discount_value ?? data.discountValue ?? 0),
    sellingPrice: Number(data.selling_price ?? data.sellingPrice ?? 0),
    offerPrice: Number(data.offer_price ?? data.offerPrice ?? 0),
    startsOn: data.starts_on || data.startsOn || "",
    endsOn: data.ends_on || data.endsOn || "",
    channel: data.channel || "billing",
    status: data.status || "active",
    notes: data.notes || "",
    createdAt: data.created_at || data.createdAt || "",
    updatedAt: data.updated_at || data.updatedAt || ""
  };
}

function mapItemPartyPrice(data: any): ItemPartyPrice {
  return {
    id: data.id,
    itemId: data.item || data.itemId || "",
    partyId: data.party || data.partyId || "",
    partyName: data.party_name || data.partyName || "",
    partyMobile: data.party_mobile || data.partyMobile || "",
    salesPrice: Number(data.sales_price ?? data.salesPrice ?? 0),
    taxInclusive: Boolean(data.tax_inclusive ?? data.taxInclusive ?? true)
  };
}

function mapGodown(data: any) {
  return {
    id: data.id,
    name: data.name,
    location: data.address || data.location || "",
    isDefault: Boolean(data.is_default ?? data.isDefault),
    stockQty: data.stockQty === undefined ? undefined : Number(data.stockQty),
    stockValue: data.stockValue === undefined ? undefined : Number(data.stockValue),
    itemCount: data.itemCount === undefined ? undefined : Number(data.itemCount)
  };
}

function mapGodownTransfer(data: any): GodownTransfer {
  return {
    id: data.id,
    date: formatApiDate(data.transfer_date || data.date || ""),
    itemId: data.item || data.itemId || "",
    itemName: data.item_name || data.itemName || "-",
    fromGodownId: data.from_godown || data.fromGodownId || "",
    fromGodownName: data.from_godown_name || data.fromGodownName || "-",
    toGodownId: data.to_godown || data.toGodownId || "",
    toGodownName: data.to_godown_name || data.toGodownName || "-",
    quantity: Number(data.quantity ?? 0),
    notes: data.notes || ""
  };
}

function mapStockMovement(data: any): StockMovement {
  return {
    id: data.id,
    date: formatApiDate(data.movement_date || data.created_at?.slice(0, 10) || ""),
    itemId: data.item || "",
    itemName: data.item_name || "",
    godownId: data.godown || "",
    godownName: data.godown_name || "-",
    movementType: data.movement_type,
    referenceType: data.reference_type || "",
    referenceId: data.reference_id || "",
    quantity: Number(data.quantity ?? 0),
    rate: Number(data.rate ?? 0),
    balanceAfter: Number(data.balance_after ?? 0),
    notes: data.notes || ""
  };
}

async function resolveItemCategoryId(name: string, existingId?: string) {
  const cleanName = name.trim();
  if (existingId || !cleanName || cleanName === "-") {
    return existingId || null;
  }

  const categories = await apiFetch<any[]>("/items/categories/");
  const match = categories.find(category => category.name.toLowerCase() === cleanName.toLowerCase());
  if (match) {
    return match.id;
  }

  const created = await apiFetch<any>("/items/categories/", {
    method: "POST",
    body: JSON.stringify({ name: cleanName })
  });
  return created.id;
}

function itemPayload(input: Item, categoryId: string | null, includeOpeningStock: boolean) {
  const customFields = input.customFields;
  return {
    name: input.name,
    item_code: input.itemCode || null,
    barcode: input.itemCode || null,
    hsn_code: input.hsn || null,
    category: categoryId,
    unit: "PCS",
    selling_price: input.price,
    purchase_price: input.purchasePrice,
    mrp: input.mrp ?? null,
    gst_rate: input.gstRate,
    low_stock_qty: input.lowStockQuantity ?? null,
    godown: input.godownId || null,
    show_online_store: Boolean(input.onlineStore),
    secondary_unit: input.secondaryUnit && input.secondaryUnit !== "-" ? input.secondaryUnit : null,
    serialisation_enabled: Boolean(input.serialisationEnabled),
    color: customFields?.color ?? input.color ?? "",
    cin_date: customFields?.cinDate ?? input.cinDate ?? "",
    grn_date: customFields?.grnDate ?? input.grnDate ?? input.grn ?? "",
    bill_no: customFields?.billNo ?? input.billNo ?? "",
    description: input.description || "",
    ...(includeOpeningStock ? { opening_stock: input.stock } : {})
  };
}

export async function createItem(input: Item) {
  const categoryId = await resolveItemCategoryId(input.category, input.categoryId);
  const data = await apiFetch<any>("/items/items/", {
    method: "POST",
    body: JSON.stringify(itemPayload(input, categoryId, true))
  });
  return mapItem(data);
}

export async function updateItem(input: Item) {
  const categoryId = await resolveItemCategoryId(input.category, input.categoryId);
  const data = await apiFetch<any>(`/items/items/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(itemPayload(input, categoryId, false))
  });
  return mapItem(data);
}

export async function deleteItem(itemId: string) {
  await apiFetch<Record<string, never>>(`/items/items/${itemId}/`, {
    method: "DELETE"
  });
}

export async function getItemPartyPrices(itemId: string) {
  const query = itemId ? `?item=${encodeURIComponent(itemId)}` : "";
  const data = await apiFetch<any[]>(`/items/party-prices/${query}`);
  return data.map(mapItemPartyPrice);
}

export async function upsertItemPartyPrice(input: {
  itemId: string;
  partyId: string;
  salesPrice: number;
  taxInclusive: boolean;
}) {
  const data = await apiFetch<any>("/items/party-prices/", {
    method: "POST",
    body: JSON.stringify({
      item: input.itemId,
      party: input.partyId,
      sales_price: input.salesPrice,
      tax_inclusive: input.taxInclusive
    })
  });
  return mapItemPartyPrice(data);
}

export async function deleteItemPartyPrice(priceId: string) {
  await apiFetch<Record<string, never>>(`/items/party-prices/${priceId}/`, {
    method: "DELETE"
  });
}

export async function getItemOffers(input: { itemId?: string; status?: string } = {}) {
  const params = new URLSearchParams();
  if (input.itemId) params.set("item", input.itemId);
  if (input.status) params.set("status", input.status);
  const query = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<any[]>(`/items/offers/${query}`);
  return data.map(mapItemOffer);
}

export async function createItemOffer(input: {
  itemId: string;
  title: string;
  discountType: "percent" | "flat";
  discountValue: number;
  startsOn?: string;
  endsOn?: string;
  channel?: string;
  status?: "draft" | "active" | "paused" | "expired";
  notes?: string;
}) {
  const data = await apiFetch<any>("/items/offers/", {
    method: "POST",
    body: JSON.stringify({
      item: input.itemId,
      title: input.title,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      starts_on: input.startsOn || null,
      ends_on: input.endsOn || null,
      channel: input.channel || "billing",
      status: input.status || "active",
      notes: input.notes || ""
    })
  });
  return mapItemOffer(data);
}

export async function updateItemOffer(input: {
  id: string;
  title?: string;
  discountType?: "percent" | "flat";
  discountValue?: number;
  startsOn?: string;
  endsOn?: string;
  channel?: string;
  status?: "draft" | "active" | "paused" | "expired";
  notes?: string;
}) {
  const payload: Record<string, unknown> = {};
  if (input.title !== undefined) payload.title = input.title;
  if (input.discountType !== undefined) payload.discount_type = input.discountType;
  if (input.discountValue !== undefined) payload.discount_value = input.discountValue;
  if (input.startsOn !== undefined) payload.starts_on = input.startsOn || null;
  if (input.endsOn !== undefined) payload.ends_on = input.endsOn || null;
  if (input.channel !== undefined) payload.channel = input.channel;
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) payload.notes = input.notes;

  const data = await apiFetch<any>(`/items/offers/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return mapItemOffer(data);
}

export async function activateItemOffer(offerId: string) {
  const data = await apiFetch<{ offer: any }>(`/items/offers/${offerId}/activate/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapItemOffer(data.offer);
}

export async function pauseItemOffer(offerId: string) {
  const data = await apiFetch<{ offer: any }>(`/items/offers/${offerId}/pause/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapItemOffer(data.offer);
}

export async function adjustItemStock(input: {
  itemId: string;
  quantity: number;
  movementType: "adjustment_in" | "adjustment_out";
  godownId?: string;
  notes: string;
}) {
  const data = await apiFetch<{ current_stock: number }>(`/items/items/${input.itemId}/stock_adjustment/`, {
    method: "POST",
    body: JSON.stringify({
      quantity: input.quantity,
      movement_type: input.movementType,
      godown: input.godownId || null,
      notes: input.notes
    })
  });
  return Number(data.current_stock);
}

export async function createGodown(input: {
  name: string;
  location: string;
}) {
  const data = await apiFetch<any>("/items/godowns/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      address: input.location || null
    })
  });
  return mapGodown(data);
}

export async function updateGodown(input: {
  id: string;
  name: string;
  location: string;
  isDefault?: boolean;
}) {
  const data = await apiFetch<any>(`/items/godowns/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      address: input.location || null,
      is_default: Boolean(input.isDefault)
    })
  });
  return mapGodown(data);
}

export async function setDefaultGodown(godownId: string) {
  const data = await apiFetch<{ godown: any }>(`/items/godowns/${godownId}/set_default/`, {
    method: "POST"
  });
  return mapGodown(data.godown);
}

export async function deleteGodown(godownId: string) {
  await apiFetch<Record<string, never>>(`/items/godowns/${godownId}/`, {
    method: "DELETE"
  });
}

export async function getGodownSummary() {
  const data = await apiFetch<{ godowns: any[] }>("/items/godowns/summary/");
  return data.godowns.map(mapGodown);
}

export async function getStockMovements(itemId?: string) {
  const query = itemId ? `?item=${encodeURIComponent(itemId)}` : "";
  const data = await apiFetch<any[]>(`/items/movements/${query}`);
  return data.map(mapStockMovement);
}

export async function getGodownTransfers(filters: { itemId?: string; godownId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.itemId) params.set("item", filters.itemId);
  if (filters.godownId) params.set("godown", filters.godownId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const data = await apiFetch<any[]>(`/items/transfers/${query}`);
  return data.map(mapGodownTransfer);
}

export async function transferItemStock(input: {
  itemId: string;
  fromGodownId: string;
  toGodownId: string;
  quantity: number;
  notes?: string;
}) {
  return apiFetch<{ message: string }>(`/items/items/${input.itemId}/transfer/`, {
    method: "POST",
    body: JSON.stringify({
      from_godown: input.fromGodownId,
      to_godown: input.toGodownId,
      quantity: input.quantity,
      notes: input.notes || "Godown transfer"
    })
  });
}

const barcodeLabelPayload = (input: BarcodeLabelOptions) => ({
  copies: input.copies ?? 1,
  label_size: input.labelSize ?? "50x25",
  price_source: input.priceSource ?? "selling",
  include_business_name: input.includeBusinessName ?? true,
  include_item_name: input.includeItemName ?? true,
  include_price: input.includePrice ?? true,
  include_mrp: input.includeMrp ?? true
});

export async function getBarcodeLabelSizes() {
  return apiFetch<{ sizes: BarcodeLabelSize[] }>("/items/barcode-labels/label_sizes/");
}

export async function createBarcodeLabel(input: {
  itemId: string;
} & BarcodeLabelOptions) {
  return apiFetch<BarcodeLabelResult>("/items/barcode-labels/", {
    method: "POST",
    body: JSON.stringify({
      item: input.itemId,
      ...barcodeLabelPayload(input)
    })
  });
}

export async function createBulkBarcodeLabels(input: {
  itemIds: string[];
} & BarcodeLabelOptions) {
  return apiFetch<{ labels: BarcodeLabelResult[] }>("/items/barcode-labels/bulk_create/", {
    method: "POST",
    body: JSON.stringify({
      item_ids: input.itemIds,
      ...barcodeLabelPayload(input)
    })
  });
}

export async function getBarcodeLabelPrintHtml(labelIds: string[]) {
  const ids = labelIds.map(encodeURIComponent).join(",");
  return apiText(`/items/barcode-labels/print_sheet/?ids=${ids}`);
}
