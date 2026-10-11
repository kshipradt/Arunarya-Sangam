/**
 * ARUNARYA team console (English only: an internal tool). Every action is
 * re-checked in the database, which refuses anyone who is not staff.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { rpc, select } from "@/lib/api/rest";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDate, formatDateTime, formatInr } from "@/lib/format";
import { Link } from "@/lib/router";
import { Alert, Button, PageSpinner } from "@/ui/controls";
import { TicketStatusBadge, TicketThread, type Ticket } from "@/features/help/HelpPages";

export function RequireStaff({ children }: { children: ReactNode }) {
  const { staffRole } = useAuth();
  if (!staffRole) {
    return (
      <section className="container narrow page-pad" lang="en" dir="ltr">
        <h1>ARUNARYA team only</h1>
        <p>This area is for the ARUNARYA operations team.</p>
      </section>
    );
  }
  return <div lang="en" dir="ltr">{children}</div>;
}

function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin">
      <Link to="/admin">Overview</Link>
      <Link to="/admin/sellers">Sellers</Link>
      <Link to="/admin/products">Products</Link>
      <Link to="/admin/tickets">Complaints</Link>
      <Link to="/admin/settings">Settings</Link>
    </nav>
  );
}

function useAdminData<T>(load: (token: string) => Promise<T>) {
  const { getAccessToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    getAccessToken().then(load).then(setData).catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAccessToken]);
  useEffect(reload, [reload]);
  return { data, error, reload, getAccessToken };
}

type Overview = { pending_sellers: number; open_tickets: number; late_tickets: number; orders_today: number; gmv_30d: number; live_products: number };

export function AdminOverview() {
  const { lang } = useI18n();
  const { data, error } = useAdminData((tok) => rpc<Overview[]>("admin_overview", {}, tok).then((r) => r[0]!));
  return (
    <section className="container page-pad">
      <h1>ARUNARYA console</h1>
      <AdminNav />
      {error && <Alert>{error}</Alert>}
      {!data ? <PageSpinner /> : (
        <ul className="tiles" role="list">
          <li className={data.late_tickets ? "tile tile-alert" : "tile"}><span className="tile-num">{data.late_tickets}</span><span>Complaints past their legal deadline</span><Link to="/admin/tickets">Open queue</Link></li>
          <li className="tile"><span className="tile-num">{data.open_tickets}</span><span>Open complaints</span></li>
          <li className="tile"><span className="tile-num">{data.pending_sellers}</span><span>Sellers waiting for verification</span><Link to="/admin/sellers">Review</Link></li>
          <li className="tile"><span className="tile-num">{data.orders_today}</span><span>Orders today</span></li>
          <li className="tile"><span className="tile-num">{formatInr(data.gmv_30d, lang)}</span><span>Sales, last 30 days (excluding cancelled)</span></li>
          <li className="tile"><span className="tile-num">{data.live_products}</span><span>Live products</span><Link to="/admin/products">Moderate</Link></li>
        </ul>
      )}
    </section>
  );
}

type PendingSeller = {
  profile_id: string; legal_name: string; business_address: string; pincode: string | null; customer_care_phone: string;
  gstin: string | null; status: string; submitted_at: string; review_note: string | null;
  profile: { full_name: string; role: string; business_name: string | null } | null;
};

export function AdminSellers() {
  const { lang } = useI18n();
  const [filter, setFilter] = useState<"pending" | "verified" | "rejected">("pending");
  const { data, error, reload, getAccessToken } = useAdminData((tok) =>
    select<PendingSeller>("seller_verifications", `select=*,profile:profiles(full_name,role,business_name)&order=submitted_at`, tok),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function decide(id: string, approve: boolean) {
    const note = approve ? null : window.prompt("Reason for rejection (shown to the seller):");
    if (!approve && !note) return;
    setBusy(id);
    setActionError(null);
    try {
      await rpc("admin_review_seller", { p_profile: id, p_approve: approve, p_note: note }, await getAccessToken());
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const rows = (data ?? []).filter((r) => r.status === filter);
  return (
    <section className="container page-pad">
      <h1>Seller verification</h1>
      <AdminNav />
      <div className="segmented" role="tablist">
        {(["pending", "verified", "rejected"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>{f} ({(data ?? []).filter((r) => r.status === f).length})</button>
        ))}
      </div>
      {(error || actionError) && <Alert>{error ?? actionError}</Alert>}
      {!data ? <PageSpinner /> : rows.length === 0 ? <p>Nothing here.</p> : (
        <ul className="admin-list" role="list">
          {rows.map((r) => (
            <li key={r.profile_id} className="card">
              <p><strong>{r.legal_name}</strong> · {r.profile?.full_name} ({r.profile?.role}){r.profile?.business_name ? ` · ${r.profile.business_name}` : ""}</p>
              <p className="small-print">{r.business_address}{r.pincode ? ` ${r.pincode}` : ""} · {r.customer_care_phone} · GSTIN {r.gstin ?? "not given"} · submitted {formatDate(r.submitted_at, lang)}</p>
              {r.review_note && <p className="small-print">Note: {r.review_note}</p>}
              {r.status !== "verified" && (
                <div className="row-actions">
                  <Button busy={busy === r.profile_id} onClick={() => void decide(r.profile_id, true)}>Approve</Button>
                  {r.status === "pending" && <Button variant="secondary" busy={busy === r.profile_id} onClick={() => void decide(r.profile_id, false)}>Reject</Button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type AdminProduct = { id: string; title: string; seller_name: string; price_inr: number; status: string; blocked: boolean; blocked_reason: string | null; image_urls: string[]; created_at: string };

export function AdminProducts() {
  const { lang } = useI18n();
  const [q, setQ] = useState("");
  const { data, error, reload, getAccessToken } = useAdminData((tok) =>
    select<AdminProduct>("shop_products", "select=id,title,seller_name,price_inr,status,blocked,blocked_reason,image_urls,created_at&order=created_at.desc&limit=200", tok),
  );
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggle(p: AdminProduct) {
    const reason = p.blocked ? null : window.prompt("Reason for hiding this product (shown to the seller):");
    if (!p.blocked && !reason) return;
    try {
      await rpc("admin_set_product_block", { p_product: p.id, p_blocked: !p.blocked, p_reason: reason }, await getAccessToken());
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const rows = (data ?? []).filter((p) => !q || `${p.title} ${p.seller_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className="container page-pad">
      <h1>Product moderation</h1>
      <AdminNav />
      <input type="search" className="admin-search" placeholder="Filter by title or seller" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter products" />
      {(error || actionError) && <Alert>{error ?? actionError}</Alert>}
      {!data ? <PageSpinner /> : (
        <table className="admin-table">
          <thead><tr><th>Product</th><th>Seller</th><th>Price</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/product/${p.id}`}>{p.title}</Link><br /><span className="small-print">{formatDate(p.created_at, lang)}</span></td>
                <td>{p.seller_name}</td>
                <td>{formatInr(p.price_inr, lang)}</td>
                <td>{p.blocked ? <span className="field-error">Hidden: {p.blocked_reason}</span> : p.status}</td>
                <td><Button variant={p.blocked ? "secondary" : "ghost"} onClick={() => void toggle(p)}>{p.blocked ? "Restore" : "Hide"}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AdminTickets() {
  const { lang } = useI18n();
  const [show, setShow] = useState<"active" | "all">("active");
  const { data, error } = useAdminData((tok) => select<Ticket>("tickets", "select=*&order=created_at&limit=300", tok));
  const now = new Date();
  const rows = (data ?? []).filter((tk) => show === "all" || tk.status === "open" || tk.status === "acknowledged");
  return (
    <section className="container page-pad">
      <h1>Complaints</h1>
      <AdminNav />
      <p className="small-print">Legal deadlines: acknowledge within 48 hours, resolve within one month (Consumer Protection (E-Commerce) Rules, 2020).</p>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={show === "active"} onClick={() => setShow("active")}>Needs action</button>
        <button role="tab" aria-selected={show === "all"} onClick={() => setShow("all")}>All</button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!data ? <PageSpinner /> : (
        <table className="admin-table">
          <thead><tr><th>Ticket</th><th>Subject</th><th>Status</th><th>Next deadline</th></tr></thead>
          <tbody>
            {rows.map((tk) => {
              const due = tk.status === "open" ? tk.ack_due_at : tk.resolve_due_at;
              const late = (tk.status === "open" || tk.status === "acknowledged") && new Date(due) < now;
              return (
                <tr key={tk.id} className={late ? "row-late" : ""}>
                  <td><Link to={`/admin/tickets/${tk.id}`}>{tk.ticket_no}</Link></td>
                  <td>{tk.subject}<br /><span className="small-print">{tk.category} · {formatDate(tk.created_at, lang)}</span></td>
                  <td><TicketStatusBadge status={tk.status} /></td>
                  <td>{tk.status === "resolved" || tk.status === "closed" ? "—" : <>{late && <strong>LATE · </strong>}{formatDateTime(due, lang)}</>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AdminTicket({ id }: { id: string }) {
  return (
    <>
      <div className="container"><AdminNav /></div>
      <TicketThread id={id} staffView />
    </>
  );
}

const SETTING_LABELS: Record<string, string> = {
  standing_discount_percent: "ARUNARYA discount on every order (%)",
  max_total_discount_percent: "Maximum combined discount (%)",
  free_shipping_threshold_inr: "Free delivery from (₹)",
  flat_shipping_fee_inr: "Delivery fee below that (₹)",
};

export function AdminSettings() {
  const { staffRole } = useAuth();
  const { data, error, reload, getAccessToken } = useAdminData((tok) => select<{ key: string; value: number; note: string | null }>("platform_settings", "select=*&order=key", tok));
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save(key: string) {
    try {
      await rpc("admin_set_setting", { p_key: key, p_value: Number(edits[key]) }, await getAccessToken());
      setMsg({ tone: "success", text: "Saved." });
      reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  return (
    <section className="container narrow page-pad">
      <h1>Settings</h1>
      <AdminNav />
      {staffRole !== "admin" && <Alert tone="info">Only admins can change settings.</Alert>}
      {(error || msg) && <Alert tone={msg?.tone ?? "error"}>{error ?? msg?.text}</Alert>}
      {!data ? <PageSpinner /> : data.map((s) => (
        <div className="field" key={s.key}>
          <label htmlFor={`set-${s.key}`}>{SETTING_LABELS[s.key] ?? s.key}</label>
          <div className="row-inline">
            <input id={`set-${s.key}`} type="number" value={edits[s.key] ?? String(s.value)} disabled={staffRole !== "admin"} onChange={(e) => setEdits((x) => ({ ...x, [s.key]: e.target.value }))} />
            <Button variant="secondary" disabled={staffRole !== "admin" || edits[s.key] === undefined} onClick={() => void save(s.key)}>Save</Button>
          </div>
          {s.note && <p className="field-hint">{s.note}</p>}
        </div>
      ))}
    </section>
  );
}
