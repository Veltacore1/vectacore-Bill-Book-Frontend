import type { Staff, StaffPayrollReport, StaffPayrollRow } from "../types";
import { apiFetch, roundMoney } from "./core";

export async function createStaffMember(input: {
  name: string;
  phone: string;
  designation: string;
  salary: number;
}) {
  const data = await apiFetch<any>("/staff/directory/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone || null,
      designation: input.designation,
      monthly_salary: roundMoney(input.salary)
    })
  });

  return {
    id: data.id,
    name: data.name,
    designation: data.designation || "",
    salary: Number(data.monthly_salary),
    attendance: {}
  } satisfies Staff;
}

export async function markStaffAttendance(input: {
  date: string;
  records: Array<{ staffId: string; status: "present" | "absent" | "half_day" }>;
}) {
  return apiFetch<any>("/staff/attendance/bulk_mark/", {
    method: "POST",
    body: JSON.stringify({
      date: input.date,
      records: input.records.map(record => ({
        staff_id: record.staffId,
        status: record.status
      }))
    })
  });
}

export async function getStaffPayrollReport(input: { month: number; year: number }) {
  const params = new URLSearchParams({
    month: String(input.month),
    year: String(input.year)
  });
  const response = await apiFetch<{ data: StaffPayrollReport }>(`/staff/payroll/monthly_report/?${params.toString()}`);
  return response.data;
}

export async function generateStaffPayroll(input: { month: number; year: number }) {
  const response = await apiFetch<{ data: StaffPayrollReport }>("/staff/payroll/generate_monthly/", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.data;
}

export async function markStaffPayrollPaid(input: { payrollId: string; paymentDate?: string; notes?: string }) {
  const response = await apiFetch<{ data: StaffPayrollRow }>(`/staff/payroll/${input.payrollId}/mark_paid/`, {
    method: "POST",
    body: JSON.stringify({
      payment_date: input.paymentDate,
      notes: input.notes
    })
  });
  return response.data;
}
