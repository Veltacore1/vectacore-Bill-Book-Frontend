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
  const utilityActions = [
    { label: "Mobile Sync", icon: Smartphone },
    { label: "Print Settings", icon: Printer },
    { label: "Refer & Earn", icon: Gift, className: "topbar-icon topbar-icon-accent" },
    { label: "Help Support", icon: HelpCircle },
    { label: "Notifications", icon: Bell },
    { label: "Minimize Window", icon: Minimize2 }
  ];

  return (
    <div className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        {utilityActions.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              className={action.className || "topbar-icon"}
              title={`${action.label} coming soon`}
              aria-label={`${action.label} coming soon`}
              disabled
              type="button"
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
