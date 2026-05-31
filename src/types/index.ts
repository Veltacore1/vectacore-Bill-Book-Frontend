export interface Business {
  id?: string;
  name: string;
  gstin: string;
  prefix: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  email?: string;
}

export type UserRole = "admin" | "partner" | "salesman" | "accountant" | "stock_manager";

export interface ModulePermission {
  view: boolean;
  create: boolean;
  manage: boolean;
}

export type ModulePermissions = Record<string, ModulePermission>;

export type ModulePermissionAction = keyof ModulePermission;

export type PermissionModuleKey =
  | "dashboard"
  | "business"
  | "users"
  | "parties"
  | "items"
  | "stock"
  | "sales"
  | "purchases"
  | "payments"
  | "accounting"
  | "staff"
  | "settings"
  | "business_tools"
  | "reports"
  | "audit";

const USER_ROLE_KEYS: UserRole[] = ["admin", "partner", "salesman", "accountant", "stock_manager"];

const MODULE_ROLE_ACCESS: Record<PermissionModuleKey, Record<ModulePermissionAction, UserRole[]>> = {
  dashboard: {
    view: USER_ROLE_KEYS,
    create: [],
    manage: []
  },
  business: {
    view: ["admin", "partner", "accountant"],
    create: ["admin"],
    manage: ["admin", "partner"]
  },
  users: {
    view: ["admin", "partner"],
    create: ["admin"],
    manage: ["admin"]
  },
  parties: {
    view: ["admin", "partner", "salesman", "accountant"],
    create: ["admin", "partner", "salesman", "accountant"],
    manage: ["admin", "partner", "accountant"]
  },
  items: {
    view: USER_ROLE_KEYS,
    create: ["admin", "partner", "stock_manager"],
    manage: ["admin", "partner", "stock_manager"]
  },
  stock: {
    view: USER_ROLE_KEYS,
    create: ["admin", "partner", "stock_manager"],
    manage: ["admin", "partner", "stock_manager"]
  },
  sales: {
    view: ["admin", "partner", "salesman", "accountant"],
    create: ["admin", "partner", "salesman"],
    manage: ["admin", "partner"]
  },
  purchases: {
    view: ["admin", "partner", "accountant", "stock_manager"],
    create: ["admin", "partner", "accountant"],
    manage: ["admin", "partner", "accountant"]
  },
  payments: {
    view: ["admin", "partner", "salesman", "accountant"],
    create: ["admin", "partner", "salesman", "accountant"],
    manage: ["admin", "partner", "accountant"]
  },
  accounting: {
    view: ["admin", "partner", "accountant"],
    create: ["admin", "partner", "accountant"],
    manage: ["admin", "partner", "accountant"]
  },
  staff: {
    view: ["admin", "partner", "accountant"],
    create: ["admin", "partner", "accountant"],
    manage: ["admin", "partner", "accountant"]
  },
  settings: {
    view: ["admin", "partner", "accountant"],
    create: ["admin", "partner"],
    manage: ["admin", "partner"]
  },
  business_tools: {
    view: USER_ROLE_KEYS,
    create: ["admin", "partner", "salesman", "stock_manager"],
    manage: ["admin", "partner", "salesman", "stock_manager"]
  },
  reports: {
    view: ["admin", "partner", "accountant"],
    create: [],
    manage: []
  },
  audit: {
    view: ["admin", "partner", "accountant"],
    create: [],
    manage: []
  }
};

const emptyPermission: ModulePermission = { view: false, create: false, manage: false };

const normalizeRole = (role?: string): UserRole =>
  USER_ROLE_KEYS.includes(role as UserRole) ? (role as UserRole) : "admin";

export function roleModulePermissions(role?: string): ModulePermissions {
  const normalizedRole = normalizeRole(role);

  return Object.fromEntries(
    Object.entries(MODULE_ROLE_ACCESS).map(([moduleKey, access]) => {
      const create = access.create.includes(normalizedRole);
      const manage = access.manage.includes(normalizedRole);
      return [
        moduleKey,
        {
          view: access.view.includes(normalizedRole) || create || manage,
          create,
          manage
        }
      ];
    })
  );
}

export function getModulePermission(
  modulePermissions: ModulePermissions | undefined | null,
  moduleKey: string,
  fallbackRole?: string
): ModulePermission {
  return modulePermissions?.[moduleKey] ?? roleModulePermissions(fallbackRole)[moduleKey] ?? emptyPermission;
}

export function canUseModule(
  modulePermissions: ModulePermissions | undefined | null,
  moduleKey: string,
  action: ModulePermissionAction = "view",
  fallbackRole?: string
) {
  return getModulePermission(modulePermissions, moduleKey, fallbackRole)[action];
}

export interface ActivityFeedItem {
  id: string;
  date: string;
  actor: string;
  action: string;
  module: string;
  entityId: string;
  details: Record<string, unknown>;
}

export interface Party {
  id: string;
  name: string;
  mobile: string;
  type: "customer" | "supplier";
  balance: number; // Positive = Receivable (To Collect), Negative = Payable (To Pay)
  opening_balance_type?: "debit" | "credit";
  state?: string;
  category?: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  pincode?: string;
  creditLimit?: number;
  creditDays?: number;
  sharedLedgerToken?: string;
}

export interface PartyLedgerEntry {
  date: string;
  type: string;
  number: string;
  description: string;
  debit: number;
  credit: number;
  amount?: number;
  status?: string;
  balance: number;
}

export interface SharedLedgerRow {
  id: string;
  partyId: string;
  partyName: string;
  token: string;
  url: string;
  date: string;
  transactionType: string;
  transactionNumber: string;
  amount: number;
  status: string;
  balance: number;
}

export interface SharedLedgerPortalData {
  business: Business;
  party: Party;
  ledger: PartyLedgerEntry[];
  summary: {
    entries: number;
    currentBalance: number;
    toCollect: number;
    toPay: number;
    viewOnlyMode: boolean;
  };
}

export interface Item {
  id: string;
  name: string;
  hsn: string;
  categoryId?: string;
  godownId?: string;
  itemCode?: string;
  mrp?: number;
  price: number;
  purchasePrice: number;
  stock: number;
  lowStockQuantity?: number;
  godown: string;
  godownStocks?: Array<{
    godownId: string;
    godownName: string;
    openingStock: number;
    currentStock: number;
  }>;
  category: string;
  gstRate: number; // e.g. 5, 12, 18
  color?: string;
  grn?: string;
  cinDate?: string;
  grnDate?: string;
  billNo?: string;
  onlineStore?: boolean;
  secondaryUnit?: string;
  serialisationEnabled?: boolean;
  customFields?: {
    color: string;
    cinDate: string;
    grnDate: string;
    billNo: string;
  };
  description?: string;
}

export interface ItemPartyPrice {
  id: string;
  itemId: string;
  partyId: string;
  partyName: string;
  partyMobile: string;
  salesPrice: number;
  taxInclusive: boolean;
}

export interface Godown {
  id: string;
  name: string;
  location: string;
  isDefault?: boolean;
  stockQty?: number;
  stockValue?: number;
  itemCount?: number;
}

export interface GodownTransfer {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  fromGodownId: string;
  fromGodownName: string;
  toGodownId: string;
  toGodownName: string;
  quantity: number;
  notes: string;
}

export type StockMovementType =
  | "sale"
  | "purchase"
  | "sales_return"
  | "purchase_return"
  | "adjustment_in"
  | "adjustment_out"
  | "opening"
  | "transfer";

export interface StockMovement {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  godownId: string;
  godownName: string;
  movementType: StockMovementType;
  referenceType: string;
  referenceId: string;
  quantity: number;
  rate: number;
  balanceAfter: number;
  notes: string;
}

export interface InvoiceItem {
  item: Item;
  quantity: number;
  freeQuantity: number;
  rate: number;
  discountPct: number;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  party: Party;
  date: string;
  items: InvoiceItem[];
  subtotal: number;
  total: number;
  paidAmount: number;
  paymentMode: string;
  status: "paid" | "partial" | "unpaid" | "cancelled";
  irn?: string;
  ackNumber?: string;
  ackDate?: string;
  qrCodeData?: string;
  eInvoiceStatus?: "pending" | "generated" | "failed" | "cancelled";
  eInvoiceProvider?: string;
  eInvoiceRetryCount?: number;
  eInvoiceLastError?: string;
  eInvoiceCancelReason?: string;
  eInvoiceCancelledAt?: string;
}

export interface EInvoiceLog {
  id: string;
  event: string;
  status: string;
  provider: string;
  message: string;
  createdAt: string;
  createdByName?: string;
}

export interface EInvoiceRecord {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyGstin: string;
  invoiceDate: string;
  totalAmount: number;
  invoiceStatus: string;
  irn: string;
  ackNumber: string;
  ackDate: string;
  qrCodeData: string;
  eInvoiceStatus: "pending" | "generated" | "failed" | "cancelled";
  eInvoiceProvider: string;
  eInvoiceRetryCount: number;
  eInvoiceLastError: string;
  eInvoiceCancelReason: string;
  eInvoiceCancelledAt: string;
  logs: EInvoiceLog[];
}

export type StaffAttendanceStatus = "present" | "absent" | "half_day" | "holiday";

export interface Staff {
  id: string;
  name: string;
  designation: string;
  salary: number;
  attendance: { [date: string]: StaffAttendanceStatus };
}

export type StaffPayrollStatus = "not_generated" | "unpaid" | "paid";

export interface StaffPayrollRow {
  id: string;
  payrollId: string;
  staffId: string;
  staffName: string;
  designation: string;
  month: number;
  year: number;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: StaffPayrollStatus;
  paymentDate: string;
  attendance: {
    daysInMonth: number;
    markedDays: number;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    holidayDays: number;
    unmarkedDays: number;
    paidDays: number;
  };
}

export interface StaffPayrollReport {
  month: number;
  year: number;
  monthLabel: string;
  rows: StaffPayrollRow[];
  summary: {
    totalStaff: number;
    generatedCount: number;
    paidCount: number;
    unpaidCount: number;
    totalNetSalary: number;
    paidAmount: number;
    unpaidAmount: number;
    attendanceMarkedDays: number;
  };
}

export interface PendingReminder {
  id: string;
  type: string;
  title: string;
  message: string;
  partyName: string;
  channel: string;
  scheduledAt: string;
  createdAt: string;
  voucherType: string;
  voucherId: string;
  status: string;
  attemptCount?: number;
  lastAttemptAt?: string;
  deliveryMessage?: string;
}

export interface PendingNotificationAction {
  id: string;
  type: "payment_due" | "low_stock" | "daily_summary" | "reminder" | string;
  title: string;
  message: string;
  count: number;
  amount: number;
  target: string;
  priority: "high" | "medium" | "low";
  dueDate: string;
  createdAt: string;
  partyName: string;
}

export interface PendingNotifications {
  actions: PendingNotificationAction[];
  pendingReminders: PendingReminder[];
  counts: {
    actions: number;
    pendingReminders: number;
  };
}

export interface BusinessNotification {
  id: string;
  sourceType: string;
  sourceId: string | null;
  title: string;
  message: string;
  priority: "high" | "medium" | "low";
  target: string;
  status: "unread" | "read" | "dismissed";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
}

export interface NotificationCenterData {
  notifications: BusinessNotification[];
  counts: {
    total: number;
    unread: number;
    read: number;
    dismissed: number;
  };
  serverTime?: string;
}

export interface CAReportShareRow {
  id: string;
  reportId: string;
  reportName: string;
  recipient: string;
  dateRange: string;
  status: "prepared" | "sent" | "failed" | "revoked";
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface CAReportSharingData {
  enabled: boolean;
  caName: string;
  caEmail: string;
  caMobile: string;
  bundleReports: Array<{
    reportId: string;
    reportName: string;
  }>;
  summary: {
    totalShares: number;
    activeShares: number;
    revokedShares: number;
    lastSharedAt: string;
    lastRecipient: string;
  };
  shares: CAReportShareRow[];
}

export interface TransactionRow {
  id: string;
  date: string;
  type: string;
  txnNo: string;
  partyName: string;
  amount: number;
}

export type PurchaseViewKey =
  | "purchases"
  | "payment-out"
  | "purchase-return"
  | "debit-note"
  | "purchase-orders";

export interface PurchaseRegisterRow {
  id: string;
  date: string;
  number: string;
  partyName: string;
  dueIn: string;
  itemName: string;
  qty: number;
  amount: number;
  paidAmount: number;
  settledAmount: number;
  paymentMode: string;
  linkedVoucher: string;
  expectedDate: string;
  status: string;
  notes: string;
  settlements?: PaymentSettlement[];
  isAdvance?: boolean;
  cancellationReason?: string;
}

export type SalesRegisterViewKey =
  | "quotation"
  | "payment-in"
  | "sales-return"
  | "credit-note"
  | "delivery-challan"
  | "proforma-invoice";

export interface SalesRegisterDataRow {
  id: string;
  date: string;
  number: string;
  partyName: string;
  itemName: string;
  qty: number;
  amount: number;
  settledAmount: number;
  receivedAmount: number;
  paymentMode: string;
  linkedVoucher: string;
  validTill: string;
  status: string;
  notes: string;
  settlements?: PaymentSettlement[];
  isAdvance?: boolean;
  cancellationReason?: string;
  convertedInvoiceId?: string;
}

export interface PaymentSettlement {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  settledAmount: number;
}

export interface PaymentGatewayOrder {
  id: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string;
  providerStatus: string;
  receipt: string;
  amount: number;
  amountSubunits: number;
  currency: string;
  status: "created" | "attempted" | "paid" | "failed" | "cancelled" | string;
  signatureVerified: boolean;
  partyId: string;
  partyName: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentInId: string;
  paymentNumber: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string;
}

export interface AccountingData {
  bankAccounts: Array<{
    id: string;
    name: string;
    bankName: string;
    accountNumber: string;
    balance: number;
  }>;
  bankTransactions: Array<{
    id: string;
    date: string;
    accountId: string;
    accountName: string;
    type: "deposit" | "withdrawal";
    amount: number;
    referenceNumber: string;
    description: string;
  }>;
  expenses: Array<{
    id: string;
    date: string;
    number: string;
    category: string;
    amount: number;
    paidAmount: number;
    paymentMode: string;
    notes: string;
  }>;
  automatedBills: Array<{
    id: string;
    name: string;
    amount: number;
    frequency: string;
    nextDueDate: string;
    isActive: boolean;
  }>;
}

export interface OnlineOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  partyId: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: "pending" | "paid" | "cod" | "refunded";
  dispatchStatus: "new" | "packed" | "shipped" | "delivered" | "cancelled";
  source: "online_store" | "whatsapp" | "manual";
  shippingProvider: string;
  shippingStatus: "not_created" | "order_created" | "awb_assigned" | "pickup_scheduled" | "in_transit" | "delivered" | "failed" | string;
  shiprocketOrderId: string;
  shiprocketShipmentId: string;
  shiprocketAwbCode: string;
  shiprocketCourierName: string;
  shippingLabelUrl: string;
  trackingUrl: string;
  stockDeducted: boolean;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  notes: string;
  currentStock: number;
}

export interface SMSTemplate {
  id: string;
  name: string;
  category: "offer" | "new_arrival" | "payment" | "store";
  message: string;
  isActive: boolean;
}

export interface SMSCampaign {
  id: string;
  campaignNumber: string;
  name: string;
  templateId: string;
  templateName: string;
  audience: "all_customers" | "manual";
  message: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  creditCost: number;
  status: "draft" | "queued" | "completed" | "cancelled";
  queuedAt: string;
  completedAt: string;
  createdAt: string;
}

export interface SMSMarketingData {
  creditBalance: number;
  templates: SMSTemplate[];
  campaigns: SMSCampaign[];
}

export interface BusinessToolsData {
  onlineOrders: OnlineOrder[];
  smsMarketing: SMSMarketingData;
}

export interface SettingsData {
  account: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    role: string;
  };
  businessProfile: {
    id: string;
    name: string;
    phone: string;
    gstin: string;
    category: string;
    state: string;
    address: string;
    city: string;
    pincode: string;
    email: string;
    upiId: string;
    bankAccountDetails: Record<string, unknown>;
    showInOnlineStore: boolean;
    enableGstBilling: boolean;
    showLogoOnInvoice: boolean;
    branchBilling: boolean;
    showUpiOnInvoice: boolean;
    printPreview: boolean;
    hideZeroStockBarcodes: boolean;
    printOriginalDuplicate: boolean;
    autoPrintAfterSale: boolean;
    caReportsEnabled: boolean;
    caName: string;
    caEmail: string;
    caMobile: string;
    planName: string;
    planValidTill: string;
    referralCode: string;
    supportEmail: string;
    supportPhone: string;
  };
  invoice: {
    id: string;
    theme: string;
    themeColor: string;
    themeStyle: string;
    showMrp: boolean;
    showHsn: boolean;
    showDiscount: boolean;
    showColor: boolean;
    showCinDate: boolean;
    showGrnDate: boolean;
    showFreeQty: boolean;
    showPartyBalance: boolean;
    showItemDescription: boolean;
    showTimeOnInvoice: boolean;
    showDiscountOnMrp: boolean;
    paperSize: string;
    thermalPaperSize: string;
    thermalTheme: string;
    logoUrl: string;
    signatureUrl: string;
    customFields: Array<Record<string, unknown>>;
    invoicePrefix: string;
    resetEachYear: boolean;
  };
  reminders: {
    paymentDue: boolean;
    saleInvoice: boolean;
    lowStock: boolean;
    customerOccasions: boolean;
    dailySummary: boolean;
  };
}

export interface DashboardData {
  lastUpdated: string;
  stats: {
    totalSales: number;
    totalPurchases: number;
    receivable: number;
    payable: number;
    inventoryVal: number;
    bankBalance: number;
    expenseTotal: number;
  };
  salesTrend: Array<{
    date: string;
    label: string;
    sales: number;
    invoiceCount: number;
  }>;
  checklist: Array<{
    id: string;
    label: string;
    value: number;
    count: number;
    target: string;
    status: string;
  }>;
}

export type ReportCategory = "Favourite" | "GST" | "Transaction" | "Item" | "Party" | "Business";

export interface ReportDefinition {
  id: string;
  name: string;
  category: Exclude<ReportCategory, "Favourite">;
  description: string;
  metricLabel: string;
  metricValue: string;
  columns: string[];
  rows: string[][];
  favourite?: boolean;
  badge?: string;
  rowCount?: number;
  generatedAt?: string;
  exportFileName?: string;
  filters?: Record<string, string>;
}

export interface ProviderStatus {
  provider: string;
  mode: "development" | "production" | "disabled" | "unsupported";
  configured: boolean;
  missing?: string[];
}

export interface WorkspaceData {
  business: Business;
  providerStatus?: {
    eInvoice: ProviderStatus;
    sms: ProviderStatus;
    email?: ProviderStatus;
    paymentGateway?: ProviderStatus;
    shipping?: ProviderStatus;
    whatsapp?: ProviderStatus;
  };
  modulePermissions?: ModulePermissions;
  parties: Party[];
  items: Item[];
  godowns: Godown[];
  staff: Staff[];
  invoices: SalesInvoice[];
  transactions: TransactionRow[];
  dashboard: DashboardData;
  salesRows: Record<SalesRegisterViewKey, SalesRegisterDataRow[]>;
  purchaseRows: Record<PurchaseViewKey, PurchaseRegisterRow[]>;
  accounting: AccountingData;
  businessTools: BusinessToolsData;
  settings: SettingsData;
  users: Array<{
    id: string;
    name: string;
    mobile: string;
    role: string;
    isActive: boolean;
  }>;
  counts: {
    parties: number;
    items: number;
    salesInvoices: number;
    purchaseInvoices: number;
    paymentsIn: number;
    paymentsOut: number;
  };
}
