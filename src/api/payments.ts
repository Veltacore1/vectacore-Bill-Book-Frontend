import type { PaymentGatewayOrder } from "../types";
import { apiFetch, roundMoney, paymentModeToApi, paymentModeFromApi, mapPaymentSettlements, mapSalesRegisterRow, SalesRegisterInput, formatApiDate } from "./core";

function mapPaymentGatewayOrder(data: any): PaymentGatewayOrder {
  return {
    id: data.id,
    provider: data.provider || "",
    providerOrderId: data.provider_order_id || "",
    providerPaymentId: data.provider_payment_id || "",
    providerStatus: data.provider_status || "",
    receipt: data.receipt || "",
    amount: Number(data.amount ?? 0),
    amountSubunits: Number(data.amount_subunits ?? 0),
    currency: data.currency || "INR",
    status: data.status || "created",
    signatureVerified: Boolean(data.signature_verified),
    partyId: data.party || "",
    partyName: data.party_name || "",
    invoiceId: data.invoice || "",
    invoiceNumber: data.invoice_number || "",
    paymentInId: data.payment_in || "",
    paymentNumber: data.payment_number || "",
    createdAt: data.created_at || "",
    updatedAt: data.updated_at || "",
    paidAt: data.paid_at || ""
  };
}

export async function createPaymentGatewayOrder(input: {
  partyId: string;
  invoiceId?: string;
  amount: number;
  notes?: Record<string, string>;
}) {
  const data = await apiFetch<any>("/payments/gateway/orders/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      invoice: input.invoiceId || null,
      amount: roundMoney(input.amount),
      notes: input.notes || {}
    })
  });
  return {
    order: mapPaymentGatewayOrder(data.order),
    checkout: data.checkout as {
      keyId: string;
      providerOrderId: string;
      amountSubunits: number;
      currency: string;
      businessName: string;
      customerName: string;
    }
  };
}

export async function createPaymentIn(input: SalesRegisterInput) {
  const data = await apiFetch<any>("/payments/payment-in/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      amount_received: roundMoney(input.amount),
      payment_mode: paymentModeToApi(input.paymentMode || "Cash"),
      reference_number: input.linkedVoucher || null,
      settlement_allocations: input.settlementInvoiceId
        ? [{ invoice: input.settlementInvoiceId, settled_amount: roundMoney(input.amount) }]
        : undefined,
      notes: input.notes || "Created from sales register workspace"
    })
  });
  const amount = Number(data.amount_received ?? input.amount);
  const settlements = mapPaymentSettlements(data);
  const settledAmount = settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0);

  return mapSalesRegisterRow(data, input, {
    dateField: "payment_date",
    numberField: "payment_number",
    itemName: "Customer Payment Receipt",
    linkedVoucher: data.reference_number || input.linkedVoucher || "-",
    validTill: "-",
    status: data.status === "void" ? "Void" : "Received",
    paymentMode: paymentModeFromApi(data.payment_mode),
    settledAmount,
    receivedAmount: amount,
    settlements,
    isAdvance: Boolean(data.is_advance),
    cancellationReason: data.cancellation_reason || ""
  });
}

export async function createPaymentOut(input: {
  partyId: string;
  amount: number;
  paymentMode: string;
  linkedVoucher: string;
  settlementInvoiceId?: string;
  notes: string;
}) {
  const data = await apiFetch<any>("/payments/payment-out/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId,
      amount_paid: roundMoney(input.amount),
      payment_mode: paymentModeToApi(input.paymentMode),
      reference_number: input.linkedVoucher || null,
      settlement_allocations: input.settlementInvoiceId
        ? [{ invoice: input.settlementInvoiceId, settled_amount: roundMoney(input.amount) }]
        : undefined,
      notes: input.notes || "Created from purchase workspace"
    })
  });
  const settlements = mapPaymentSettlements(data);
  const amountPaid = Number(data.amount_paid);

  return {
    id: data.id,
    date: formatApiDate(data.payment_date),
    number: data.payment_number,
    partyName: String(data.party_name || "").toUpperCase(),
    dueIn: "-",
    itemName: "Supplier Payment Settlement",
    qty: 1,
    amount: amountPaid,
    paidAmount: amountPaid,
    settledAmount: settlements.reduce((sum, settlement) => sum + settlement.settledAmount, 0),
    paymentMode: paymentModeFromApi(data.payment_mode),
    linkedVoucher: data.reference_number || "-",
    expectedDate: "-",
    status: data.status === "void" ? "Void" : "Paid",
    notes: data.notes || "",
    settlements,
    isAdvance: Boolean(data.is_advance),
    cancellationReason: data.cancellation_reason || ""
  };
}
