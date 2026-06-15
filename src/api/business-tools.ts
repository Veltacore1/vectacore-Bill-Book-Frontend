import type { OnlineOrder, SMSCampaign } from "../types";
import { apiFetch, formatApiDate, formatApiDateTime } from "./core";

function mapOnlineOrder(data: any): OnlineOrder {
  return {
    id: data.id,
    orderNumber: data.order_number || data.orderNumber,
    orderDate: formatApiDate(data.order_date || data.orderDate),
    customerName: data.customer_name || data.customerName || "",
    customerMobile: data.customer_mobile || data.customerMobile || "-",
    customerEmail: data.customer_email || data.customerEmail || "",
    partyId: data.party || data.partyId || "",
    itemId: data.item || data.itemId || "",
    itemName: data.item_name || data.itemName || "",
    itemCode: data.item_code || data.itemCode || "",
    quantity: Number(data.quantity ?? 0),
    unitPrice: Number(data.unit_price ?? data.unitPrice ?? 0),
    taxableAmount: Number(data.taxable_amount ?? data.taxableAmount ?? 0),
    taxAmount: Number(data.tax_amount ?? data.taxAmount ?? 0),
    totalAmount: Number(data.total_amount ?? data.totalAmount ?? 0),
    paymentStatus: data.payment_status || data.paymentStatus || "pending",
    dispatchStatus: data.dispatch_status || data.dispatchStatus || "new",
    source: data.source || "online_store",
    shippingProvider: data.shipping_provider || data.shippingProvider || "",
    shippingStatus: data.shipping_status || data.shippingStatus || "not_created",
    shiprocketOrderId: data.shiprocket_order_id || data.shiprocketOrderId || "",
    shiprocketShipmentId: data.shiprocket_shipment_id || data.shiprocketShipmentId || "",
    shiprocketAwbCode: data.shiprocket_awb_code || data.shiprocketAwbCode || "",
    shiprocketCourierName: data.shiprocket_courier_name || data.shiprocketCourierName || "",
    shippingLabelUrl: data.shipping_label_url || data.shippingLabelUrl || "",
    trackingUrl: data.tracking_url || data.trackingUrl || "",
    stockDeducted: Boolean(data.stock_deducted ?? data.stockDeducted),
    deliveryAddress: data.delivery_address || data.deliveryAddress || "",
    deliveryCity: data.delivery_city || data.deliveryCity || "",
    deliveryState: data.delivery_state || data.deliveryState || "",
    deliveryPincode: data.delivery_pincode || data.deliveryPincode || "",
    notes: data.notes || "",
    currentStock: Number(data.current_stock ?? data.currentStock ?? 0)
  };
}

export async function createOnlineOrder(input: {
  partyId: string;
  itemId: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  deliveryAddress: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPincode?: string;
  quantity: number;
  paymentStatus: "pending" | "paid" | "cod";
  source: "online_store" | "whatsapp" | "manual";
  notes: string;
}) {
  const data = await apiFetch<any>("/business-tools/online-orders/", {
    method: "POST",
    body: JSON.stringify({
      party: input.partyId || null,
      item: input.itemId,
      customer_name: input.customerName,
      customer_mobile: input.customerMobile || null,
      customer_email: input.customerEmail || null,
      delivery_address: input.deliveryAddress || null,
      delivery_city: input.deliveryCity || null,
      delivery_state: input.deliveryState || null,
      delivery_pincode: input.deliveryPincode || null,
      quantity: input.quantity,
      payment_status: input.paymentStatus,
      source: input.source,
      notes: input.notes || "Created from online orders workspace"
    })
  });
  return mapOnlineOrder(data);
}

export async function createOnlineOrderShipment(orderId: string) {
  const data = await apiFetch<{ order: any }>(`/business-tools/online-orders/${orderId}/create_shipment/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapOnlineOrder(data.order);
}

export async function syncOnlineOrderShipping(orderId: string) {
  const data = await apiFetch<{ order: any }>(`/business-tools/online-orders/${orderId}/sync_shipping/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return mapOnlineOrder(data.order);
}

export async function updateOnlineOrderStatus(input: {
  orderId: string;
  dispatchStatus?: OnlineOrder["dispatchStatus"];
  paymentStatus?: OnlineOrder["paymentStatus"];
}) {
  const data = await apiFetch<{ order: any }>(`/business-tools/online-orders/${input.orderId}/set_status/`, {
    method: "POST",
    body: JSON.stringify({
      dispatch_status: input.dispatchStatus,
      payment_status: input.paymentStatus
    })
  });
  return mapOnlineOrder(data.order);
}

function mapSmsCampaign(data: any): SMSCampaign {
  const recipients = (data.recipients || []).map((recipient: any) => ({
    id: recipient.id,
    partyId: recipient.party || recipient.partyId || "",
    partyName: recipient.party_name || recipient.partyName || "",
    mobile: recipient.mobile || "",
    status: recipient.status || "queued",
    provider: recipient.provider || "",
    providerMessageId: recipient.provider_message_id || recipient.providerMessageId || "",
    sentAt: formatApiDateTime(recipient.sent_at || recipient.sentAt || ""),
    deliveredAt: formatApiDateTime(recipient.delivered_at || recipient.deliveredAt || ""),
    errorMessage: recipient.error_message || recipient.errorMessage || "",
    createdAt: formatApiDateTime(recipient.created_at || recipient.createdAt || "")
  }));
  return {
    id: data.id,
    campaignNumber: data.campaign_number || data.campaignNumber,
    name: data.name || "",
    templateId: data.template || data.templateId || "",
    templateName: data.template_name || data.templateName || "-",
    audience: data.audience || "all_customers",
    message: data.message || "",
    recipientCount: Number(data.recipient_count ?? data.recipientCount ?? 0),
    deliveredCount: Number(data.delivered_count ?? data.deliveredCount ?? 0),
    failedCount: Number(data.failed_count ?? data.failedCount ?? 0),
    creditCost: Number(data.credit_cost ?? data.creditCost ?? 0),
    status: data.status || "draft",
    queuedAt: formatApiDate((data.queued_at || data.queuedAt || "").slice(0, 10)),
    completedAt: formatApiDate((data.completed_at || data.completedAt || "").slice(0, 10)),
    createdAt: formatApiDate((data.created_at || data.createdAt || "").slice(0, 10)),
    recipients
  };
}

export async function createSmsCampaign(input: {
  name: string;
  templateId: string;
  audience: "all_customers" | "manual";
  message: string;
  partyIds: string[];
  sendNow: boolean;
}) {
  const data = await apiFetch<any>("/business-tools/sms-campaigns/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      template: input.templateId || null,
      audience: input.audience,
      message: input.message,
      party_ids: input.partyIds,
      send_now: input.sendNow
    })
  });
  return mapSmsCampaign(data);
}

export async function syncSmsCampaignDelivery(campaignId: string) {
  const data = await apiFetch<{ campaign: any; message?: string }>(`/business-tools/sms-campaigns/${campaignId}/sync_delivery/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    campaign: mapSmsCampaign(data.campaign),
    message: data.message || ""
  };
}

export async function queueSmsCampaign(campaignId: string) {
  const data = await apiFetch<{ campaign: any; message?: string }>(`/business-tools/sms-campaigns/${campaignId}/queue/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    campaign: mapSmsCampaign(data.campaign),
    message: data.message || ""
  };
}

export async function cancelSmsCampaign(campaignId: string) {
  const data = await apiFetch<{ campaign: any; message?: string }>(`/business-tools/sms-campaigns/${campaignId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return {
    campaign: mapSmsCampaign(data.campaign),
    message: data.message || ""
  };
}
