import type { EInvoiceLog, EInvoiceRecord, InvoiceItem, SalesInvoice } from "../types";
import { apiFetch, apiText, apiBlob, formatApiDate, roundMoney, paymentModeToApi, parseDisplayDateForApi, mapPaymentSettlements, mapSalesRegisterRow, SalesRegisterInput, salesRegisterLinePayload, PaymentReceiptDetails } from "./core";

export type InvoicePrintTemplate = "a4" | "thermal";

export type SalesVoucherLifecycleView =
  | "quotation"
  | "payment-in"
  | "sales-return"
  | "credit-note"
  | "delivery-challan"
  | "proforma-invoice";

export type ConvertedSalesInvoiceResult = {
  id: string;
  invoiceNumber: string;
  date: string;
  partyName: string;
  total: number;
  status: string;
};

const salesVoucherPaths: Record<SalesVoucherLifecycleView, string> = {
  quotation: "/sales/quotations",
  "payment-in": "/payments/payment-in",
  "sales-return": "/sales/sales-returns",
  "credit-note": "/sales/credit-notes",
  "delivery-challan": "/sales/challans",
  "proforma-invoice": "/sales/proforma-invoices"
};

function mapInvoiceLineItem(data: any, fallbackLines: InvoiceItem[] = []): InvoiceItem {
  const fallbackLine = fallbackLines.find(line => String(line.item.id) === String(data.item || ""));
  const item = fallbackLine?.item ?? {
    id: String(data.item || ""),
    name: data.item_name || "Invoice item",
    hsn: data.hsn_code || "",
    itemCode: data.item_code || "",
    mrp: data.mrp === null || data.mrp === undefined ? undefined : Number(data.mrp),
    price: Number(data.rate ?? 0),
    purchasePrice: 0,
    stock: 0,
    godown: "",
    category: "",
    gstRate: Number(data.gst_rate ?? 0),
    color: data.color || "",
    grn: data.grn_no || ""
  };

  return {
    item,
    quantity: Number(data.quantity ?? fallbackLine?.quantity ?? 0),
    freeQuantity: Number(data.free_quantity ?? fallbackLine?.freeQuantity ?? 0),
    rate: Number(data.rate ?? fallbackLine?.rate ?? 0),
    discountPct: Number(data.discount_pct ?? fallbackLine?.discountPct ?? 0)
  };
}

function mapSalesInvoice(data: any, fallbackLines: InvoiceItem[] = [], fallbackPaymentMode = "cash"): SalesInvoice {
  const lineItems = Array.isArray(data.line_items) && data.line_items.length
    ? data.line_items.map((line: any) => mapInvoiceLineItem(line, fallbackLines))
    : fallbackLines;

  return {
    id: data.id,
    invoiceNumber: data.invoice_number,
    party: {
      id: data.party,
      name: data.party_name,
      mobile: data.party_mobile || "-",
      type: "customer",
      balance: 0
    },
    date: formatApiDate(data.invoice_date),
    items: lineItems,
    subtotal: Number(data.subtotal ?? 0),
    total: Number(data.total_amount ?? 0),
    paidAmount: Number(data.paid_amount ?? 0),
    paymentMode: fallbackPaymentMode,
    status: data.status || "unpaid",
    irn: data.irn || "",
    ackNumber: data.ack_number || "",
    ackDate: data.ack_date || "",
    qrCodeData: data.qr_code_data || "",
    eInvoiceStatus: data.einvoice_status || "pending",
    eInvoiceProvider: data.einvoice_provider || "",
    eInvoiceRetryCount: Number(data.einvoice_retry_count ?? 0),
    eInvoiceLastError: data.einvoice_last_error || "",
    eInvoiceCancelReason: data.einvoice_cancel_reason || "",
    eInvoiceCancelledAt: data.einvoice_cancelled_at || ""
  };
}

export async function createSalesInvoice(input: {
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
}) {
  const lineItems = input.items.map((line, index) => {
    const gross = roundMoney(line.rate * line.quantity);
    const discountAmount = roundMoney(gross * ((line.discountPct || 0) / 100));
    const taxable = roundMoney(Math.max(0, gross - discountAmount));
    const tax = roundMoney(taxable * (line.item.gstRate / 100));
    const amount = roundMoney(taxable + tax);
    return {
      item: line.item.id,
      item_name: line.item.name,
      item_code: line.item.itemCode || "",
      hsn_code: line.item.hsn,
      unit: "PCS",
      quantity: line.quantity,
      free_quantity: line.freeQuantity,
      mrp: line.item.mrp ?? line.rate,
      rate: line.rate,
      discount_pct: line.discountPct,
      discount_amount: discountAmount,
      gst_rate: line.item.gstRate,
      taxable_amount: taxable,
      tax_amount: tax,
      amount,
      sort_order: index
    };
  });
  const subtotal = roundMoney(input.subtotal);
  const total = roundMoney(input.total);
  const discountAmount = roundMoney(input.discountAmount || 0);
  const additionalCharge = roundMoney(input.additionalCharge || 0);
  const taxableAmount = roundMoney(Math.max(0, subtotal - discountAmount));
  const taxTotal = roundMoney(input.taxAmount ?? Math.max(0, total - taxableAmount - additionalCharge));

  const data = await apiFetch<any>("/sales/invoices/", {
    method: "POST",
    body: JSON.stringify({
      ...(input.partyId ? { party: input.partyId } : {}),
      subtotal,
      discount_amount: discountAmount,
      discount_pct: subtotal > 0 ? roundMoney((discountAmount / subtotal) * 100) : 0,
      taxable_amount: taxableAmount,
      cgst_amount: roundMoney(taxTotal / 2),
      sgst_amount: roundMoney(taxTotal / 2),
      igst_amount: 0,
      cess_amount: 0,
      additional_charges: additionalCharge,
      additional_charges_label: input.additionalChargeLabel || "",
      total_amount: total,
      paid_amount: roundMoney(input.paidAmount),
      payment_mode: paymentModeToApi(input.paymentMode),
      place_of_supply: "Tamil Nadu",
      notes: input.isPos ? "Created from POS billing" : "Created from sales invoice workspace",
      is_pos: Boolean(input.isPos),
      line_items: lineItems
    })
  });

  return mapSalesInvoice(data, input.items, input.paymentMode);
}

export async function getSalesInvoicePrintHtml(invoiceId: string, template: InvoicePrintTemplate = "a4") {
  return apiText(`/sales/invoices/${encodeURIComponent(invoiceId)}/print_pdf/?template=${encodeURIComponent(template)}`);
}

export async function cancelSalesInvoice(invoiceId: string, reason = "Cancelled from sales invoice workspace") {
  const data = await apiFetch<{ message: string; invoice: any }>(`/sales/invoices/${encodeURIComponent(invoiceId)}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return {
    message: data.message,
    invoice: mapSalesInvoice(data.invoice)
  };
}

export async function createQuotation(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/quotations/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      valid_till: parseDisplayDateForApi(input.validTill),
      subtotal: roundMoney(input.amount),
      total_amount: roundMoney(input.amount),
      notes: input.notes || "Created from sales register workspace",
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "quotation_date",
    numberField: "quotation_number",
    linkedVoucher: data.converted_invoice ? String(data.converted_invoice) : "-",
    validTill: formatApiDate(data.valid_till)
  });
}

export async function createDeliveryChallan(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/challans/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      total_amount: roundMoney(input.amount),
      notes: input.notes || "Created from sales register workspace",
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "challan_date",
    numberField: "challan_number",
    linkedVoucher: data.converted_invoice ? String(data.converted_invoice) : "-",
    validTill: "-"
  });
}

export async function createProformaInvoice(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/proforma-invoices/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      valid_till: parseDisplayDateForApi(input.validTill),
      total_amount: roundMoney(input.amount),
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "proforma_date",
    numberField: "proforma_number",
    linkedVoucher: data.converted_invoice ? String(data.converted_invoice) : "-",
    validTill: formatApiDate(data.valid_till),
    notesField: "notes"
  });
}

export async function createSalesReturn(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/sales-returns/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      total_amount: roundMoney(input.amount),
      reason: input.notes || input.linkedVoucher || "Created from sales register workspace",
      line_items: [salesRegisterLinePayload(input)]
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "return_date",
    numberField: "return_number",
    linkedVoucher: data.original_invoice_number || input.linkedVoucher || "-",
    validTill: "-",
    notesField: "reason"
  });
}

export async function createCreditNote(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/sales/credit-notes/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      original_invoice: null,
      total_amount: roundMoney(input.amount),
      reason: input.notes || input.linkedVoucher || "Created from sales register workspace"
    })
  });

  return mapSalesRegisterRow(data, input, {
    dateField: "note_date",
    numberField: "credit_note_number",
    itemName: "Credit Adjustment",
    linkedVoucher: input.linkedVoucher || "-",
    validTill: "-",
    notesField: "reason"
  });
}

export async function updateSalesVoucher(input: {
  view: SalesVoucherLifecycleView;
  id: string;
  notes?: string;
  linkedVoucher?: string;
  validTill?: string;
}) {
  const payload: Record<string, unknown> = {};

  if (input.view === "payment-in") {
    payload.notes = input.notes || "";
    payload.reference_number = input.linkedVoucher || null;
  } else if (input.view === "sales-return" || input.view === "credit-note") {
    payload.reason = input.notes || "";
  } else if (input.view === "proforma-invoice") {
    payload.valid_till = parseDisplayDateForApi(input.validTill);
  } else {
    payload.notes = input.notes || "";
    if (input.view === "quotation") {
      payload.valid_till = parseDisplayDateForApi(input.validTill);
    }
  }

  return apiFetch<any>(`${salesVoucherPaths[input.view]}/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function cancelSalesVoucher(input: {
  view: SalesVoucherLifecycleView;
  id: string;
  reason?: string;
}) {
  if (input.view === "payment-in") {
    return apiFetch<any>(`${salesVoucherPaths[input.view]}/${input.id}/void/`, {
      method: "POST",
      body: JSON.stringify({ reason: input.reason || "Voided from register workspace" })
    });
  }

  return apiFetch<any>(`${salesVoucherPaths[input.view]}/${input.id}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason: input.reason || "Cancelled from register workspace" })
  });
}

export async function getSalesPaymentReceipt(paymentId: string): Promise<PaymentReceiptDetails> {
  const data = await apiFetch<any>(`${salesVoucherPaths["payment-in"]}/${paymentId}/`);
  return {
    settlements: mapPaymentSettlements(data),
    isAdvance: Boolean(data.is_advance),
    status: data.status === "void" ? "Void" : "Received",
    cancellationReason: data.cancellation_reason || "",
    referenceNumber: data.reference_number || "-",
    notes: data.notes || ""
  };
}

export async function getSalesPaymentReceiptHtml(paymentId: string) {
  return apiText(`${salesVoucherPaths["payment-in"]}/${paymentId}/receipt/?export_format=html`);
}

export async function getSalesPaymentReceiptShareText(paymentId: string) {
  return apiText(`${salesVoucherPaths["payment-in"]}/${paymentId}/receipt/?export_format=text`);
}

function mapConvertedSalesInvoice(data: any): ConvertedSalesInvoiceResult {
  const invoice = data.invoice || data;
  if (!invoice?.id) {
    throw new Error(data.message || "The voucher was not converted because the invoice response was incomplete.");
  }
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number || invoice.invoiceNumber || "-",
    date: formatApiDate(invoice.invoice_date || invoice.date || ""),
    partyName: String(invoice.party_name || invoice.party?.name || "").toUpperCase(),
    total: Number(invoice.total_amount ?? invoice.total ?? 0),
    status: String(invoice.status || "unpaid").replace(/^\w/, char => char.toUpperCase())
  };
}

export async function convertSalesVoucherToInvoice(view: SalesVoucherLifecycleView, id: string) {
  if (view !== "quotation" && view !== "delivery-challan" && view !== "proforma-invoice") {
    throw new Error("This voucher cannot be converted to an invoice.");
  }

  const data = await apiFetch<{ invoice: any }>(`${salesVoucherPaths[view]}/${id}/convert_to_invoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapConvertedSalesInvoice(data);
}

function mapEInvoiceLog(data: any): EInvoiceLog {
  return {
    id: data.id,
    event: data.event,
    status: data.status,
    provider: data.provider,
    message: data.message || "",
    createdAt: data.created_at || "",
    createdByName: data.created_by_name || ""
  };
}

function mapEInvoiceRecord(data: any): EInvoiceRecord {
  return {
    id: data.id,
    invoiceNumber: data.invoice_number || "-",
    partyName: data.party_name || "-",
    partyGstin: data.party_gstin || "",
    invoiceDate: formatApiDate(data.invoice_date || ""),
    totalAmount: Number(data.total_amount ?? 0),
    invoiceStatus: data.invoice_status || "-",
    irn: data.irn || "",
    ackNumber: data.ack_number || "",
    ackDate: data.ack_date || "",
    qrCodeData: data.qr_code_data || "",
    eInvoiceStatus: data.einvoice_status || "pending",
    eInvoiceProvider: data.einvoice_provider || "",
    eInvoiceRetryCount: Number(data.einvoice_retry_count ?? 0),
    eInvoiceLastError: data.einvoice_last_error || "",
    eInvoiceCancelReason: data.einvoice_cancel_reason || "",
    eInvoiceCancelledAt: data.einvoice_cancelled_at || "",
    logs: (data.logs || []).map(mapEInvoiceLog)
  };
}

export async function triggerEInvoice(invoiceId: string) {
  const data = await apiFetch<{ irn: string; qr_code_data: string; message: string; invoice: any }>(`/sales/invoices/${invoiceId}/trigger_einvoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    irn: data.irn,
    qrCodeData: data.qr_code_data,
    message: data.message,
    invoice: mapEInvoiceRecord(data.invoice)
  };
}

export async function getEInvoiceRegister(status?: string) {
  const query = status && status !== "all" ? `?einvoice_status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<{ invoices: any[] }>(`/sales/invoices/einvoice_register/${query}`);
  return (data.invoices || []).map(mapEInvoiceRecord);
}

export async function retryEInvoice(invoiceId: string) {
  const data = await apiFetch<{ message: string; invoice: any }>(`/sales/invoices/${invoiceId}/retry_einvoice/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return { message: data.message, invoice: mapEInvoiceRecord(data.invoice) };
}

export async function cancelEInvoice(invoiceId: string, reason: string) {
  const data = await apiFetch<{ message: string; invoice: any }>(`/sales/invoices/${invoiceId}/cancel_einvoice/`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  return { message: data.message, invoice: mapEInvoiceRecord(data.invoice) };
}

export async function getEInvoiceLogs(invoiceId: string) {
  const data = await apiFetch<{ logs: any[] }>(`/sales/invoices/${invoiceId}/einvoice_logs/`);
  return (data.logs || []).map(mapEInvoiceLog);
}

export async function getEInvoiceQrImage(invoiceId: string) {
  const { blob } = await apiBlob(`/sales/invoices/${invoiceId}/einvoice_qr/`);
  return blob;
}
