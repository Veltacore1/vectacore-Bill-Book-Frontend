import React, { lazy, Suspense, useCallback, useEffect, useState, useMemo } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import TenantOnboarding from "./components/TenantOnboarding";
import { clearTenantSession, createItem, createParty, createSalesInvoice, getWorkspace, hasTenantSession } from "./api";
import type { PurchaseView } from "./components/Purchases";
import type { SalesRegisterView } from "./components/SalesRegisters";
import type {
  AccountingData,
  Business,
  DashboardData,
  Godown,
  InvoiceItem,
  Item,
  ModulePermissions,
  OnlineOrder,
  Party,
  PurchaseRegisterRow,
  PurchaseViewKey,
  ProviderStatus,
  SMSMarketingData,
  SalesRegisterDataRow,
  SalesRegisterViewKey,
  SalesInvoice,
  SettingsData,
  Staff,
  TransactionRow
} from "./types";

const AccountingSolutions = lazy(() => import("./components/AccountingSolutions"));
const BusinessTools = lazy(() => import("./components/BusinessTools"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const GodownModule = lazy(() => import("./components/Godown"));
const Items = lazy(() => import("./components/Items"));
const Parties = lazy(() => import("./components/Parties"));
const POSBilling = lazy(() => import("./components/POSBilling"));
const PublicSharedLedger = lazy(() => import("./components/PublicSharedLedger"));
const Purchases = lazy(() => import("./components/Purchases"));
const Reports = lazy(() => import("./components/Reports"));
const SalesInvoices = lazy(() => import("./components/SalesInvoices"));
const SalesRegisters = lazy(() => import("./components/SalesRegisters"));
const Settings = lazy(() => import("./components/Settings"));
const SharedLedger = lazy(() => import("./components/SharedLedger"));

const initialBusiness: Business = {
  name: "Loading tenant...",
  phone: "",
  gstin: "",
  prefix: ""
};

const initialParties: Party[] = [];
const initialItems: Item[] = [];
const initialGodowns: Godown[] = [];
const initialStaff: Staff[] = [];
const initialPurchaseRows: Record<PurchaseViewKey, PurchaseRegisterRow[]> = {
  purchases: [],
  "payment-out": [],
  "purchase-return": [],
  "debit-note": [],
  "purchase-orders": []
};
const initialSalesRows: Record<SalesRegisterViewKey, SalesRegisterDataRow[]> = {
  quotation: [],
  "payment-in": [],
  "sales-return": [],
  "credit-note": [],
  "delivery-challan": [],
  "proforma-invoice": []
};
const initialAccounting: AccountingData = {
  bankAccounts: [],
  bankTransactions: [],
  expenses: [],
  automatedBills: []
};
const initialSmsMarketing: SMSMarketingData = {
  creditBalance: 0,
  templates: [],
  campaigns: []
};
const initialSettingsData: SettingsData | null = null;
const initialProviderStatus: Partial<Record<string, ProviderStatus>> = {};
const initialDashboard: DashboardData = {
  lastUpdated: "",
  stats: {
    totalSales: 0,
    totalPurchases: 0,
    receivable: 0,
    payable: 0,
    inventoryVal: 0,
    bankBalance: 0,
    expenseTotal: 0
  },
  salesTrend: [],
  checklist: []
};

const TAB_MODULES: Record<string, string> = {
  dashboard: "dashboard",
  parties: "parties",
  "shared-ledger": "parties",
  items: "items",
  godown: "stock",
  "sales-invoices": "sales",
  "sales-invoice-create": "sales",
  "sales-invoice-detail": "sales",
  quotation: "sales",
  "payment-in": "payments",
  "sales-return": "sales",
  "credit-note": "sales",
  "delivery-challan": "sales",
  "proforma-invoice": "sales",
  purchases: "purchases",
  "payment-out": "payments",
  "purchase-return": "purchases",
  "debit-note": "purchases",
  "purchase-orders": "purchases",
  reports: "reports",
  "cash-bank": "accounting",
  "e-invoicing": "sales",
  "automated-bills": "accounting",
  expenses: "accounting",
  "pos-billing": "sales",
  "staff-attendance": "staff",
  "manage-users": "users",
  "online-orders": "business_tools",
  "sms-marketing": "business_tools",
  settings: "settings"
};

const FALLBACK_TABS = ["dashboard", "items", "parties", "sales-invoices", "purchases", "reports"];

const labelForModule = (moduleKey: string) => moduleKey.replace(/_/g, " ");
const shouldOpenOnboarding = (message: string) => (
  message.includes("No tenant session")
  || message.includes("session expired")
  || message.includes("Seeded tenant user not found")
  || message.includes("Demo session is disabled")
);

function WorkspaceSuspenseFallback() {
  return (
    <div className="tenant-loading-card">
      <strong>Loading workspace module</strong>
      <span>Preparing the selected production screen.</span>
    </div>
  );
}

const sharedLedgerTokenFromPath = () => {
  const match = window.location.pathname.match(/^\/shared-ledger\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
};

export default function App() {
  const [publicSharedLedgerToken, setPublicSharedLedgerToken] = useState(sharedLedgerTokenFromPath);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return window.location.pathname === "/register"
      || window.location.pathname === "/login"
      || params.has("register")
      || (!sharedLedgerTokenFromPath() && !hasTenantSession());
  });
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [business, setBusiness] = useState<Business>(initialBusiness);
  const [parties, setParties] = useState<Party[]>(initialParties);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [godowns, setGodowns] = useState<Godown[]>(initialGodowns);
  const [staff, setStaff] = useState<Staff[]>(initialStaff);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [salesRows, setSalesRows] = useState<Record<SalesRegisterViewKey, SalesRegisterDataRow[]>>(initialSalesRows);
  const [purchaseRows, setPurchaseRows] = useState<Record<PurchaseViewKey, PurchaseRegisterRow[]>>(initialPurchaseRows);
  const [accounting, setAccounting] = useState<AccountingData>(initialAccounting);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);
  const [smsMarketing, setSmsMarketing] = useState<SMSMarketingData>(initialSmsMarketing);
  const [settingsData, setSettingsData] = useState<SettingsData | null>(initialSettingsData);
  const [providerStatus, setProviderStatus] = useState<Partial<Record<string, ProviderStatus>>>(initialProviderStatus);
  const [dashboardData, setDashboardData] = useState<DashboardData>(initialDashboard);
  const [users, setUsers] = useState<Array<{ id: string; name: string; mobile: string; role: string; isActive: boolean }>>([]);
  const [modulePermissions, setModulePermissions] = useState<ModulePermissions>({});
  const [counts, setCounts] = useState({ parties: 0, items: 0, salesInvoices: 0, purchaseInvoices: 0, paymentsIn: 0, paymentsOut: 0 });
  const [targetSalesInvoiceId, setTargetSalesInvoiceId] = useState<string | null>(null);
  const [isLoadingTenant, setIsLoadingTenant] = useState(true);
  const [apiError, setApiError] = useState("");

  // Modals / Form toggles
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "", hsn: "", price: 0, purchasePrice: 0, stock: 0, godown: "", category: "", gstRate: 5, color: "", grn: ""
  });

  const [showAddParty, setShowAddParty] = useState(false);
  const [newParty, setNewParty] = useState({
    name: "", mobile: "", type: "customer" as "customer" | "supplier", balance: 0
  });

  const loadTenantWorkspace = useCallback((options: { silent?: boolean } = {}) => {
    const silent = options.silent === true;
    if (!silent) {
      setIsLoadingTenant(true);
    }
    return getWorkspace()
      .then((workspace) => {
        setBusiness(workspace.business);
        setParties(workspace.parties);
        setItems(workspace.items);
        setGodowns(workspace.godowns);
        setStaff(workspace.staff);
        setInvoices(workspace.invoices);
        setTransactions(workspace.transactions);
        setDashboardData(workspace.dashboard);
        setSalesRows(workspace.salesRows);
        setPurchaseRows(workspace.purchaseRows);
        setAccounting(workspace.accounting);
        setOnlineOrders(workspace.businessTools?.onlineOrders ?? []);
        setSmsMarketing(workspace.businessTools?.smsMarketing ?? initialSmsMarketing);
        setSettingsData(workspace.settings ?? initialSettingsData);
        setProviderStatus(workspace.providerStatus ?? initialProviderStatus);
        setUsers(workspace.users);
        setModulePermissions(workspace.modulePermissions ?? {});
        setCounts(workspace.counts);
        setApiError("");
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Unable to load tenant data";
        setApiError(message);
        if (shouldOpenOnboarding(message)) {
          clearTenantSession();
          setShowOnboarding(true);
        }
      })
      .finally(() => {
        if (!silent) {
          setIsLoadingTenant(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!showOnboarding && !publicSharedLedgerToken) {
      loadTenantWorkspace();
    }
  }, [loadTenantWorkspace, publicSharedLedgerToken, showOnboarding]);

  useEffect(() => {
    if (showOnboarding || publicSharedLedgerToken || activeTab !== "dashboard") return;

    const refreshDashboard = () => {
      void loadTenantWorkspace({ silent: true });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshDashboard();
      }
    };

    const intervalId = window.setInterval(refreshDashboard, 30000);
    window.addEventListener("focus", refreshDashboard);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshDashboard);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [activeTab, loadTenantWorkspace, publicSharedLedgerToken, showOnboarding]);

  const permissionsLoaded = Object.keys(modulePermissions).length > 0;
  const canViewTab = useCallback((tab: string) => {
    if (!permissionsLoaded) return true;
    const moduleKey = TAB_MODULES[tab];
    if (!moduleKey) return true;
    return modulePermissions[moduleKey]?.view === true;
  }, [modulePermissions, permissionsLoaded]);

  const firstAllowedTab = useCallback(() => {
    return FALLBACK_TABS.find(tab => canViewTab(tab)) || "dashboard";
  }, [canViewTab]);

  const navigateToTab = useCallback((tab: string) => {
    if (canViewTab(tab)) {
      setActiveTab(tab);
      return;
    }

    const moduleKey = TAB_MODULES[tab] || "this module";
    setApiError(`Your role does not have access to ${labelForModule(moduleKey)}.`);
  }, [canViewTab]);

  useEffect(() => {
    if (permissionsLoaded && !canViewTab(activeTab)) {
      setActiveTab(firstAllowedTab());
    }
  }, [activeTab, canViewTab, firstAllowedTab, permissionsLoaded]);


  // Calculate high-level stats
  const stats = useMemo(() => {
    const totalSales = invoices.reduce((acc, inv) => acc + inv.total, 0);
    const receivable = parties.filter(p => p.type === "customer").reduce((acc, p) => acc + (p.balance > 0 ? p.balance : 0), 0);
    const payable = parties.filter(p => p.type === "supplier").reduce((acc, p) => acc + Math.abs(p.balance < 0 ? p.balance : 0), 0);
    const inventoryVal = items.reduce((acc, item) => acc + (item.stock * item.purchasePrice), 0);
    return { totalSales, receivable, payable, inventoryVal };
  }, [invoices, parties, items]);

  const handleCreateInvoiceShortcut = () => {
    setTargetSalesInvoiceId(null);
    navigateToTab("sales-invoice-create");
  };

  const handleDashboardInvoiceOpen = (invoiceId: string) => {
    setTargetSalesInvoiceId(invoiceId);
    navigateToTab("sales-invoice-detail");
  };

  const saveInvoice = async (checkoutData: {
    partyId: string;
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
  }): Promise<SalesInvoice | null> => {
    const party = parties.find(p => p.id === checkoutData.partyId);
    if (!party) {
      return null;
    }

    try {
      const serverInvoice = await createSalesInvoice(checkoutData);
      await loadTenantWorkspace();
      setApiError("");
      return serverInvoice;
    } catch (error) {
      await loadTenantWorkspace();
      setApiError(error instanceof Error ? error.message : "Sales invoice could not be saved to Postgres");
      return null;
    }
  };

  const handlePOSCheckout = async (checkoutData: {
    partyId: string;
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
  }) => {
    return saveInvoice(checkoutData);
  };

  const handleAddItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const item: Item = {
      id: "",
      name: newItem.name,
      hsn: newItem.hsn,
      price: newItem.price,
      purchasePrice: newItem.purchasePrice,
      stock: newItem.stock,
      godown: newItem.godown,
      category: newItem.category,
      gstRate: newItem.gstRate,
      color: newItem.color,
      grn: newItem.grn
    };
    try {
      await createItem(item);
      await loadTenantWorkspace();
      setShowAddItem(false);
      setNewItem({ name: "", hsn: "", price: 0, purchasePrice: 0, stock: 0, godown: "", category: "", gstRate: 5, color: "", grn: "" });
      setApiError("");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Item could not be saved to Postgres");
    }
  };

  const handleAddPartySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const party = await createParty(newParty);
      setParties([...parties, party]);
      setShowAddParty(false);
      setNewParty({ name: "", mobile: "", type: "customer", balance: 0 });
      setApiError("");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Party could not be saved to Postgres");
    }
  };

  const handleAttendanceChange = (staffId: string, date: string, status: "present" | "absent" | "half_day") => {
    const updated = staff.map(member => {
      if (member.id === staffId) {
        return {
          ...member,
          attendance: {
            ...member.attendance,
            [date]: status
          }
        };
      }
      return member;
    });
    setStaff(updated);
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case "dashboard": return "Dashboard";
      case "parties": return "Parties Ledger Workspace";
      case "items": return "Saree Catalog / Inventory";
      case "sales-invoices": return "Sales Invoices";
      case "sales-invoice-create": return "Create Sales Invoice";
      case "sales-invoice-detail": return "Sales Invoice";
      case "pos-billing": return "POS Billing Desk";
      case "staff-attendance": return "Weaver Loom Attendance Register";
      case "settings": return "System Settings";
      default: return business.name || "Business System";
    }
  };

  const salesMode = activeTab === "sales-invoice-create"
    ? "create"
    : activeTab === "sales-invoice-detail"
      ? "detail"
      : "list";
  const isSalesWorkspace = activeTab === "sales-invoices" || activeTab === "sales-invoice-create" || activeTab === "sales-invoice-detail";
  const salesRegisterViews: SalesRegisterView[] = [
    "quotation",
    "payment-in",
    "sales-return",
    "credit-note",
    "delivery-challan",
    "proforma-invoice"
  ];
  const isSalesRegisterWorkspace = salesRegisterViews.includes(activeTab as SalesRegisterView);
  const purchaseViews: PurchaseView[] = [
    "purchases",
    "payment-out",
    "purchase-return",
    "debit-note",
    "purchase-orders"
  ];
  const isPurchaseWorkspace = purchaseViews.includes(activeTab as PurchaseView);
  const isAccountingWorkspace = ["cash-bank", "e-invoicing", "automated-bills", "expenses"].includes(activeTab);
  const isBusinessToolsWorkspace = ["staff-attendance", "manage-users", "online-orders", "sms-marketing"].includes(activeTab);
  const isMbbWorkspace =
    activeTab === "dashboard" ||
    activeTab === "parties" ||
    activeTab === "items" ||
    activeTab === "reports" ||
    activeTab === "pos-billing" ||
    activeTab === "settings" ||
    activeTab === "godown" ||
    activeTab === "shared-ledger" ||
    isAccountingWorkspace ||
    isBusinessToolsWorkspace ||
    isSalesWorkspace ||
    isSalesRegisterWorkspace ||
    isPurchaseWorkspace;

  const handleTenantReady = async () => {
    setShowOnboarding(false);
    navigateToTab("dashboard");
    await loadTenantWorkspace();
  };

  const handleLogout = () => {
    clearTenantSession();
    setBusiness(initialBusiness);
    setParties(initialParties);
    setItems(initialItems);
    setGodowns(initialGodowns);
    setStaff(initialStaff);
    setInvoices([]);
    setTransactions([]);
    setSalesRows(initialSalesRows);
    setPurchaseRows(initialPurchaseRows);
    setAccounting(initialAccounting);
    setOnlineOrders([]);
    setSmsMarketing(initialSmsMarketing);
    setSettingsData(initialSettingsData);
    setProviderStatus(initialProviderStatus);
    setDashboardData(initialDashboard);
    setUsers([]);
    setModulePermissions({});
    setCounts({ parties: 0, items: 0, salesInvoices: 0, purchaseInvoices: 0, paymentsIn: 0, paymentsOut: 0 });
    setTargetSalesInvoiceId(null);
    setApiError("");
    setIsLoadingTenant(false);
    setActiveTab("dashboard");
    setShowOnboarding(true);
    window.history.replaceState(null, "", "/login");
  };

  if (publicSharedLedgerToken) {
    return (
      <Suspense fallback={<WorkspaceSuspenseFallback />}>
        <PublicSharedLedger
          token={publicSharedLedgerToken}
          onExit={() => {
            window.history.pushState({}, "", "/");
            setPublicSharedLedgerToken("");
            navigateToTab("shared-ledger");
          }}
        />
      </Suspense>
    );
  }

  if (showOnboarding) {
    return (
      <TenantOnboarding
        initialMode={window.location.pathname === "/register" ? "register" : "login"}
        onReady={handleTenantReady}
      />
    );
  }

  return (
    <div className={`app-layout ${activeTab === "pos-billing" ? "pos-fullscreen-layout" : ""} ${activeTab === "manage-users" || activeTab === "settings" ? "settings-tools-layout" : ""}`}>
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={navigateToTab}
        businessName={business.name}
        businessPhone={business.phone}
        modulePermissions={modulePermissions}
        onCreateInvoice={handleCreateInvoiceShortcut}
        onLogout={handleLogout}
      />

      {/* Main Workspace Frame */}
      <div className={`main-wrapper ${isMbbWorkspace ? "items-mode" : ""}`}>
        {!isMbbWorkspace && <Topbar title={getPageTitle()} />}

        <div className={`main-content ${isMbbWorkspace ? "items-content" : ""}`}>
          {apiError && (
            <div className="tenant-api-banner">
              <strong>Postgres sync issue</strong>
              <span>{apiError}</span>
            </div>
          )}

          {isLoadingTenant && (
            <div className="tenant-loading-card">
              <strong>Loading tenant data</strong>
              <span>Connecting to the tenant database and preparing the workspace.</span>
            </div>
          )}

          <Suspense fallback={<WorkspaceSuspenseFallback />}>
            {activeTab === "dashboard" && (
            <Dashboard
              stats={stats}
              dashboard={dashboardData}
              invoices={invoices}
              parties={parties}
              transactions={transactions}
              setActiveTab={navigateToTab}
              onNavigateToInvoice={handleDashboardInvoiceOpen}
              onRefresh={() => loadTenantWorkspace({ silent: true })}
            />
          )}

          {activeTab === "parties" && (
            <Parties
              parties={parties}
              onAddPartyClick={() => setShowAddParty(true)}
              onNavigate={navigateToTab}
              onWorkspaceRefresh={loadTenantWorkspace}
            />
          )}

          {activeTab === "items" && (
            <Items
              godowns={godowns}
              items={items}
              parties={parties}
              modulePermissions={modulePermissions}
              hideZeroStockBarcodes={Boolean(settingsData?.businessProfile.hideZeroStockBarcodes)}
              onNavigate={navigateToTab}
              onWorkspaceRefresh={loadTenantWorkspace}
            />
          )}

          {activeTab === "godown" && (
            <GodownModule godowns={godowns} items={items} onNavigate={navigateToTab} onWorkspaceRefresh={loadTenantWorkspace} />
          )}

          {isSalesWorkspace && (
            <SalesInvoices
              invoices={invoices}
              items={items}
              mode={salesMode}
              openInvoiceId={targetSalesInvoiceId}
              onModeChange={(mode) => {
                if (mode === "create") navigateToTab("sales-invoice-create");
                if (mode === "detail") navigateToTab("sales-invoice-detail");
                if (mode === "list") {
                  setTargetSalesInvoiceId(null);
                  navigateToTab("sales-invoices");
                }
              }}
              onNavigate={navigateToTab}
              onSaveInvoice={saveInvoice}
              onWorkspaceRefresh={loadTenantWorkspace}
              parties={parties}
              business={business}
            />
          )}

          {isSalesRegisterWorkspace && (
            <SalesRegisters
              view={activeTab as SalesRegisterView}
              items={items}
              parties={parties}
              invoices={invoices}
              initialRows={salesRows}
              onWorkspaceRefresh={loadTenantWorkspace}
            />
          )}

          {isPurchaseWorkspace && (
            <Purchases
              view={activeTab as PurchaseView}
              items={items}
              parties={parties}
              initialRows={purchaseRows}
              onNavigate={navigateToTab}
              onWorkspaceRefresh={loadTenantWorkspace}
            />
          )}

          {activeTab === "reports" && (
            <Reports onNavigate={navigateToTab} />
          )}

          {isAccountingWorkspace && (
            <AccountingSolutions
              view={activeTab as "cash-bank" | "e-invoicing" | "automated-bills" | "expenses"}
              accounting={accounting}
              invoices={invoices}
              onNavigate={navigateToTab}
              onWorkspaceRefresh={loadTenantWorkspace}
            />
          )}

          {activeTab === "shared-ledger" && (
            <SharedLedger
              business={business}
              parties={parties}
              onBack={() => navigateToTab("parties")}
              onCreateParty={() => setShowAddParty(true)}
            />
          )}

          {isBusinessToolsWorkspace && (
            <BusinessTools
              view={activeTab as "staff-attendance" | "manage-users" | "online-orders" | "sms-marketing"}
              business={business}
              staffList={staff}
              users={users}
              items={items}
              parties={parties}
              onlineOrders={onlineOrders}
              smsMarketing={smsMarketing}
              settings={settingsData}
              modulePermissions={modulePermissions}
              counts={counts}
              onAttendanceChange={handleAttendanceChange}
              onWorkspaceRefresh={loadTenantWorkspace}
              setActiveTab={navigateToTab}
              onLogout={handleLogout}
            />
          )}

          {activeTab === "pos-billing" && (
            <POSBilling
              items={items}
              parties={parties}
              onCheckout={handlePOSCheckout}
              settings={settingsData}
              onExit={() => navigateToTab("dashboard")}
            />
          )}

          {activeTab === "settings" && (
            <Settings
              business={business}
              settings={settingsData}
              providerStatus={providerStatus}
              users={users}
              items={items}
              invoices={invoices}
              onWorkspaceRefresh={loadTenantWorkspace}
              onNavigate={navigateToTab}
              onBack={() => navigateToTab("dashboard")}
              onLogout={handleLogout}
            />
          )}
          </Suspense>
        </div>
      </div>

      {/* Modal - Add Saree Item */}
      {showAddItem && (
        <div className="overlay-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Add Premium Saree Product</span>
              <button className="modal-close" onClick={() => setShowAddItem(false)}>×</button>
            </div>
            <form onSubmit={handleAddItemSubmit}>
              <div className="modal-body form-grid">
                <div className="form-group">
                  <label className="form-label">Saree / Product Name</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  />
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">HSN Code</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newItem.hsn}
                      onChange={(e) => setNewItem({ ...newItem, hsn: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select
                      className="form-input"
                      value={newItem.category}
                      onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    >
                      <option value="Pure Silk">Pure Silk</option>
                      <option value="Zari Silk">Zari Silk</option>
                      <option value="Cotton Handloom">Cotton Handloom</option>
                    </select>
                  </div>
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Selling Price (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Purchase Cost (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newItem.purchasePrice}
                      onChange={(e) => setNewItem({ ...newItem, purchasePrice: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Opening Stock (PCS)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newItem.stock}
                      onChange={(e) => setNewItem({ ...newItem, stock: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Weaving Godown</label>
                    <select
                      className="form-input"
                      value={newItem.godown}
                      onChange={(e) => setNewItem({ ...newItem, godown: e.target.value })}
                    >
                      {godowns.map(g => (
                        <option key={g.id} value={g.name}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Saree Color Tone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newItem.color}
                      onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">GRN Reference Code</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newItem.grn}
                      onChange={(e) => setNewItem({ ...newItem, grn: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddItem(false)}>Cancel</button>
                <button type="submit" className="btn btn-green">Save Saree</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Add Party */}
      {showAddParty && (
        <div className="overlay-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <span className="modal-title">Register Customer / Supplier Ledger</span>
              <button className="modal-close" onClick={() => setShowAddParty(false)}>×</button>
            </div>
            <form onSubmit={handleAddPartySubmit}>
              <div className="modal-body form-grid">
                <div className="form-group">
                  <label className="form-label">Party Name</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newParty.name}
                    onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Mobile Number</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newParty.mobile}
                    onChange={(e) => setNewParty({ ...newParty, mobile: e.target.value })}
                  />
                </div>
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Account Category</label>
                    <select
                      className="form-input"
                      value={newParty.type}
                      onChange={(e) => setNewParty({ ...newParty, type: e.target.value as any })}
                    >
                      <option value="customer">Customer (Receivable)</option>
                      <option value="supplier">Supplier (Payable)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Opening Account Balance (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={newParty.balance}
                      onChange={(e) => setNewParty({ ...newParty, balance: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddParty(false)}>Cancel</button>
                <button type="submit" className="btn btn-green">Save Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
