import {
  BarChart3,
  Box,
  BriefcaseBusiness,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  FileClock,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Monitor,
  Package,
  Plus,
  Receipt,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Tags,
  UserCog,
  Users,
  Warehouse
} from "lucide-react";
import { canUseModule, getModulePermission } from "../types";
import type { ModulePermissions } from "../types";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  businessName: string;
  businessPhone: string;
  modulePermissions?: ModulePermissions;
  onCreateInvoice: () => void;
  onLogout: () => void;
}

type NavItem = {
  id: string;
  label: string;
  icon: typeof Users;
  moduleKey: string;
  alternateModuleKeys?: string[];
  action?: "view" | "create" | "manage";
  hasArrow?: boolean;
};

type SubItem = {
  id: string;
  label: string;
  moduleKey: string;
  action?: "view" | "create" | "manage";
  icon?: typeof Users;
  badge?: string;
};

const partyItems: SubItem[] = [
  { id: "parties", label: "All Parties", moduleKey: "parties", icon: Users },
  { id: "shared-ledger", label: "SharedLedger", moduleKey: "parties", icon: FileText, badge: "New" }
];

const salesItems: SubItem[] = [
  { id: "sales-invoices", label: "Sales Invoices", moduleKey: "sales" },
  { id: "quotation", label: "Quotation / Estimate", moduleKey: "sales" },
  { id: "payment-in", label: "Payment In", moduleKey: "payments" },
  { id: "sales-return", label: "Sales Return", moduleKey: "sales" },
  { id: "credit-note", label: "Credit Note", moduleKey: "sales" },
  { id: "delivery-challan", label: "Delivery Challan", moduleKey: "sales" },
  { id: "proforma-invoice", label: "Proforma Invoice", moduleKey: "sales" }
];

const purchaseItems: SubItem[] = [
  { id: "purchases", label: "Purchase Invoices", moduleKey: "purchases" },
  { id: "payment-out", label: "Payment Out", moduleKey: "payments" },
  { id: "purchase-return", label: "Purchase Return", moduleKey: "purchases" },
  { id: "debit-note", label: "Debit Note", moduleKey: "purchases" },
  { id: "purchase-orders", label: "Purchase Orders", moduleKey: "purchases" }
];

const placeholderTabs = [
  "quotation",
  "payment-in",
  "sales-return",
  "credit-note",
  "delivery-challan",
  "proforma-invoice",
  "payment-out",
  "purchase-return",
  "debit-note",
  "purchase-orders"
];

const initialsForBusiness = (name: string) =>
  (name || "VB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();

export default function Sidebar({
  activeTab,
  setActiveTab,
  businessName,
  businessPhone,
  modulePermissions,
  onCreateInvoice,
  onLogout
}: SidebarProps) {
  const permissionSet = modulePermissions && Object.keys(modulePermissions).length ? modulePermissions : null;

  const hasPermission = (moduleKey: string, action: "view" | "create" | "manage" = "view") =>
    permissionSet === null || canUseModule(permissionSet, moduleKey, action);
  const hasAnyView = (moduleKeys: string[]) =>
    permissionSet === null || moduleKeys.some(moduleKey => getModulePermission(permissionSet, moduleKey).view);
  const canCreateSalesInvoice = hasPermission("sales", "create");

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, moduleKey: "dashboard" },
    { id: "parties", label: "Parties", icon: Users, moduleKey: "parties", hasArrow: true },
    { id: "items", label: "Items", icon: Box, moduleKey: "items", alternateModuleKeys: ["stock"], hasArrow: true },
    { id: "sales-invoices", label: "Sales", icon: Tags, moduleKey: "sales", alternateModuleKeys: ["payments"], hasArrow: true },
    { id: "purchases", label: "Purchases", icon: ShoppingBag, moduleKey: "purchases", alternateModuleKeys: ["payments"], hasArrow: true },
    { id: "reports", label: "Reports", icon: BarChart3, moduleKey: "reports" }
  ];

  const accountingItems: NavItem[] = [
    { id: "cash-bank", label: "Cash & Bank", icon: Landmark, moduleKey: "accounting" },
    { id: "e-invoicing", label: "E-Invoicing", icon: Receipt, moduleKey: "accounting" },
    { id: "automated-bills", label: "Automated Bills", icon: FileClock, moduleKey: "accounting" },
    { id: "expenses", label: "Expenses", icon: BriefcaseBusiness, moduleKey: "accounting" },
    { id: "pos-billing", label: "POS Billing", icon: Monitor, moduleKey: "sales", action: "create" }
  ];

  const businessItems: NavItem[] = [
    { id: "staff-attendance", label: "Staff Attendance & Payroll", icon: CalendarCheck, moduleKey: "staff" },
    { id: "manage-users", label: "Manage Users", icon: UserCog, moduleKey: "users" },
    { id: "online-orders", label: "Online Orders", icon: ShoppingCart, moduleKey: "business_tools" },
    { id: "sms-marketing", label: "SMS Marketing", icon: Megaphone, moduleKey: "business_tools" }
  ];

  const visibleSalesItems = salesItems.filter(item => hasPermission(item.moduleKey, item.action ?? "view"));
  const visiblePurchaseItems = purchaseItems.filter(item => hasPermission(item.moduleKey, item.action ?? "view"));
  const visiblePartyItems = partyItems.filter(item => hasPermission(item.moduleKey, item.action ?? "view"));
  const visibleNavItems = navItems.filter(item => hasAnyView([item.moduleKey, ...(item.alternateModuleKeys ?? [])]));
  const visibleAccountingItems = accountingItems.filter(item => hasPermission(item.moduleKey, item.action ?? "view"));
  const visibleBusinessItems = businessItems.filter(item => hasPermission(item.moduleKey, item.action ?? "view"));
  const canViewSettings = hasPermission("settings");

  const isPartiesActive = activeTab === "parties" || activeTab === "shared-ledger";
  const isSalesActive =
    activeTab.startsWith("sales") || salesItems.some(item => item.id === activeTab);
  const isPurchasesActive = activeTab === "purchases" || purchaseItems.some(item => item.id === activeTab);
  const isItemsActive = activeTab === "items" || activeTab === "godown";

  const renderSubnav = (items: SubItem[], groupClass = "") => (
    <div className={`sidebar-subnav ${groupClass}`}>
      {items.map(item => {
        const Icon = item.icon;
        const active =
          activeTab === item.id ||
          (item.id === "sales-invoices" && activeTab.startsWith("sales-invoice"));

        return (
          <button
            key={item.id}
            className={`sidebar-subnav-item ${active ? "active" : ""}`}
            onClick={() => setActiveTab(item.id)}
            type="button"
          >
            {Icon && <Icon size={18} />}
            <span>{item.label}</span>
            {item.badge && <b>{item.badge}</b>}
          </button>
        );
      })}
    </div>
  );

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const itemIsParties = item.id === "parties";
    const itemIsSales = item.id === "sales-invoices";
    const itemIsPurchases = item.id === "purchases";
    const itemIsItems = item.id === "items";
    const isActive =
      (itemIsParties && isPartiesActive) ||
      (itemIsSales && isSalesActive) ||
      (itemIsPurchases && isPurchasesActive) ||
      (itemIsItems && isItemsActive) ||
      activeTab === item.id;

    return (
      <div key={item.id}>
        <button
          className={`sidebar-nav-item ${isActive ? "active" : ""}`}
          onClick={() => {
            if (itemIsParties) setActiveTab("parties");
            else if (itemIsSales) setActiveTab("sales-invoices");
            else if (itemIsPurchases) setActiveTab("purchases");
            else setActiveTab(item.id);
          }}
          type="button"
        >
          <span className="nav-left">
            <Icon className="nav-icon" size={18} />
            <span>{item.label}</span>
          </span>
          {item.hasArrow && (isActive ? <ChevronDown size={18} /> : <ChevronRight size={18} />)}
        </button>

        {itemIsParties && isPartiesActive && renderSubnav(visiblePartyItems)}

        {itemIsItems && isItemsActive && (
          <div className="sidebar-subnav">
            {hasPermission("items") && (
              <button className={`sidebar-subnav-item ${activeTab === "items" ? "active" : ""}`} onClick={() => setActiveTab("items")} type="button">
                <Package size={18} />
                <span>Inventory</span>
              </button>
            )}
            {hasPermission("stock") && (
              <button className={`sidebar-subnav-item ${activeTab === "godown" ? "active" : ""}`} onClick={() => setActiveTab("godown")} type="button">
                <Warehouse size={18} />
                <span>Godown (Warehouse)</span>
              </button>
            )}
          </div>
        )}

        {itemIsSales && isSalesActive && renderSubnav(visibleSalesItems, "sales-subnav")}

        {itemIsPurchases && isPurchasesActive && renderSubnav(visiblePurchaseItems, "sales-subnav")}
      </div>
    );
  };

  const renderFlatItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`sidebar-nav-item ${activeTab === item.id ? "active" : ""}`}
        onClick={() => setActiveTab(item.id)}
        type="button"
      >
        <span className="nav-left">
          <Icon className="nav-icon" size={18} />
          <span>{item.label}</span>
        </span>
      </button>
    );
  };

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo" aria-hidden="true">
          {initialsForBusiness(businessName)}
        </div>
        <div>
          <div className="sidebar-brand-name">{businessName}</div>
          <div className="sidebar-brand-phone">{businessPhone}</div>
        </div>
      </div>

      <button
        className={`create-invoice-btn ${canCreateSalesInvoice ? "" : "permission-disabled"}`}
        onClick={onCreateInvoice}
        disabled={!canCreateSalesInvoice}
        title={canCreateSalesInvoice ? "Create Sales Invoice" : "Your role can view sales but cannot create invoices"}
        type="button"
      >
        <span className="btn-main-text">
          <Plus size={18} />
          {canCreateSalesInvoice ? "Create Sales Invoice" : "Sales Read Only"}
        </span>
        <span className="btn-divider" />
        <ChevronDown size={18} />
      </button>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">General</div>
        {visibleNavItems.map(renderNavItem)}

        {visibleAccountingItems.length > 0 && (
          <>
            <div className="sidebar-section-label">Accounting Solutions</div>
            {visibleAccountingItems.map(renderFlatItem)}
          </>
        )}

        {visibleBusinessItems.length > 0 && (
          <>
            <div className="sidebar-section-label">Business Tools</div>
            {visibleBusinessItems.map(renderFlatItem)}
          </>
        )}
      </nav>

      <button className="sidebar-scroll-hint" type="button">
        Scroll for more options
        <ChevronDown size={14} />
      </button>

      {canViewSettings && (
        <button
          className={`sidebar-nav-item sidebar-settings ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
          type="button"
        >
          <span className="nav-left">
            <Settings className="nav-icon" size={18} />
            <span>Settings</span>
          </span>
        </button>
      )}

      <button className="sidebar-nav-item sidebar-logout" onClick={onLogout} type="button">
        <span className="nav-left">
          <LogOut className="nav-icon" size={18} />
          <span>Logout</span>
        </span>
      </button>

      <div className="sidebar-footer">
        <span>
          <Shield size={14} />
          100% Secure
        </span>
        <span>ISO Certified</span>
      </div>
      <span hidden>{placeholderTabs.length}</span>
    </aside>
  );
}
