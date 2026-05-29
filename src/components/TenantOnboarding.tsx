import { useState, type FormEvent } from "react";
import { Building2, Database, LogIn, ShieldCheck } from "lucide-react";
import { isDemoSessionAvailable, registerTextileTenant, startDemoSession } from "../api";

type TenantOnboardingProps = {
  onReady: () => Promise<void>;
};

const initialForm = {
  businessName: "",
  ownerName: "",
  mobile: "",
  email: "",
  gstin: "",
  state: "Tamil Nadu",
  city: "",
  pincode: "",
  address: "",
  invoicePrefix: "",
  password: ""
};

export default function TenantOnboarding({ onReady }: TenantOnboardingProps) {
  const [form, setForm] = useState(initialForm);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canUseDemo = isDemoSessionAvailable();

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice("");
    try {
      await registerTextileTenant(form);
      await onReady();
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Tenant could not be registered.");
    } finally {
      setIsSaving(false);
    }
  };

  const openDemo = async () => {
    setIsSaving(true);
    setNotice("");
    try {
      await startDemoSession();
      await onReady();
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Demo workspace could not be opened.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="tenant-onboarding-page">
      <section className="tenant-onboarding-panel">
        <div className="tenant-onboarding-copy">
          <span className="tenant-pill">
            <ShieldCheck size={16} />
            Multi-tenant textile billing
          </span>
          <h1>Start a clean textile workspace</h1>
          <p>
            New businesses start with zero parties, zero items, zero vouchers, and their own isolated Postgres tenant.
          </p>
          <div className="tenant-proof-grid">
            <div>
              <Database size={20} />
              <strong>Postgres-backed</strong>
              <span>No frontend mock ledger.</span>
            </div>
            <div>
              <Building2 size={20} />
              <strong>Tenant isolated</strong>
              <span>Every record is scoped to one business.</span>
            </div>
          </div>
          {canUseDemo && (
            <button className="tenant-demo-btn" onClick={openDemo} disabled={isSaving} type="button">
              <LogIn size={17} />
              Open CSM SILKS demo
            </button>
          )}
        </div>

        <form className="tenant-register-card" onSubmit={submit}>
          <h2>Register Business</h2>
          <label>
            <span>Business name *</span>
            <input value={form.businessName} onChange={event => updateField("businessName", event.target.value)} required />
          </label>
          <label>
            <span>Owner name *</span>
            <input value={form.ownerName} onChange={event => updateField("ownerName", event.target.value)} required />
          </label>
          <div className="tenant-form-row">
            <label>
              <span>Mobile *</span>
              <input value={form.mobile} onChange={event => updateField("mobile", event.target.value)} required />
            </label>
            <label>
              <span>Invoice prefix</span>
              <input value={form.invoicePrefix} onChange={event => updateField("invoicePrefix", event.target.value.toUpperCase())} placeholder="INV" />
            </label>
          </div>
          <label>
            <span>Email</span>
            <input value={form.email} onChange={event => updateField("email", event.target.value)} type="email" />
          </label>
          <div className="tenant-form-row">
            <label>
              <span>GSTIN</span>
              <input value={form.gstin} onChange={event => updateField("gstin", event.target.value.toUpperCase())} />
            </label>
            <label>
              <span>State</span>
              <input value={form.state} onChange={event => updateField("state", event.target.value)} />
            </label>
          </div>
          <div className="tenant-form-row">
            <label>
              <span>City</span>
              <input value={form.city} onChange={event => updateField("city", event.target.value)} />
            </label>
            <label>
              <span>Pincode</span>
              <input value={form.pincode} onChange={event => updateField("pincode", event.target.value)} />
            </label>
          </div>
          <label>
            <span>Address</span>
            <textarea value={form.address} onChange={event => updateField("address", event.target.value)} rows={3} />
          </label>
          <label>
            <span>Password</span>
            <input value={form.password} onChange={event => updateField("password", event.target.value)} type="password" />
          </label>
          {notice && <div className="tenant-onboarding-notice">{notice}</div>}
          <button className="tenant-submit-btn" disabled={isSaving} type="submit">
            {isSaving ? "Creating workspace..." : "Create Clean Workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
