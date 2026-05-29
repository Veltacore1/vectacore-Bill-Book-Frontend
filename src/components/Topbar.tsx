
import {
  Printer,
  HelpCircle,
  Gift,
  Bell,
  Smartphone,
  Minimize2
} from "lucide-react";

interface TopbarProps {
  title: string;
}

export default function Topbar({ title }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        {/* Help & Utility Icons wrapped in spans for HTML title tooltips */}
        <span className="topbar-icon" title="Mobile Sync" style={{ display: "inline-flex", alignItems: "center" }}>
          <Smartphone size={16} />
        </span>
        <span className="topbar-icon" title="Print Settings" style={{ display: "inline-flex", alignItems: "center" }}>
          <Printer size={16} />
        </span>
        <span className="topbar-icon" title="Refer & Earn" style={{ display: "inline-flex", alignItems: "center", color: "#e53935" }}>
          <Gift size={16} />
        </span>
        <span className="topbar-icon" title="Help Support" style={{ display: "inline-flex", alignItems: "center" }}>
          <HelpCircle size={16} />
        </span>
        <span className="topbar-icon" title="Notifications" style={{ display: "inline-flex", alignItems: "center" }}>
          <Bell size={16} />
        </span>
        <span className="topbar-icon" title="Minimize Window" style={{ display: "inline-flex", alignItems: "center" }}>
          <Minimize2 size={16} />
        </span>
      </div>
    </div>
  );
}
