import { useEffect, useRef, useState } from "react";
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
  Warehouse,
  X
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
  onQuickCreate?: (tab: string) => void;
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

type QuickCreateItem = {
  id: string;
  label: string;
  description: string;
  tab: string;
  moduleKey: string;
  action?: "view" | "create" | "manage";
  icon: typeof Users;
  color: string;
};

const partyItems: SubItem[] = [
  { id: "parties", label: "All Parties", moduleKey: "parties", icon: Users },
  { id: "shared-ledger", label: "Shared Ledger", moduleKey: "parties", icon: FileText, badge: "New" }
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
  onQuickCreate,
  onLogout
}: SidebarProps) {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isAccountingExpanded, setIsAccountingExpanded] = useState(true);
  const [isBusinessExpanded, setIsBusinessExpanded] = useState(true);
  const quickCreateRef = useRef<HTMLDivElement | null>(null);
  const permissionSet = modulePermissions && Object.keys(modulePermissions).length ? modulePermissions : null;

  const hasPermission = (moduleKey: string, action: "view" | "create" | "manage" = "view") =>
    permissionSet === null || canUseModule(permissionSet, moduleKey, action);
  const hasAnyView = (moduleKeys: string[]) =>
    permissionSet === null || moduleKeys.some(moduleKey => getModulePermission(permissionSet!, moduleKey).view);
  const canCreateSalesInvoice = hasPermission("sales", "create");

  const quickCreateItems: QuickCreateItem[] = [
    { id: "sales-invoice-create", label: "Sales Invoice", description: "Create a bill for customer", tab: "sales-invoice-create", moduleKey: "sales", action: "create", icon: FileText, color: "#6366F1" },
    { id: "quotation", label: "Quotation", description: "Send price estimate", tab: "quotation", moduleKey: "sales", action: "create", icon: Receipt, color: "#0EA5E9" },
    { id: "payment-in", label: "Payment In", description: "Record cash receipt", tab: "payment-in", moduleKey: "payments", action: "create", icon: Landmark, color: "#10B981" },
    { id: "sales-return", label: "Sales Return", description: "Process return voucher", tab: "sales-return", moduleKey: "sales", action: "create", icon: ShoppingBag, color: "#F59E0B" },
    { id: "credit-note", label: "Credit Note", description: "Issue customer credit", tab: "credit-note", moduleKey: "sales", action: "create", icon: FileClock, color: "#EC4899" },
    { id: "delivery-challan", label: "Delivery Challan", description: "Dispatch goods", tab: "delivery-challan", moduleKey: "sales", action: "create", icon: ShoppingCart, color: "#8B5CF6" },
    { id: "proforma-invoice", label: "Proforma Invoice", description: "Advance bill", tab: "proforma-invoice", moduleKey: "sales", action: "create", icon: Receipt, color: "#F97316" }
  ];

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
    { id: "staff-attendance", label: "Staff & Payroll", icon: CalendarCheck, moduleKey: "staff" },
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
  const visibleQuickCreateItems = quickCreateItems.filter(item => hasPermission(item.moduleKey, item.action ?? "create"));
  const canViewSettings = hasPermission("settings");

  const isPartiesActive = activeTab === "parties" || activeTab === "shared-ledger";
  const isSalesActive = activeTab.startsWith("sales") || salesItems.some(item => item.id === activeTab);
  const isPurchasesActive = activeTab === "purchases" || purchaseItems.some(item => item.id === activeTab);
  const isItemsActive = activeTab === "items" || activeTab === "godown";

  useEffect(() => {
    if (!isCreateMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!quickCreateRef.current?.contains(event.target as Node)) setIsCreateMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCreateMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCreateMenuOpen]);

  useEffect(() => { setIsCreateMenuOpen(false); }, [activeTab]);

  const handleMainCreateInvoice = () => { setIsCreateMenuOpen(false); onCreateInvoice(); };
  const handleQuickCreate = (tab: string) => {
    setIsCreateMenuOpen(false);
    if (tab === "sales-invoice-create") { onCreateInvoice(); return; }
    (onQuickCreate ?? setActiveTab)(tab);
  };
  const navigateTo = (tab: string) => { setIsCreateMenuOpen(false); setActiveTab(tab); };

  const renderSubnav = (items: SubItem[], groupClass = "") => (
    <div className={`sb3-subnav ${groupClass}`}>
      {items.map(item => {
        const Icon = item.icon;
        const active = activeTab === item.id || (item.id === "sales-invoices" && activeTab.startsWith("sales-invoice"));
        return (
          <button
            key={item.id}
            className={`sb3-subnav-item ${active ? "active" : ""}`}
            onClick={() => navigateTo(item.id)}
            type="button"
          >
            {Icon && <Icon size={15} />}
            <span>{item.label}</span>
            {item.badge && <b className="sb3-badge">{item.badge}</b>}
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
      <div key={item.id} className="sb3-nav-item-wrap">
        <button
          className={`sb3-nav-item ${isActive ? "active" : ""}`}
          onClick={() => {
            if (itemIsParties) navigateTo("parties");
            else if (itemIsSales) navigateTo("sales-invoices");
            else if (itemIsPurchases) navigateTo("purchases");
            else navigateTo(item.id);
          }}
          type="button"
          title={collapsed ? item.label : undefined}
        >
          <span className="sb3-nav-left">
            <span className="sb3-nav-icon-wrap"><Icon size={18} /></span>
            {!collapsed && <span className="sb3-nav-label">{item.label}</span>}
          </span>
          {item.hasArrow && !collapsed && (isActive ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}
          {isActive && <span className="sb3-active-pill" />}
        </button>

        {!collapsed && itemIsParties && isPartiesActive && renderSubnav(visiblePartyItems)}
        {!collapsed && itemIsItems && isItemsActive && (
          <div className="sb3-subnav">
            {hasPermission("items") && (
              <button className={`sb3-subnav-item ${activeTab === "items" ? "active" : ""}`} onClick={() => navigateTo("items")} type="button">
                <Package size={15} /><span>Inventory</span>
              </button>
            )}
            {hasPermission("stock") && (
              <button className={`sb3-subnav-item ${activeTab === "godown" ? "active" : ""}`} onClick={() => navigateTo("godown")} type="button">
                <Warehouse size={15} /><span>Godown</span>
              </button>
            )}
          </div>
        )}
        {!collapsed && itemIsSales && isSalesActive && renderSubnav(visibleSalesItems, "sales-subnav")}
        {!collapsed && itemIsPurchases && isPurchasesActive && renderSubnav(visiblePurchaseItems, "sales-subnav")}
      </div>
    );
  };

  const renderFlatItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`sb3-nav-item ${activeTab === item.id ? "active" : ""}`}
        onClick={() => navigateTo(item.id)}
        type="button"
        title={collapsed ? item.label : undefined}
      >
        <span className="sb3-nav-left">
          <span className="sb3-nav-icon-wrap"><Icon size={18} /></span>
          {!collapsed && <span className="sb3-nav-label">{item.label}</span>}
        </span>
        {activeTab === item.id && <span className="sb3-active-pill" />}
      </button>
    );
  };

  return (
    <aside className={`sb3 ${collapsed ? "sb3--collapsed" : ""}`} aria-label="Main navigation">

      {/* Brand */}
      <div className="sb3-brand">
        <div className="sb3-avatar">
          {initialsForBusiness(businessName)}
          <span className="sb3-avatar-ring" />
        </div>
        {!collapsed && (
          <div className="sb3-brand-info">
            <span className="sb3-brand-name">{businessName}</span>
            <span className="sb3-brand-phone">{businessPhone}</span>
          </div>
        )}
        <button
          className="sb3-collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronRight size={14} className={collapsed ? "" : "flipped"} />
        </button>
      </div>

      {/* Quick Create */}
      <div className="sb3-create-wrap" ref={quickCreateRef}>
        <div className={`sb3-create-btn-row ${isCreateMenuOpen ? "open" : ""}`}>
          <button
            className="sb3-create-main"
            onClick={handleMainCreateInvoice}
            disabled={!canCreateSalesInvoice}
            title={canCreateSalesInvoice ? "New Sales Invoice" : "Read-only access"}
            type="button"
          >
            <Plus size={16} />
            {!collapsed && <span>{canCreateSalesInvoice ? "New Invoice" : "Read Only"}</span>}
          </button>
          {!collapsed && (
            <button
              className="sb3-create-toggle"
              onClick={() => setIsCreateMenuOpen(c => !c)}
              disabled={visibleQuickCreateItems.length === 0}
              type="button"
              aria-expanded={isCreateMenuOpen}
            >
              <ChevronDown size={15} />
            </button>
          )}
        </div>

        {isCreateMenuOpen && visibleQuickCreateItems.length > 0 && (
          <div className="sb3-create-menu" role="menu">
            <div className="sb3-create-menu-head">
              <span>Quick Create</span>
              <button onClick={() => setIsCreateMenuOpen(false)} type="button"><X size={14} /></button>
            </div>
            <div className="sb3-create-menu-grid">
              {visibleQuickCreateItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleQuickCreate(item.tab)}
                    role="menuitem"
                    type="button"
                    className="sb3-create-menu-item"
                    style={{ "--item-color": item.color } as React.CSSProperties}
                  >
                    <span className="sb3-qc-icon"><Icon size={16} /></span>
                    <span className="sb3-qc-text">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sb3-nav">
        {!collapsed && <div className="sb3-section-label">General</div>}
        {visibleNavItems.map(renderNavItem)}

        {visibleAccountingItems.length > 0 && (
          <>
            {!collapsed ? (
              <button
                className="sb3-section-label-btn"
                onClick={() => setIsAccountingExpanded(!isAccountingExpanded)}
                type="button"
              >
                <span>Accounting</span>
                {isAccountingExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            ) : (
              <div className="sb3-section-divider" />
            )}
            {(!collapsed ? isAccountingExpanded : true) && visibleAccountingItems.map(renderFlatItem)}
          </>
        )}

        {visibleBusinessItems.length > 0 && (
          <>
            {!collapsed ? (
              <button
                className="sb3-section-label-btn"
                onClick={() => setIsBusinessExpanded(!isBusinessExpanded)}
                type="button"
              >
                <span>Business Tools</span>
                {isBusinessExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            ) : (
              <div className="sb3-section-divider" />
            )}
            {(!collapsed ? isBusinessExpanded : true) && visibleBusinessItems.map(renderFlatItem)}
          </>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="sb3-bottom">
        {canViewSettings && (
          <button
            className={`sb3-nav-item sb3-settings ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => navigateTo("settings")}
            type="button"
            title={collapsed ? "Settings" : undefined}
          >
            <span className="sb3-nav-left">
              <span className="sb3-nav-icon-wrap"><Settings size={18} /></span>
              {!collapsed && <span className="sb3-nav-label">Settings</span>}
            </span>
          </button>
        )}

        <button
          className="sb3-nav-item sb3-logout"
          onClick={() => { setIsCreateMenuOpen(false); onLogout(); }}
          type="button"
          title={collapsed ? "Logout" : undefined}
        >
          <span className="sb3-nav-left">
            <span className="sb3-nav-icon-wrap"><LogOut size={18} /></span>
            {!collapsed && <span className="sb3-nav-label">Logout</span>}
          </span>
        </button>

        {!collapsed && (
          <div className="sb3-footer">
            <span><Shield size={12} /> 100% Secure</span>
            <span className="sb3-footer-dot" />
            <span>ISO Certified</span>
          </div>
        )}
      </div>
    </aside>
  );
}
