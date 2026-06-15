import type { ReportDefinition } from "../types";
import { apiFetch, apiText, apiBlob, roundMoney, paymentModeToApi } from "./core";

export type ReportsQuery = {
  dateRange?: string;
  from?: string;
  to?: string;
  partyId?: string;
  itemId?: string;
};

export type ReportDirectoryOption = {
  id: string;
  name: string;
  type?: string;
  code?: string;
};

export type ReportExportFormat = "csv" | "excel" | "pdf";

export type ReportShareReceipt = {
  id: string;
  reportId: string;
  reportName: string;
  recipient: string;
  status: "prepared" | "sent" | "failed";
  shareToken: string;
  createdAt: string;
};

function buildReportsParams(filters: ReportsQuery = {}) {
  const params = new URLSearchParams();
  if (filters.dateRange) params.set("date_range", filters.dateRange);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.partyId) params.set("party", filters.partyId);
  if (filters.itemId) params.set("item", filters.itemId);
  return params;
}

export async function getReports(filters: ReportsQuery = {}) {
  const query = buildReportsParams(filters).toString();

  return apiFetch<{
    reports: ReportDefinition[];
    dateRanges: string[];
    activeFilters?: Record<string, string>;
    generatedAt?: string;
    parties?: ReportDirectoryOption[];
    items?: ReportDirectoryOption[];
  }>(`/accounting/reports/${query ? `?${query}` : ""}`);
}

export async function getReportExportHtml(reportId: string, filters: ReportsQuery = {}) {
  const params = buildReportsParams(filters);
  params.set("report", reportId);
  params.set("export_format", "html");
  return apiText(`/accounting/reports/export/?${params.toString()}`);
}

export async function getReportExportFile(reportId: string, format: ReportExportFormat, filters: ReportsQuery = {}) {
  const params = buildReportsParams(filters);
  params.set("report", reportId);
  params.set("export_format", format);
  const extension = format === "excel" ? "xls" : format;
  const result = await apiBlob(`/accounting/reports/export/?${params.toString()}`);
  return {
    blob: result.blob,
    filename: result.filename === "report-export" ? `${reportId}.${extension}` : result.filename
  };
}

export async function shareReport(reportId: string, recipient: string, filters: ReportsQuery = {}) {
  const params = buildReportsParams(filters);
  params.set("report", reportId);
  const response = await apiFetch<{ share: ReportShareReceipt }>(`/accounting/reports/share/?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      report: reportId,
      recipient
    })
  });
  return response.share;
}

export async function createBankAccount(input: {
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  openingBalance: number;
}) {
  return apiFetch<any>("/accounting/accounts/", {
    method: "POST",
    body: JSON.stringify({
      account_name: input.accountName,
      bank_name: input.bankName,
      account_number: input.accountNumber,
      ifsc_code: input.ifscCode,
      branch: input.branch || null,
      opening_balance: roundMoney(input.openingBalance)
    })
  });
}

export async function createBankTransaction(input: {
  accountId: string;
  transactionType: "deposit" | "withdrawal";
  amount: number;
  description: string;
  referenceNumber?: string;
}) {
  return apiFetch<any>("/accounting/transactions/", {
    method: "POST",
    body: JSON.stringify({
      bank_account: input.accountId,
      transaction_type: input.transactionType,
      amount: roundMoney(input.amount),
      description: input.description || "Manual cash and bank adjustment",
      reference_number: input.referenceNumber || null
    })
  });
}

export async function transferMoney(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  referenceNumber?: string;
}) {
  return apiFetch<any>("/accounting/accounts/transfer/", {
    method: "POST",
    body: JSON.stringify({
      from_account: input.fromAccountId,
      to_account: input.toAccountId,
      amount: roundMoney(input.amount),
      description: input.description || "Cash and bank transfer",
      reference_number: input.referenceNumber || null
    })
  });
}

export async function createExpense(input: {
  category: string;
  amount: number;
  paidAmount: number;
  paymentMode: string;
  referenceNumber?: string;
  notes: string;
}) {
  return apiFetch<any>("/accounting/expenses/", {
    method: "POST",
    body: JSON.stringify({
      expense_category: input.category,
      total_amount: roundMoney(input.amount),
      paid_amount: roundMoney(input.paidAmount),
      payment_mode: paymentModeToApi(input.paymentMode),
      reference_number: input.referenceNumber || null,
      notes: input.notes || "Created from expense workspace"
    })
  });
}

export async function createAutomatedBill(input: {
  name: string;
  amount: number;
  frequency: string;
  nextDueDate: string;
}) {
  return apiFetch<any>("/accounting/recurring-bills/", {
    method: "POST",
    body: JSON.stringify({
      bill_name: input.name,
      amount: roundMoney(input.amount),
      frequency: input.frequency,
      next_due_date: input.nextDueDate
    })
  });
}
