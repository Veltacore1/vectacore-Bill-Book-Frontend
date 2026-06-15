import { useState, useRef, type FormEvent } from "react";
import {
  Building2, Database, LogIn, Phone, ShieldCheck,
  UserPlus, ArrowLeft, ArrowRight, Eye, EyeOff, CheckCircle,
  Sparkles, Zap
} from "lucide-react";
import { isDemoSessionAvailable, registerTextileTenant, sendLoginOtp, startDemoSession, verifyLoginOtp } from "../api";

type TenantOnboardingProps = {
  initialMode?: "login" | "register";
  onReady: () => Promise<void>;
  onBackToLanding?: () => void;
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

const REGISTER_STEPS = [
  {
    id: "business",
    title: "Your Business",
    subtitle: "Tell us about your business",
    fields: ["businessName", "ownerName"],
  },
  {
    id: "contact",
    title: "Contact Details",
    subtitle: "How customers can reach you",
    fields: ["mobile", "email", "invoicePrefix"],
  },
  {
    id: "location",
    title: "Location & Tax",
    subtitle: "GST and address details",
    fields: ["gstin", "state", "city", "pincode"],
  },
  {
    id: "security",
    title: "Secure Your Account",
    subtitle: "Choose a strong password",
    fields: ["password"],
  }
];

// Animated background particles
function Particles() {
  return (
    <div className="auth3-particles" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="auth3-particle" style={{
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 8}s`,
          animationDuration: `${6 + Math.random() * 6}s`,
          width: `${3 + Math.random() * 6}px`,
          height: `${3 + Math.random() * 6}px`,
          opacity: 0.15 + Math.random() * 0.25,
        }} />
      ))}
    </div>
  );
}

export default function TenantOnboarding({ initialMode = "login", onReady, onBackToLanding }: TenantOnboardingProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState(initialForm);
  const [login, setLogin] = useState({ mobile: "", otp: "" });
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const canUseDemo = isDemoSessionAvailable();

  const updateField = (field: keyof typeof initialForm, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setNotice(null);
    setStep(0);
  };

  // OTP input handling
  const handleOtpDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setLogin(l => ({ ...l, otp: next.join("") }));
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const requestOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      const data = await sendLoginOtp({ mobile: login.mobile });
      setOtpSent(true);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
      setNotice({
        kind: "success",
        text: data.otp_simulated
          ? `Debug OTP: ${data.otp_simulated}`
          : `OTP sent to +91-${login.mobile}`
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
      window.history.replaceState(null, "", "/app");
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
      window.history.replaceState(null, "", "/app");
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
      window.history.replaceState(null, "", "/app");
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Demo workspace could not be opened." });
    } finally {
      setIsSaving(false);
    }
  };

  const progress = ((step + 1) / REGISTER_STEPS.length) * 100;

  return (
    <main className="auth3-root">
      {/* Left panel */}
      <div className="auth3-left">
        <Particles />
        <div className="auth3-left-content">
          <button className="auth3-back" onClick={onBackToLanding}>
            <ArrowLeft size={16} /> Back to home
          </button>

          <div className="auth3-brand">
            <div className="auth3-logo-gem"><span>VB</span></div>
            <span className="auth3-brand-name">VastraBook</span>
          </div>

          <div className="auth3-tagline">
            <h2>The smarter way to<br /><em>run your business</em></h2>
            <p>Trusted by 1 Crore+ businesses across India for billing, inventory and payments.</p>
          </div>

          <div className="auth3-mockup-wrap">
            <img 
              src="/dashboard_mockup.png" 
              alt="VastraBook Dashboard Preview" 
              className="auth3-mockup-img" 
            />
          </div>

          <div className="auth3-benefits">
            <div className="auth3-benefit">
              <div className="auth3-benefit-icon"><Zap size={17} /></div>
              <div>
                <strong>Lightning Fast Setup</strong>
                <span>Go live in under 2 minutes</span>
              </div>
            </div>
            <div className="auth3-benefit">
              <div className="auth3-benefit-icon"><Database size={17} /></div>
              <div>
                <strong>Postgres-Backed</strong>
                <span>Real data, isolated per business</span>
              </div>
            </div>
            <div className="auth3-benefit">
              <div className="auth3-benefit-icon"><ShieldCheck size={17} /></div>
              <div>
                <strong>Bank-Grade Security</strong>
                <span>AES-256 encryption, daily backups</span>
              </div>
            </div>
            <div className="auth3-benefit">
              <div className="auth3-benefit-icon"><Building2 size={17} /></div>
              <div>
                <strong>Multi-Branch Ready</strong>
                <span>Manage multiple locations easily</span>
              </div>
            </div>
          </div>

          {canUseDemo && (
            <button className="auth3-demo-btn" onClick={openDemo} disabled={isSaving}>
              <Sparkles size={16} />
              Try the CSM SILKS demo
            </button>
          )}

          {/* Floating testimonial */}
          <div className="auth3-testi">
            <div className="auth3-testi-stars">★★★★★</div>
            <p>"Increased turnover by 40%. Best billing software for Indian businesses."</p>
            <span>— Mohit Jain, Arihanth Enterprises</span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="auth3-right">
        <div className="auth3-form-container">
          {/* Tab switcher */}
          <div className="auth3-tabs">
            <button
              className={`auth3-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => switchMode("login")}
            >
              <LogIn size={16} /> Login
            </button>
            <button
              className={`auth3-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => switchMode("register")}
            >
              <UserPlus size={16} /> Register
            </button>
            <div className="auth3-tab-slider" style={{ left: mode === "login" ? "4px" : "50%" }} />
          </div>

          {/* LOGIN FORM */}
          {mode === "login" && (
            <form className="auth3-form" onSubmit={otpSent ? verifyOtp : requestOtp}>
              <div className="auth3-form-header">
                <h1>Welcome back</h1>
                <p>Login to your VastraBook workspace</p>
              </div>

              <div className="auth3-field">
                <label>Mobile Number</label>
                <div className="auth3-input-wrap">
                  <span className="auth3-input-prefix"><Phone size={16} /> +91</span>
                  <input
                    type="tel"
                    value={login.mobile}
                    onChange={e => {
                      setLogin(l => ({ ...l, mobile: e.target.value }));
                      setOtpSent(false);
                      setOtpDigits(["", "", "", "", "", ""]);
                    }}
                    required
                    inputMode="tel"
                    placeholder="9876543210"
                    className="auth3-input auth3-input--with-prefix"
                  />
                </div>
              </div>

              {otpSent && (
                <div className="auth3-field">
                  <label>Enter OTP sent to your phone</label>
                  <div className="auth3-otp-grid">
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el; }}
                        className="auth3-otp-box"
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpDigit(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {notice && (
                <div className={`auth3-notice auth3-notice--${notice.kind}`}>
                  {notice.kind === "success" ? <CheckCircle size={15} /> : null}
                  {notice.text}
                </div>
              )}

              <div className="auth3-actions">
                {otpSent && (
                  <button type="button" className="auth3-resend" onClick={() => void requestOtp()} disabled={isSaving || !login.mobile}>
                    Resend OTP
                  </button>
                )}
                <button
                  className="auth3-submit"
                  disabled={isSaving || !login.mobile || (otpSent && otpDigits.join("").length !== 6)}
                  type="submit"
                >
                  {isSaving ? (
                    <span className="auth3-spinner" />
                  ) : otpSent ? (
                    <><CheckCircle size={17} /> Verify & Enter Workspace</>
                  ) : (
                    <>Send OTP <ArrowRight size={17} /></>
                  )}
                </button>
              </div>

              <p className="auth3-switch-hint">
                New to VastraBook?{" "}
                <button type="button" onClick={() => switchMode("register")}>Create account →</button>
              </p>
            </form>
          )}

          {/* REGISTER FORM — Stepped */}
          {mode === "register" && (
            <form className="auth3-form" onSubmit={step < REGISTER_STEPS.length - 1 ? e => { e.preventDefault(); setStep(s => s + 1); } : submit}>
              <div className="auth3-form-header">
                <h1>{REGISTER_STEPS[step].title}</h1>
                <p>{REGISTER_STEPS[step].subtitle}</p>
              </div>

              {/* Progress bar */}
              <div className="auth3-progress-bar">
                <div className="auth3-progress-fill" style={{ width: `${progress}%` }} />
                <div className="auth3-progress-steps">
                  {REGISTER_STEPS.map((s, i) => (
                    <div key={i} className={`auth3-progress-dot ${i <= step ? "done" : ""}`} />
                  ))}
                </div>
              </div>

              {/* Step 0 — Business */}
              {step === 0 && (
                <>
                  <div className="auth3-field">
                    <label>Business Name *</label>
                    <input className="auth3-input" value={form.businessName} onChange={e => updateField("businessName", e.target.value)} required placeholder="e.g. Arihanth Textiles Pvt Ltd" />
                  </div>
                  <div className="auth3-field">
                    <label>Owner / Manager Name *</label>
                    <input className="auth3-input" value={form.ownerName} onChange={e => updateField("ownerName", e.target.value)} required placeholder="Your full name" />
                  </div>
                </>
              )}

              {/* Step 1 — Contact */}
              {step === 1 && (
                <>
                  <div className="auth3-field">
                    <label>Mobile Number *</label>
                    <div className="auth3-input-wrap">
                      <span className="auth3-input-prefix"><Phone size={16} /> +91</span>
                      <input className="auth3-input auth3-input--with-prefix" value={form.mobile} onChange={e => updateField("mobile", e.target.value)} required inputMode="tel" placeholder="9876543210" />
                    </div>
                  </div>
                  <div className="auth3-field">
                    <label>Email Address</label>
                    <input className="auth3-input" value={form.email} onChange={e => updateField("email", e.target.value)} type="email" placeholder="you@business.com" />
                  </div>
                  <div className="auth3-field">
                    <label>Invoice Prefix</label>
                    <input className="auth3-input" value={form.invoicePrefix} onChange={e => updateField("invoicePrefix", e.target.value.toUpperCase())} placeholder="INV (optional)" maxLength={6} />
                    <span className="auth3-hint">Your invoices will be numbered INV-001, INV-002…</span>
                  </div>
                </>
              )}

              {/* Step 2 — Location */}
              {step === 2 && (
                <>
                  <div className="auth3-field">
                    <label>GSTIN</label>
                    <input className="auth3-input" value={form.gstin} onChange={e => updateField("gstin", e.target.value.toUpperCase())} placeholder="27AABCU9603R1ZX (optional)" maxLength={15} />
                  </div>
                  <div className="auth3-row">
                    <div className="auth3-field">
                      <label>State</label>
                      <input className="auth3-input" value={form.state} onChange={e => updateField("state", e.target.value)} />
                    </div>
                    <div className="auth3-field">
                      <label>City</label>
                      <input className="auth3-input" value={form.city} onChange={e => updateField("city", e.target.value)} placeholder="Your city" />
                    </div>
                  </div>
                  <div className="auth3-field">
                    <label>Pincode</label>
                    <input className="auth3-input" value={form.pincode} onChange={e => updateField("pincode", e.target.value)} placeholder="600001" inputMode="numeric" maxLength={6} />
                  </div>
                </>
              )}

              {/* Step 3 — Password */}
              {step === 3 && (
                <>
                  <div className="auth3-field">
                    <label>Password</label>
                    <div className="auth3-input-wrap">
                      <input
                        className="auth3-input auth3-input--with-suffix"
                        type={showPassword ? "text" : "password"}
                        value={form.password}
                        onChange={e => updateField("password", e.target.value)}
                        placeholder="Choose a strong password"
                      />
                      <button type="button" className="auth3-input-eye" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {form.password && (
                      <div className="auth3-password-strength">
                        {["Length", "Uppercase", "Number"].map((req, i) => {
                          const checks = [form.password.length >= 8, /[A-Z]/.test(form.password), /\d/.test(form.password)];
                          return (
                            <span key={req} className={`auth3-strength-chip ${checks[i] ? "met" : ""}`}>
                              {checks[i] ? <CheckCircle size={11} /> : null} {req}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="auth3-summary-card">
                    <h4>Account Summary</h4>
                    <div className="auth3-summary-row"><span>Business</span><strong>{form.businessName}</strong></div>
                    <div className="auth3-summary-row"><span>Owner</span><strong>{form.ownerName}</strong></div>
                    <div className="auth3-summary-row"><span>Mobile</span><strong>+91 {form.mobile}</strong></div>
                    {form.gstin && <div className="auth3-summary-row"><span>GSTIN</span><strong>{form.gstin}</strong></div>}
                  </div>
                </>
              )}

              {notice && (
                <div className={`auth3-notice auth3-notice--${notice.kind}`}>
                  {notice.text}
                </div>
              )}

              <div className="auth3-nav-btns">
                {step > 0 && (
                  <button type="button" className="auth3-back-step" onClick={() => setStep(s => s - 1)}>
                    <ArrowLeft size={16} /> Back
                  </button>
                )}
                <button className="auth3-submit" disabled={isSaving} type="submit">
                  {isSaving ? (
                    <span className="auth3-spinner" />
                  ) : step < REGISTER_STEPS.length - 1 ? (
                    <>Continue <ArrowRight size={17} /></>
                  ) : (
                    <><Sparkles size={17} /> Create Workspace</>
                  )}
                </button>
              </div>

              <p className="auth3-switch-hint">
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")}>Login →</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
