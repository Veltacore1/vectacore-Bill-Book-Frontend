import { CalendarCheck } from "lucide-react";
import type { Staff } from "../types";

interface StaffAttendanceProps {
  staffList: Staff[];
  onAttendanceChange: (staffId: string, date: string, status: "present" | "absent" | "half_day") => void;
}

export default function StaffAttendance({ staffList, onAttendanceChange }: StaffAttendanceProps) {
  const currentDate = new Date().toISOString().split("T")[0];

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", gap: "6.5px", alignItems: "center" }}>
          <CalendarCheck size={16} style={{ color: "#2e7d32" }} />
          <span style={{ fontSize: "13px", fontWeight: "600", color: "#1a1a2e" }}>
            Daily Attendance Log for Weaver Looms: <strong>{currentDate}</strong>
          </span>
        </div>
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Staff / Weaver Name</th>
              <th>Designation</th>
              <th>Base Salary (Monthly)</th>
              <th>Attendance Status ({currentDate})</th>
              <th>Actions / Logs</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map(member => {
              const status = member.attendance[currentDate] || "absent";
              return (
                <tr key={member.id}>
                  <td><strong>{member.name}</strong></td>
                  <td><span className="chip chip-gray">{member.designation}</span></td>
                  <td>₹ {member.salary.toLocaleString("en-IN")}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className={`btn ${status === "present" ? "btn-green" : "btn-outline"}`}
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => onAttendanceChange(member.id, currentDate, "present")}
                      >
                        Present
                      </button>
                      <button
                        className={`btn ${status === "half_day" ? "btn-green" : "btn-outline"}`}
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => onAttendanceChange(member.id, currentDate, "half_day")}
                      >
                        Half Day
                      </button>
                      <button
                        className={`btn ${status === "absent" ? "btn-green" : "btn-outline"}`}
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={() => onAttendanceChange(member.id, currentDate, "absent")}
                      >
                        Absent
                      </button>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: "11px", color: "#666" }}>
                      Total presents this cycle: {Object.values(member.attendance).filter(v => v === "present").length}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
