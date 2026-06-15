import type { Party, PartyLedgerEntry, SharedLedgerPortalData, SharedLedgerRow } from "../types";
import { apiFetch, publicApiFetch } from "./core";

type PartyUpsertInput = {
  id?: string;
  name: string;
  mobile: string;
  type: "customer" | "supplier";
  balance: number;
  category?: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  creditLimit?: number;
  creditDays?: number;
};

function mapParty(data: any, fallbackBalance = 0): Party {
  return {
    id: data.id,
    name: data.name,
    mobile: data.mobile || "-",
    type: data.party_type === "supplier" ? "supplier" : "customer",
    balance: Number(data.net_balance ?? fallbackBalance),
    opening_balance_type: data.opening_balance_type,
    state: data.state || "",
    category: data.category_details?.name || "-",
    email: data.email || "",
    gstin: data.gstin || "",
    address: data.address || "",
    city: data.city || "",
    pincode: data.pincode || "",
    creditLimit: data.credit_limit === null || data.credit_limit === undefined ? undefined : Number(data.credit_limit),
    creditDays: data.credit_days === null || data.credit_days === undefined ? undefined : Number(data.credit_days),
    sharedLedgerToken: data.shared_ledger_token || ""
  };
}

async function resolvePartyCategoryId(name?: string) {
  const cleanName = (name || "").trim();
  if (!cleanName || cleanName === "-") return null;

  const categories = await apiFetch<any[]>("/parties/categories/");
  const match = categories.find(category => category.name.toLowerCase() === cleanName.toLowerCase());
  if (match) return match.id;

  const created = await apiFetch<any>("/parties/categories/", {
    method: "POST",
    body: JSON.stringify({ name: cleanName })
  });
  return created.id;
}

async function partyPayload(input: PartyUpsertInput) {
  const openingBalanceType = input.type === "supplier" ? "credit" : "debit";
  const categoryId = await resolvePartyCategoryId(input.category);
  return {
    name: input.name,
    mobile: input.mobile || null,
    email: input.email || null,
    gstin: input.gstin || null,
    address: input.address || null,
    city: input.city || null,
    state: input.state || "Tamil Nadu",
    pincode: input.pincode || null,
    party_type: input.type,
    category: categoryId,
    opening_balance: Math.abs(input.balance),
    opening_balance_type: openingBalanceType,
    credit_limit: input.creditLimit ?? null,
    credit_days: input.creditDays ?? null
  };
}

export async function createParty(input: PartyUpsertInput) {
  const data = await apiFetch<any>("/parties/parties/", {
    method: "POST",
    body: JSON.stringify(await partyPayload(input))
  });

  return mapParty(data, input.balance);
}

export async function updateParty(input: PartyUpsertInput & { id: string }) {
  const data = await apiFetch<any>(`/parties/parties/${input.id}/`, {
    method: "PATCH",
    body: JSON.stringify(await partyPayload(input))
  });

  return mapParty(data, input.balance);
}

export async function deleteParty(partyId: string) {
  await apiFetch<Record<string, never>>(`/parties/parties/${partyId}/`, {
    method: "DELETE"
  });
}

export async function getPartyLedger(partyId: string) {
  const data = await apiFetch<{ party: any; ledger: PartyLedgerEntry[] }>(`/parties/parties/${partyId}/ledger_statement/`);
  return {
    party: mapParty(data.party),
    ledger: data.ledger.map(row => ({
      date: row.date,
      type: row.type,
      number: row.number,
      description: row.description,
      debit: Number(row.debit),
      credit: Number(row.credit),
      amount: Number(row.amount ?? 0),
      status: row.status || "",
      balance: Number(row.balance)
    }))
  };
}

export async function generateSharedLedger(partyId: string) {
  const data = await apiFetch<{ url: string; shared_ledger_token: string; summary?: unknown; party?: unknown }>(`/parties/parties/${partyId}/generate_shared_ledger/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return data;
}

export async function getSharedLedgers() {
  return apiFetch<{ rows: SharedLedgerRow[]; summary: { linkedParties: number; transactions: number; viewOnlyMode: boolean } }>("/parties/parties/shared-ledgers/");
}

export async function getSharedLedgerPortal(token: string): Promise<SharedLedgerPortalData> {
  const data = await publicApiFetch<SharedLedgerPortalData>(`/parties/shared-ledger/${encodeURIComponent(token)}/`);
  return {
    ...data,
    party: mapParty(data.party),
    ledger: data.ledger.map(row => ({
      ...row,
      debit: Number(row.debit),
      credit: Number(row.credit),
      amount: Number(row.amount ?? 0),
      balance: Number(row.balance)
    }))
  };
}
