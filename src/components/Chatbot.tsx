import React, { useState, useEffect, useRef } from "react";
import { 
  Bot, 
  Send, 
  X, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  Users, 
  Landmark, 
  FileText,
  UserCheck
} from "lucide-react";
import type { SalesInvoice, Party, Item, AccountingData, Staff } from "../types";

interface ChatbotProps {
  invoices: SalesInvoice[];
  parties: Party[];
  items: Item[];
  accounting: AccountingData;
  staff: Staff[];
  businessName: string;
}

interface Message {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: Date;
  structuredData?: {
    type: "metrics" | "list" | "table";
    title?: string;
    items?: Array<{ label: string; value: string | number; sub?: string }>;
    headers?: string[];
    rows?: Array<string[]>;
  };
}

const normalizeText = (value: string) => value.trim().toLowerCase();

const categoryToken = (item: Item) => normalizeText(item.category || "");
const colorToken = (item: Item) => normalizeText(item.color || "");
const itemCodeToken = (item: Item) => normalizeText(item.itemCode || "");
const itemNameToken = (item: Item) => normalizeText(item.name);

export default function Chatbot({
  invoices,
  parties,
  items,
  accounting,
  staff,
  businessName
}: ChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Initial greeting
  useEffect(() => {
    setMessages([
      {
        id: "welcome",
        sender: "bot",
        text: `Hello. I am your VastraBook assistant for ${businessName}. Ask about sales, stock, customers, item code, category, color, or offers from the data currently loaded in your workspace.`,
        timestamp: new Date()
      }
    ]);
  }, [businessName]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleSend = (textToSend?: string) => {
    const input = textToSend || query;
    if (!input.trim()) return;

    // Add user message
    const userMsg: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setQuery("");

    // Process query after a brief delay
    setTimeout(() => {
      const response = processBotQuery(input);
      setMessages(prev => [...prev, response]);
    }, 400);
  };

  const processBotQuery = (rawQuery: string): Message => {
    const q = rawQuery.toLowerCase();
    const normalizedQuery = normalizeText(rawQuery);
    const activeOffers = items
      .filter(item => item.activeOffer && item.activeOffer.status === "active")
      .map(item => item.activeOffer!);
    const knownCategories = [...new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))];
    const knownColors = [...new Set(items.map(item => item.color).filter((value): value is string => Boolean(value)))];
    const matchedCategory = knownCategories.find(category => normalizedQuery.includes(normalizeText(category)));
    const matchedColor = knownColors.find(color => normalizedQuery.includes(normalizeText(color)));
    const matchedItem = items.find(item => (
      (itemCodeToken(item) && normalizedQuery.includes(itemCodeToken(item))) ||
      (itemNameToken(item) && normalizedQuery.includes(itemNameToken(item)))
    ));

    if (matchedItem) {
      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `Here is the item detail for ${matchedItem.name}:`,
        timestamp: new Date(),
        structuredData: {
          type: "list",
          title: "Item Snapshot",
          items: [
            { label: "Item Code", value: matchedItem.itemCode || "Not set" },
            { label: "Category", value: matchedItem.category || "General" },
            { label: "Color", value: matchedItem.color || "Standard" },
            { label: "Stock", value: `${matchedItem.stock ?? 0} PCS` },
            { label: "Selling Price", value: `₹${(matchedItem.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` },
            { label: "MRP", value: `₹${(matchedItem.mrp || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` },
            { label: "Godown", value: matchedItem.godown || "-" }
          ]
        }
      };
    }

    // Item catalogue — list items with their code / category / color / stock / price.
    // Triggered by "item code", "item list", "show items", "catalogue", "product list", etc.
    const wantsItemCatalogue =
      q.includes("item code") || q.includes("itemcode") ||
      q.includes("item detail") || q.includes("item list") ||
      q.includes("list item") || q.includes("all item") ||
      q.includes("show item") || q.includes("show all") ||
      q.includes("catalog") || q.includes("product list") ||
      q.includes("list product") || q.includes("all product");

    if (wantsItemCatalogue && items.length > 0) {
      let scoped = items;
      let scopeLabel = "All items";
      if (matchedCategory) {
        scoped = items.filter(item => categoryToken(item) === normalizeText(matchedCategory));
        scopeLabel = `Category: ${matchedCategory}`;
      } else if (matchedColor) {
        scoped = items.filter(item => colorToken(item) === normalizeText(matchedColor));
        scopeLabel = `Color: ${matchedColor}`;
      }
      const maxRows = 25;
      const rows = scoped.slice(0, maxRows).map(item => [
        item.name,
        item.itemCode || "-",
        item.category || "-",
        item.color || "-",
        `${item.stock ?? 0}`,
        `₹${(item.price || 0).toLocaleString("en-IN")}`
      ]);
      const truncated = scoped.length > maxRows ? ` (showing ${maxRows} of ${scoped.length})` : "";
      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `Item code & category details — ${scopeLabel}${truncated}:`,
        timestamp: new Date(),
        structuredData: {
          type: "table",
          title: "Item Catalogue",
          headers: ["Name", "Code", "Category", "Color", "Stock", "Price"],
          rows
        }
      };
    }

    if (matchedCategory || q.includes("category")) {
      const categoryName = matchedCategory || knownCategories[0];
      const categoryItems = items.filter(item => categoryToken(item) === normalizeText(categoryName || ""));
      if (categoryName && categoryItems.length > 0) {
        const totalStock = categoryItems.reduce((sum, item) => sum + (item.stock || 0), 0);
        const stockValue = categoryItems.reduce((sum, item) => sum + ((item.stock || 0) * (item.purchasePrice || 0)), 0);
        return {
          id: Math.random().toString(),
          sender: "bot",
          text: `Category view for ${categoryName}:`,
          timestamp: new Date(),
          structuredData: {
            type: "metrics",
            title: "Category Summary",
            items: [
              { label: "Products", value: categoryItems.length },
              { label: "Total Stock", value: totalStock },
              { label: "Stock Value", value: `₹${stockValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` },
              { label: "Colors", value: new Set(categoryItems.map(item => item.color || "Standard")).size }
            ]
          }
        };
      }
    }

    if (matchedColor || q.includes("color") || q.includes("colour")) {
      const colorName = matchedColor || knownColors[0];
      const colorItems = items.filter(item => colorToken(item) === normalizeText(colorName || ""));
      if (colorName && colorItems.length > 0) {
        return {
          id: Math.random().toString(),
          sender: "bot",
          text: `Found ${colorItems.length} item(s) in ${colorName}:`,
          timestamp: new Date(),
          structuredData: {
            type: "list",
            title: "Color-wise Items",
            items: colorItems.slice(0, 10).map(item => ({
              label: item.name,
              value: item.itemCode || "No code",
              sub: `Stock: ${item.stock ?? 0} | Category: ${item.category || "General"} | Price: ₹${item.price || 0}`
            }))
          }
        };
      }
    }

    if (q.includes("offer") || q.includes("discount") || q.includes("scheme")) {
      if (activeOffers.length === 0) {
        return {
          id: Math.random().toString(),
          sender: "bot",
          text: "There are no active item offers in the current workspace data.",
          timestamp: new Date()
        };
      }
      return {
        id: Math.random().toString(),
        sender: "bot",
        text: "Here are the active offers running now:",
        timestamp: new Date(),
        structuredData: {
          type: "list",
          title: "Active Offers",
          items: activeOffers.slice(0, 10).map(offer => ({
            label: offer.itemName,
            value: `${offer.discountType === "percent" ? `${offer.discountValue}%` : `₹${offer.discountValue}`} off`,
            sub: `Offer price: ₹${offer.offerPrice} | Code: ${offer.itemCode || "-"}`
          }))
        }
      };
    }

    // 1. Sales & Revenue Queries
    if (q.includes("sale") || q.includes("revenue") || q.includes("turnover") || q.includes("invoice") || q.includes("billing")) {
      const totalAmt = invoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
      const paidInvoices = invoices.filter(inv => inv.status?.toLowerCase() === "paid").length;
      const unpaidInvoices = invoices.length - paidInvoices;

      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `Here is the current sales summary for **${businessName}** fetched from your records:`,
        timestamp: new Date(),
        structuredData: {
          type: "metrics",
          title: "Sales Report Summary",
          items: [
            { label: "Total Revenue", value: `₹${totalAmt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` },
            { label: "Total Invoices", value: invoices.length },
            { label: "Fully Paid Bills", value: paidInvoices },
            { label: "Unpaid / Pending Bills", value: unpaidInvoices }
          ]
        }
      };
    }

    // 2. Inventory & Stock Queries
    if (q.includes("item") || q.includes("stock") || q.includes("inventory") || q.includes("saree") || q.includes("product")) {
      const lowStockItems = items.filter(item => (item.stock ?? 0) <= 10);
      const totalItemsCount = items.length;

      if (q.includes("low") || q.includes("shortage") || q.includes("alert")) {
        if (lowStockItems.length === 0) {
          return {
            id: Math.random().toString(),
            sender: "bot",
            text: "Great news! All items in your inventory currently have sufficient stock levels (above 10 units).",
            timestamp: new Date()
          };
        }
        return {
          id: Math.random().toString(),
          sender: "bot",
          text: `Found **${lowStockItems.length}** items with low stock (10 units or less):`,
          timestamp: new Date(),
          structuredData: {
            type: "list",
            title: "Low Stock Alert",
            items: lowStockItems.map(item => ({
              label: item.name,
              value: `${item.stock ?? 0} units`,
              sub: `Category: ${item.category || "General"} | Price: ₹${item.price || 0}`
            }))
          }
        };
      }

      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `You have **${totalItemsCount}** items registered in inventory:`,
        timestamp: new Date(),
        structuredData: {
          type: "metrics",
          title: "Inventory Status",
          items: [
            { label: "Total Products", value: totalItemsCount },
            { label: "Low Stock Items", value: lowStockItems.length },
            { label: "Total Godowns", value: 2 }
          ]
        }
      };
    }

    // 3. Parties & Receivables Queries
    if (q.includes("party") || q.includes("parties") || q.includes("customer") || q.includes("supplier") || q.includes("owe") || q.includes("ledger") || q.includes("balance")) {
      const customers = parties.filter(p => p.type === "customer");
      const suppliers = parties.filter(p => p.type === "supplier");
      const outstandingReceivables = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
      const outstandingPayables = suppliers.reduce((sum, s) => sum + (s.balance || 0), 0);

      if (q.includes("customer") || q.includes("receivable") || q.includes("owe")) {
        const debitCustomers = customers.filter(c => (c.balance || 0) > 0);
        return {
          id: Math.random().toString(),
          sender: "bot",
          text: `Found **${debitCustomers.length}** customers with pending receivables:`,
          timestamp: new Date(),
          structuredData: {
            type: "list",
            title: "Outstanding Receivables",
            items: debitCustomers.map(c => ({
              label: c.name,
              value: `₹${(c.balance || 0).toLocaleString("en-IN")}`,
              sub: `Phone: ${c.mobile}`
            }))
          }
        };
      }

      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `Here is the ledger summary for your customers and suppliers:`,
        timestamp: new Date(),
        structuredData: {
          type: "metrics",
          title: "Ledgers & Receivables",
          items: [
            { label: "Total Customers", value: customers.length },
            { label: "Total Suppliers", value: suppliers.length },
            { label: "Total Receivables (Customers)", value: `₹${outstandingReceivables.toLocaleString("en-IN")}` },
            { label: "Total Payables (Suppliers)", value: `₹${outstandingPayables.toLocaleString("en-IN")}` }
          ]
        }
      };
    }

    // 4. Cash and Bank Balances
    if (q.includes("bank") || q.includes("cash") || q.includes("balance") || q.includes("account")) {
      const accounts = accounting.bankAccounts || [];

      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `Loaded **${accounts.length}** active cash/bank ledger accounts:`,
        timestamp: new Date(),
        structuredData: {
          type: "list",
          title: "Accounts Overview",
          items: accounts.map(acc => ({
            label: acc.name,
            value: `₹${(acc.balance || 0).toLocaleString("en-IN")}`,
            sub: `${acc.bankName || "Cash Account"} | A/c No: ${acc.accountNumber || "N/A"}`
          }))
        }
      };
    }

    // 5. Staff Payroll & Attendance Queries
    if (q.includes("staff") || q.includes("employee") || q.includes("payroll") || q.includes("salary") || q.includes("attendance")) {
      return {
        id: Math.random().toString(),
        sender: "bot",
        text: `Here are the details for your showroom staff members:`,
        timestamp: new Date(),
        structuredData: {
          type: "list",
          title: "Staff Directory",
          items: staff.map(member => ({
            label: member.name,
            value: (member.designation || "Staff").toUpperCase(),
            sub: `Monthly Salary: ₹${member.salary || 0}`
          }))
        }
      };
    }

    // 6. Help / Default
    return {
      id: Math.random().toString(),
      sender: "bot",
      text: "I didn't quite catch that. You can ask me query keywords about your business metrics like:\n\n" +
            "• **'sales'** (revenue, total invoices, payment status)\n" +
            "• **'stock'** / **'low stock'** (inventory count, shortages)\n" +
            "• **'customers'** (receivables, supplier balances)\n" +
            "• **'item code'** / item name (exact product snapshot)\n" +
            "• **'category'** / **'color'** (category-wise or color-wise products)\n" +
            "• **'offers'** (active discounts)\n" +
            "• **'bank'** (cash/bank ledger balances)\n" +
            "• **'staff'** (employee directory and salary details)",
      timestamp: new Date()
    };
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button 
        className={`cb-float-btn ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(prev => !prev)}
        type="button"
        aria-label="Assistant helper"
      >
        {isOpen ? <X size={20} /> : <Bot size={22} />}
        {!isOpen && <span className="cb-pulse-ring" />}
      </button>

      {/* Chat Drawer */}
      {isOpen && (
        <div className="cb-panel">
          <div className="cb-header">
            <div className="cb-header-left">
              <div className="cb-icon-gem"><Sparkles size={16} /></div>
              <div>
                <h3>VastraBook AI</h3>
                <span>Workspace Data Assistant</span>
              </div>
            </div>
            <button className="cb-close" onClick={() => setIsOpen(false)} type="button">
              <X size={18} />
            </button>
          </div>

          {/* Messages Feed */}
          <div className="cb-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`cb-bubble-wrap ${msg.sender}`}>
                <div className="cb-bubble">
                  <p>{msg.text}</p>
                  
                  {/* Structured response views */}
                  {msg.structuredData && (
                    <div className="cb-struct">
                      <div className="cb-struct-title">{msg.structuredData.title}</div>
                      
                      {msg.structuredData.type === "metrics" && (
                        <div className="cb-struct-metrics">
                          {msg.structuredData.items?.map((item, idx) => (
                            <div key={idx} className="cb-metric-item">
                              <span className="cb-metric-lbl">{item.label}</span>
                              <strong className="cb-metric-val">{item.value}</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.structuredData.type === "list" && (
                        <div className="cb-struct-list">
                          {msg.structuredData.items?.map((item, idx) => (
                            <div key={idx} className="cb-list-item">
                              <div className="cb-list-row">
                                <span className="cb-list-label">{item.label}</span>
                                <strong className="cb-list-val">{item.value}</strong>
                              </div>
                              {item.sub && <small className="cb-list-sub">{item.sub}</small>}
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.structuredData.type === "table" && (
                        <div className="cb-struct-table">
                          <table>
                            <thead>
                              <tr>
                                {msg.structuredData.headers?.map((header, idx) => (
                                  <th key={idx}>{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {msg.structuredData.rows?.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx}>{cell}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="cb-time">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Queries Suggestion List */}
          <div className="cb-quick-chips">
            <button type="button" onClick={() => handleSend("Show sales summary")}>
              <TrendingUp size={12} /> Sales
            </button>
            <button type="button" onClick={() => handleSend("Show low stock items")}>
              <AlertTriangle size={12} /> Low Stock
            </button>
            <button type="button" onClick={() => handleSend("Show item code and category details")}>
              <FileText size={12} /> Item List
            </button>
            <button type="button" onClick={() => handleSend("Show category summary")}>
              <FileText size={12} /> Category
            </button>
            <button type="button" onClick={() => handleSend("Show color wise items")}>
              <FileText size={12} /> Color
            </button>
            <button type="button" onClick={() => handleSend("List pending customer receivables")}>
              <Users size={12} /> Receivables
            </button>
            <button type="button" onClick={() => handleSend("Check bank balances")}>
              <Landmark size={12} /> Bank A/cs
            </button>
            <button type="button" onClick={() => handleSend("Show my staff directory")}>
              <UserCheck size={12} /> Staff
            </button>
          </div>

          {/* Input Box */}
          <form 
            className="cb-input-area" 
            onSubmit={event => { event.preventDefault(); handleSend(); }}
          >
            <input
              type="text"
              placeholder="Ask about item code, category, color, stock, offers..."
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <button type="submit" disabled={!query.trim()} aria-label="Send query">
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
