import { useState, useEffect, useRef } from "react";
import {
  CheckCircle, ChevronDown, FileText, HelpCircle,
  LayoutDashboard, LogIn, Package, Percent, Phone, PieChart,
  Shield, Zap, ArrowRight, Star, TrendingUp, Users, Sparkles,
  BarChart2, Receipt, Globe, ChevronRight
} from "lucide-react";

type LandingPageProps = {
  onNavigate: (path: string) => void;
};

const features = [
  {
    icon: FileText,
    title: "GST Invoicing",
    desc: "Create GST & non-GST invoices with auto-tax, HSN codes, and custom formats in 8 seconds.",
    color: "#b07d2a",
    glow: "rgba(176,125,42,0.15)"
  },
  {
    icon: Package,
    title: "Inventory Management",
    desc: "Track stock in real-time with low-stock alerts, batch tracking, and expiry management.",
    color: "#0a4d3f",
    glow: "rgba(10,77,63,0.15)"
  },
  {
    icon: Zap,
    title: "Payment Collection",
    desc: "Send WhatsApp & SMS payment reminders with UPI links and track outstanding dues.",
    color: "#8a5c1f",
    glow: "rgba(138,92,31,0.15)"
  },
  {
    icon: LayoutDashboard,
    title: "AI Bookkeeping",
    desc: "Keep records accurate with AI bank reconciliation, smart categorisation, and stock updates.",
    color: "#0f5f4b",
    glow: "rgba(15,95,75,0.15)"
  },
  {
    icon: Percent,
    title: "Marketing & Loyalty",
    desc: "Launch catalogue, run campaigns, and reward customers with loyalty points.",
    color: "#6f1f2a",
    glow: "rgba(111,31,42,0.15)"
  },
  {
    icon: PieChart,
    title: "Reports & Dashboard",
    desc: "Track cash flow, sales, outstanding payments, and GSTR reports at a glance.",
    color: "#e6c36a",
    glow: "rgba(230,195,106,0.2)"
  }
];

const industries = [
  { emoji: "🏪", title: "Retail Shops", desc: "GST bills in seconds with barcode billing." },
  { emoji: "🚚", title: "Distributors", desc: "Bulk invoices and delivery tracking easily." },
  { emoji: "📦", title: "Wholesalers", desc: "High-volume billing with flexible pricing." },
  { emoji: "🏭", title: "Manufacturers", desc: "Raw materials, production, finished goods." },
  { emoji: "💊", title: "Pharmacy", desc: "Batch, expiry & drug inventory tracking." },
  { emoji: "👗", title: "Textile & Fashion", desc: "Multi-size, multi-colour stock management." },
];

const faqs = [
  { q: "What is VastraBook billing software?", a: "VastraBook is an all-in-one billing, inventory, and accounting platform designed for Indian SMBs. Create GST invoices, manage stock, collect payments and track business performance — all in one place." },
  { q: "Is it easy to set up?", a: "Yes! You can register your business in under 2 minutes and start creating invoices immediately. No technical knowledge required." },
  { q: "Is my business data safe?", a: "Absolutely. We use bank-grade AES-256 encryption, daily automated backups, and your data is completely isolated from other businesses." },
  { q: "Can multiple staff use it?", a: "Yes. You can add staff with role-based access control so each person sees only what they need to." },
];

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    popular: false,
    features: ["GST Invoicing", "Up to 50 invoices/mo", "Basic inventory", "Email support"],
    cta: "Start free"
  },
  {
    name: "Growth",
    price: "₹499",
    period: "/mo",
    popular: true,
    features: ["Unlimited invoices", "Advanced inventory", "WhatsApp payments", "Staff accounts (2)", "Priority support"],
    cta: "Start 14-day trial"
  },
  {
    name: "Business",
    price: "₹999",
    period: "/mo",
    popular: false,
    features: ["Everything in Growth", "Unlimited staff", "API access", "Dedicated manager", "Custom integrations"],
    cta: "Contact sales"
  }
];

const testimonials = [
  { name: "Mohit Jain", biz: "Arihanth Enterprises", quote: "Increased Turnover by 40%. Live inventory is accurate, and reordering alerts prevent stockouts completely.", stars: 5 },
  { name: "Akhil Kumar", biz: "Shuban Clothing", quote: "Reduced overdues by 80%. After trying multiple options, VastraBook was clearly the easiest and most powerful.", stars: 5 },
  { name: "Vishwaradhya", biz: "Sri Siddalingeshwara", quote: "50K to 35 Lacs growth in one year. We save hours daily with barcode scanning and batch tracking.", stars: 5 },
];

const stats = [
  { value: "1Cr+", label: "Businesses", icon: Users },
  { value: "8s", label: "To create invoice", icon: Zap },
  { value: "97%", label: "Payments on time", icon: TrendingUp },
  { value: "40%", label: "Revenue growth", icon: BarChart2 },
];

function FloatingOrb({ style }: { style: React.CSSProperties }) {
  return <div className="lp3-orb" style={style} />;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeFeature, setActiveFeature] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature(f => (f + 1) % features.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div className="lp3-root">
      {/* ---- NAVBAR ---- */}
      <header className={`lp3-nav ${scrolled ? "lp3-nav--solid" : ""}`}>
        <div className="lp3-nav-inner">
          <div className="lp3-logo">
            <div className="lp3-logo-gem">
              <span>VB</span>
            </div>
            <span className="lp3-logo-name">VastraBook</span>
          </div>

          <nav className="lp3-nav-links">
            {["Features", "Industries", "Pricing", "Testimonials", "FAQ"].map(link => (
              <a key={link} href={`#${link.toLowerCase()}`} className="lp3-nav-link">{link}</a>
            ))}
          </nav>

          <div className="lp3-nav-cta">
            <button className="lp3-btn-ghost" onClick={() => onNavigate("/login")}>
              <LogIn size={15} /> Login
            </button>
            <button className="lp3-btn-primary" onClick={() => onNavigate("/register")}>
              Get started free <ArrowRight size={14} />
            </button>
          </div>

          <button className="lp3-hamburger" onClick={() => setMobileOpen(!mobileOpen)}>
            <span className={mobileOpen ? "open" : ""} />
            <span className={mobileOpen ? "open" : ""} />
            <span className={mobileOpen ? "open" : ""} />
          </button>
        </div>

        {mobileOpen && (
          <div className="lp3-mobile-menu">
            {["Features", "Industries", "Pricing", "FAQ"].map(link => (
              <a key={link} href={`#${link.toLowerCase()}`} onClick={() => setMobileOpen(false)}>{link}</a>
            ))}
            <button className="lp3-btn-ghost" onClick={() => { setMobileOpen(false); onNavigate("/login"); }}>Login</button>
            <button className="lp3-btn-primary" onClick={() => { setMobileOpen(false); onNavigate("/register"); }}>Get started free</button>
          </div>
        )}
      </header>

      {/* ---- HERO ---- */}
      <section
        className="lp3-hero"
        ref={heroRef}
        onMouseMove={handleMouseMove}
      >
        <div className="lp3-hero-grid-bg" />
        <FloatingOrb style={{ top: "10%", left: "5%", width: 400, height: 400, background: "radial-gradient(circle, rgba(176,125,42,0.18) 0%, transparent 70%)" }} />
        <FloatingOrb style={{ top: "30%", right: "5%", width: 500, height: 500, background: "radial-gradient(circle, rgba(230,195,106,0.14) 0%, transparent 70%)" }} />
        <FloatingOrb style={{ bottom: "5%", left: "30%", width: 350, height: 350, background: "radial-gradient(circle, rgba(10,77,63,0.12) 0%, transparent 70%)" }} />
        <div
          className="lp3-hero-cursor-glow"
          style={{ left: `${mousePos.x}%`, top: `${mousePos.y}%` }}
        />

        <div className="lp3-hero-content">
          <div className="lp3-hero-badge">
            <Sparkles size={13} />
            <span>#1 GST Billing Software for Indian SMBs</span>
          </div>

          <h1 className="lp3-hero-h1">
            Your Business,<br />
            <span className="lp3-hero-gradient-text">Brilliantly Organised</span>
          </h1>

          <p className="lp3-hero-sub">
            Create GST invoices in 8 seconds. Manage inventory, collect payments,
            and grow your business — all from one powerful platform trusted by 1 Crore+ businesses.
          </p>

          <div className="lp3-hero-checks">
            {["No credit card required", "Free forever plan", "Setup in 2 minutes"].map(c => (
              <span key={c} className="lp3-hero-check">
                <CheckCircle size={15} /> {c}
              </span>
            ))}
          </div>

          <div className="lp3-hero-actions">
            <button className="lp3-btn-primary lp3-btn-xl" onClick={() => onNavigate("/register")}>
              Start for free <ArrowRight size={16} />
            </button>
            <button className="lp3-btn-outline lp3-btn-xl" onClick={() => onNavigate("/login")}>
              View demo
            </button>
          </div>
        </div>

        {/* Dashboard Mockup Image */}
        <div className="lp3-hero-visual">
          <div className="lp3-hero-visual-glow" />
          <img 
            src="/dashboard_mockup.png" 
            alt="VastraBook Dashboard Preview" 
            className="lp3-hero-mockup-img" 
          />
        </div>
      </section>

      {/* ---- STATS ---- */}
      <section className="lp3-stats-strip">
        {stats.map(({ value, label, icon: Icon }, i) => (
          <div key={i} className="lp3-stat-item">
            <Icon size={20} className="lp3-stat-icon" />
            <span className="lp3-stat-value">{value}</span>
            <span className="lp3-stat-label">{label}</span>
          </div>
        ))}
      </section>

      {/* ---- FEATURES ---- */}
      <section id="features" className="lp3-section">
        <div className="lp3-section-inner">
          <div className="lp3-section-label">
            <Globe size={14} /> Features
          </div>
          <h2 className="lp3-section-h2">Everything you need<br />to run your business</h2>
          <p className="lp3-section-sub">All-in-one billing, inventory, accounting and growth platform — designed for Indian businesses.</p>

          <div className="lp3-features-grid">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className={`lp3-feature-card ${activeFeature === i ? "lp3-feature-card--active" : ""}`}
                  style={{ "--feature-color": f.color, "--feature-glow": f.glow } as React.CSSProperties}
                  onMouseEnter={() => setActiveFeature(i)}
                >
                  <div className="lp3-feature-icon-wrap">
                    <Icon size={22} />
                  </div>
                  <h3 className="lp3-feature-title">{f.title}</h3>
                  <p className="lp3-feature-desc">{f.desc}</p>
                  <div className="lp3-feature-arrow">
                    <ChevronRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- INDUSTRIES ---- */}
      <section id="industries" className="lp3-section lp3-section--dark">
        <div className="lp3-section-inner">
          <div className="lp3-section-label lp3-section-label--light">
            <Shield size={14} /> Industries
          </div>
          <h2 className="lp3-section-h2 light">Built for every Indian business</h2>
          <p className="lp3-section-sub light">From kirana stores to large distributors — VastraBook adapts to your workflow.</p>

          <div className="lp3-industries-grid">
            {industries.map((ind, i) => (
              <div key={i} className="lp3-industry-card">
                <span className="lp3-industry-emoji">{ind.emoji}</span>
                <strong className="lp3-industry-title">{ind.title}</strong>
                <p className="lp3-industry-desc">{ind.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- PRICING ---- */}
      <section id="pricing" className="lp3-section">
        <div className="lp3-section-inner">
          <div className="lp3-section-label">
            <Receipt size={14} /> Pricing
          </div>
          <h2 className="lp3-section-h2">Simple, transparent pricing</h2>
          <p className="lp3-section-sub">Start free. Upgrade as you grow. No hidden fees, ever.</p>

          <div className="lp3-pricing-grid">
            {plans.map((p, i) => (
              <div key={i} className={`lp3-pricing-card ${p.popular ? "lp3-pricing-card--popular" : ""}`}>
                {p.popular && <div className="lp3-pricing-badge">Most Popular</div>}
                <div className="lp3-pricing-name">{p.name}</div>
                <div className="lp3-pricing-price">
                  <span className="lp3-price-amount">{p.price}</span>
                  {p.period && <span className="lp3-price-period">{p.period}</span>}
                </div>
                <ul className="lp3-pricing-features">
                  {p.features.map((f, j) => (
                    <li key={j}><CheckCircle size={14} /> {f}</li>
                  ))}
                </ul>
                <button
                  className={p.popular ? "lp3-btn-primary lp3-btn-full" : "lp3-btn-outline lp3-btn-full"}
                  onClick={() => onNavigate("/register")}
                >
                  {p.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- TESTIMONIALS ---- */}
      <section id="testimonials" className="lp3-section lp3-section--tinted">
        <div className="lp3-section-inner">
          <div className="lp3-section-label">
            <Star size={14} /> Testimonials
          </div>
          <h2 className="lp3-section-h2">Loved by businesses across India</h2>
          <p className="lp3-section-sub">See how VastraBook is transforming the way businesses work.</p>

          <div className="lp3-testimonials-grid">
            {testimonials.map((t, i) => (
              <div key={i} className="lp3-testimonial-card">
                <div className="lp3-testi-stars">
                  {Array(t.stars).fill(0).map((_, j) => <Star key={j} size={14} fill="#e6c36a" color="#e6c36a" />)}
                </div>
                <p className="lp3-testi-quote">"{t.quote}"</p>
                <div className="lp3-testi-author">
                  <div className="lp3-testi-avatar">{t.name.split(" ").map(n => n[0]).join("")}</div>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.biz}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA BANNER ---- */}
      <section className="lp3-cta-section">
        <div className="lp3-cta-inner">
          <div className="lp3-cta-orb lp3-cta-orb--left" />
          <div className="lp3-cta-orb lp3-cta-orb--right" />
          <Sparkles size={32} className="lp3-cta-sparkle" />
          <h2 className="lp3-cta-h2">Ready to grow your business?</h2>
          <p className="lp3-cta-sub">Join 1 Crore+ businesses already using VastraBook. Get started in 2 minutes.</p>
          <div className="lp3-cta-phone-row">
            <div className="lp3-cta-input-wrap">
              <Phone size={16} className="lp3-cta-phone-icon" />
              <span className="lp3-cta-cc">+91</span>
              <input type="tel" placeholder="Enter your mobile number" className="lp3-cta-input" />
            </div>
            <button className="lp3-btn-primary lp3-btn-xl" onClick={() => onNavigate("/register")}>
              Sign up free <ArrowRight size={16} />
            </button>
          </div>
          <p className="lp3-cta-disclaimer">No credit card needed • Free forever plan available</p>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section id="faq" className="lp3-section">
        <div className="lp3-section-inner lp3-section-inner--narrow">
          <div className="lp3-section-label">
            <HelpCircle size={14} /> FAQ
          </div>
          <h2 className="lp3-section-h2">Frequently asked questions</h2>

          <div className="lp3-faq-list">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className={`lp3-faq-item ${openFaq === i ? "lp3-faq-item--open" : ""}`}
              >
                <button className="lp3-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{faq.q}</span>
                  <ChevronDown size={18} className="lp3-faq-chevron" />
                </button>
                {openFaq === i && <div className="lp3-faq-a">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="lp3-footer">
        <div className="lp3-footer-inner">
          <div className="lp3-footer-brand">
            <div className="lp3-logo">
              <div className="lp3-logo-gem"><span>VB</span></div>
              <span className="lp3-logo-name">VastraBook</span>
            </div>
            <p className="lp3-footer-tagline">The #1 billing software for Indian small businesses.</p>
            <div className="lp3-footer-contact">
              <span><Phone size={13} /> +91 74004 17400</span>
              <span>support@vastrabook.in</span>
            </div>
          </div>

          {[
            { heading: "Product", links: [["Features", "#features"], ["Pricing", "#pricing"], ["Industries", "#industries"]] },
            { heading: "Resources", links: [["Blog", "#"], ["Help Center", "#"], ["API Docs", "#"]] },
            { heading: "Company", links: [["About Us", "#"], ["Privacy Policy", "#"], ["Terms & Conditions", "#"]] },
          ].map(col => (
            <div key={col.heading} className="lp3-footer-col">
              <strong>{col.heading}</strong>
              {col.links.map(([label, href]) => (
                <a key={label} href={href}>{label}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="lp3-footer-bottom">
          <p>© 2026 VastraBook by Veltacore. All rights reserved.</p>
          <div className="lp3-footer-badges">
            <span><Shield size={12} /> SSL Secured</span>
            <span>ISO Certified</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
