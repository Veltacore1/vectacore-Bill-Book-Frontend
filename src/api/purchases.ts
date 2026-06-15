import type { Item, PurchaseRegisterRow } from "../types";
import { apiFetch, apiText, formatApiDate, paymentModeToApi, roundMoney, mapPaymentSettlements, PaymentReceiptDetails } from "./core";

export type PurchaseVoucherLifecycleView =
  | "purchases"
  | "payment-out"
  | "purchase-return"
  | "debit-note"
  | "purchase-orders";

const purchaseVoucherPaths: Record<PurchaseVoucherLifecycleView, string> = {
  purchases: "/purchases/invoices",
  "payment-out": "/payments/payment-out",
  "purchase-return": "/purchases/returns",
  "debit-note": "/purchases/debit-notes",
  "purchase-orders": "/purchases/orders"
};

function purchaseLinePayload(input: { item: Item; quantity: number; amount: number }) {
  const quantity = Math.max(1, Number(input.quantity) || 1);
  const taxable = roundMoney(input.amount);
  const tax = roundMoney(taxable * (input.item.gstRate / 100));
  const total = roundMoney(taxable + tax);

  return {
    item: input.item.id,
    item_name: input.item.name,
    quantity,
    rate: roundMoney(taxable / quantity),
    discount_pct: 0,
    gst_rate: roundMoney(input.item.gstRate),
    taxable_amount: taxable,
    amount: total,
    sort_order: 0
  };
}

export async function createPurchaseInvoice(input: {
  partyId: string;
  item: Item;
  quantity: number;
  amount: number;
  notes: string;
  paymentMode?: string;
  paidAmount?: number;
  supplierInvoiceNumber?: string;
}) {
  const line = purchaseLinePayload(input);
  const taxable = roundMoney(input.amount);
  const total = roundMoney(line.amount);
  const taxTotal = roundMoney(total - taxable);
  const data = await apiFetch<any>("/purchases/invoices/", {
    method: "POST",
    body: JSON.stringify({
      supplier_invoice_number: input.supplierInvoiceNumber || null,
      party: input.partyId,
      subtotal: taxable,
      taxable_amount: taxable,
      cgst_amount: roundMoney(taxTotal / 2),
      sgst_amount: roundMoney(taxTotal / 2),
      igst_amount: 0,
      cess_amount: 0,
      total_amount: total,
      paid_amount: roundMoney(input.paidAmount ?? 0),
      payment_mode: paymentModeToApi(input.paymentMode || "Cash"),
      notes: input.notes || "Created from purchase workspace",
      line_items: [line]
    })
  });
  const firstLine = data.line_items?.[0];

  return {
    id: data.id,
    date: formatApiDate(data.invoice_date),
    number: data.invoice_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: data.due_date ? formatApiDate(data.due_date) : "-",
    itemName: firstLine?.item_name || input.item.name,
    qty: Number(firstLine?.quantity ?? input.quantity),
    amount: Number(data.total_amount),
    paidAmount: Number(data.paid_amount),
    settledAmount: Number(data.paid_amount),
    paymentMode: "-",
    linkedVoucher: data.supplier_invoice_number || "-",
    expectedDate: "-",
    status: String(data.status || "unpaid").replace(/^\w/, char => char.toUpperCase()),
    notes: data.notes || ""
  } satisfies PurchaseRegisterRow;
}

export async function createPurchaseOrder(input: {
  partyId: string;
  item: Item;
  quantity: number;
  amount: number;
  notes: string;
}) {
  const line = purchaseLinePayload(input);
  const orderLine = {
    item: line.item,
    item_name: line.item_name,
    quantity: line.quantity,
    rate: line.rate,
    gst_rate: line.gst_rate,
    amount: line.amount,
    sort_order: line.sort_order
  };
  const data = await apiFetch<any>("/purchases/orders/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      total_amount: line.amount,
      notes: input.notes || "Created from purchase workspace",
      line_items: [orderLine]
    })
  });
  const firstLine = data.line_items?.[0];

  return {
    id: data.id,
    date: formatApiDate(data.order_date),
    number: data.order_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: "-",
    itemName: firstLine?.item_name || input.item.name,
    qty: Number(firstLine?.quantity ?? input.quantity),
    amount: Number(data.total_amount),
    paidAmount: 0,
    settledAmount: 0,
    paymentMode: "-",
    linkedVoucher: "-",
    expectedDate: "-",
    status: String(data.status || "open").replace(/^\w/, char => char.toUpperCase()),
    notes: data.notes || ""
  } satisfies PurchaseRegisterRow;
}

export async function createPurchaseReturn(input: {
  partyId: string;
  item: Item;
  quantity: number;
  amount: number;
  linkedVoucher: string;
  notes: string;
}) {
  const line = purchaseLinePayload(input);
  const data = await apiFetch<any>("/purchases/returns/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      reference_number: input.linkedVoucher || null,
      total_amount: roundMoney(line.amount),
      reason: input.notes || "Created from purchase return workspace",
      line_items: [{
        item: line.item,
        item_name: line.item_name,
        quantity: line.quantity,
        rate: line.rate,
        gst_rate: line.gst_rate,
        taxable_amount: line.taxable_amount,
        amount: line.amount,
        sort_order: line.sort_order
      }]
    })
  });
  const firstLine = data.line_items?.[0];

  return {
    id: data.id,
    date: formatApiDate(data.return_date),
    number: data.return_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: "-",
    itemName: firstLine?.item_name || input.item.name,
    qty: Number(firstLine?.quantity ?? input.quantity),
    amount: Number(data.total_amount),
    paidAmount: 0,
    settledAmount: 0,
    paymentMode: "-",
    linkedVoucher: data.original_invoice_number || data.reference_number || "-",
    expectedDate: "-",
    status: String(data.status || "adjusted").replace(/_/g, " ").replace(/^\w/, char => char.toUpperCase()),
    notes: data.reason || ""
  } satisfies PurchaseRegisterRow;
}

export async function createDebitNote(input: {
  partyId: string;
  amount: number;
  linkedVoucher: string;
  notes: string;
}) {
  const data = await apiFetch<any>("/purchases/debit-notes/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      total_amount: roundMoney(input.amount),
      reason: input.notes || "Created from purchase workspace"
    })
  });

  return {
    id: data.id,
    date: formatApiDate(data.note_date),
    number: data.debit_note_number,
    partyName: "",
    dueIn: "-",
    itemName: "Debit Note",
    qty: 1,
    amount: Number(data.total_amount),
    paidAmount: 0,
    settledAmount: 0,
    paymentMode: "-",
    linkedVoucher: input.linkedVoucher || "-",
    expectedDate: "-",
    status: String(data.status || "unpaid").replace(/^\w/, char => char.toUpperCase()),
    notes: data.reason || ""
  } satisfies PurchaseRegisterRow;
}

export async function convertPurchaseOrder(orderId: string) {
  const data = await apiFetch<{ invoice: any }>(`/purchases/orders/${orderId}/convert_to_invoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return data.invoice;
}

export async function updatePurchaseVoucher(input: {
  view: PurchaseVoucherLifecycleView;
  id: string;
  notes?: string;
  linkedVoucher?: string;
}) {
  const payload: Record<string, unknown> = {};

  if (input.view === "payment-out") {
    payload.notes = input.notes || "";
    payload.reference_number = input.linkedVoucher || null;
  } else if (input.view === "purchase-return") {
    payload.reason = input.notes || "";
    payload.reference_number = input.linkedVoucher || null;
  } else if (input.view === "debit-note") {
    payload.reason = input.notes || "";
  } else if (input.view === "purchases") {
    payload.notes = input.notes || "";
    payload.supplier_invoice_number = input.linkedVoucher || null;
  } else {
    payload.notes = input.notes || "";
  }

  return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function cancelPurchaseVoucher(input: {
  view: PurchaseVoucherLifecycleView;
  id: string;
  reason?: string;
}) {
  if (input.view === "purchases") {
    return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/cancel/`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason || "Cancelled from purchase workspace" })
    });
  }

  if (input.view === "payment-out") {
    return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/void/`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason || "Voided from purchase workspace" })
    });
  }

  return apiFetch<any>(`${purchaseVoucherPaths[input.view]}/${input.id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason: input.reason || "Cancelled from purchase workspace" })
  });
}

export async function getPurchasePaymentReceipt(paymentId: string): Promise<PaymentReceiptDetails> {
  const data = await apiFetch<any>(`${purchaseVoucherPaths["payment-out"]}/${paymentId}/`);
  return {
    settlements: mapPaymentSettlements(data),
    isAdvance: Boolean(data.is_advance),
    status: data.status === "void" ? "Void" : "Paid",
    cancellationReason: data.cancellation_reason || "",
    referenceNumber: data.reference_number || "-",
    notes: data.notes || ""
  };
}

export async function getPurchasePaymentReceiptHtml(paymentId: string) {
  return apiText(`${purchaseVoucherPaths["payment-out"]}/${paymentId}/receipt/?export_format=html`);
}

export async function getPurchasePaymentReceiptShareText(paymentId: string) {
  return apiText(`${purchaseVoucherPaths["payment-out"]}/${paymentId}/receipt/?export_format=text`);
}
