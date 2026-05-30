import { useState, type FormEvent } from "react";
import { Building2, Database, KeyRound, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { isDemoSessionAvailable, registerTextileTenant, sendLoginOtp, startDemoSession, verifyLoginOtp } from "../api";

type TenantOnboardingProps = {
  initialMode?: "login" | "register";
  onReady: () => Promise<void>;
};

type Notice = {
  kind: "success" | "error" | "info";
  text: string;
} | null;

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

export default function TenantOnboarding({ initialMode = "login", onReady }: TenantOnboardingProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState(initialForm);
  const [login, setLogin] = useState({ mobile: "", otp: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canUseDemo = isDemoSessionAvailable();

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setNotice(null);
  };

  const requestOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      const data = await sendLoginOtp({ mobile: login.mobile });
      setOtpSent(true);
      setNotice({
        kind: "success",
        text: data.otp_simulated
          ? `OTP sent. Debug OTP: ${data.otp_simulated}`
          : `OTP sent${data.expiresInMinutes ? `, valid for ${data.expiresInMinutes} minutes` : ""}.`
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "OTP could not be sent." });
    } finally {
      setIsSaving(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      await verifyLoginOtp(login);
      await onReady();
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "OTP could not be verified." });
    } finally {
      setIsSaving(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      await registerTextileTenant(form);
      await onReady();
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Tenant could not be registered." });
    } finally {
      setIsSaving(false);
    }
  };

  const openDemo = async () => {
    setIsSaving(true);
    setNotice(null);
    try {
      await startDemoSession();
      await onReady();
      window.history.replaceState(null, "", "/");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Demo workspace could not be opened." });
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
            VastraBook by Veltacore
          </span>
          <h1>Run every textile counter from one clean book</h1>
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

        <section className="tenant-register-card">
          <div className="tenant-auth-tabs">
            <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} type="button">
              <KeyRound size={16} />
              Login
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} type="button">
              <UserPlus size={16} />
              Register
            </button>
          </div>

          {mode === "login" ? (
            <form className="tenant-auth-form" onSubmit={otpSent ? verifyOtp : requestOtp}>
              <h2>Login to Business</h2>
              <label>
                <span>Mobile number *</span>
                <input
                  value={login.mobile}
                  onChange={event => {
                    setLogin(current => ({ ...current, mobile: event.target.value }));
                    setOtpSent(false);
                  }}
                  required
                  inputMode="tel"
                  placeholder="Registered tenant mobile"
                />
              </label>
              {otpSent && (
                <label>
                  <span>6 digit OTP *</span>
                  <input
                    value={login.otp}
                    onChange={event => setLogin(current => ({ ...current, otp: event.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    required
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter OTP"
                  />
                </label>
              )}
              {notice && <div className={`tenant-onboarding-notice ${notice.kind}`}>{notice.text}</div>}
              <div className={`tenant-auth-actions ${otpSent ? "with-resend" : ""}`}>
                {otpSent && (
                  <button className="tenant-demo-btn" onClick={() => void requestOtp()} disabled={isSaving || !login.mobile} type="button">
                    Resend OTP
                  </button>
                )}
                <button className="tenant-submit-btn" disabled={isSaving || !login.mobile || (otpSent && login.otp.length !== 6)} type="submit">
                  {isSaving ? "Please wait..." : otpSent ? "Verify & Open Workspace" : "Send Login OTP"}
                </button>
              </div>
            </form>
          ) : (
            <form className="tenant-auth-form" onSubmit={submit}>
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
              {notice && <div className={`tenant-onboarding-notice ${notice.kind}`}>{notice.text}</div>}
              <button className="tenant-submit-btn" disabled={isSaving} type="submit">
                {isSaving ? "Creating workspace..." : "Create Clean Workspace"}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}
