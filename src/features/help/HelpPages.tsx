/**
 * Complaints and help. Every complaint gets a ticket number and the legal
 * timelines: acknowledged within 48 hours, resolved within one month.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import { errorMessageKey } from "@/lib/api/errors";
import { rpc, select, selectOne } from "@/lib/api/rest";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDate, formatDateTime } from "@/lib/format";
import { Link, navigate, useLocation } from "@/lib/router";
import { Alert, Button, PageSpinner, TextField } from "@/ui/controls";
import { EmptyState } from "@/features/shop/ui";
import { NotFoundPage } from "@/features/home/HomePage";

export const TICKET_CATEGORIES = ["order", "delivery", "refund", "product", "seller", "account", "other"] as const;
export type TicketStatus = "open" | "acknowledged" | "resolved" | "closed";
export type Ticket = {
  id: string;
  ticket_no: string;
  category: (typeof TICKET_CATEGORIES)[number];
  subject: string;
  status: TicketStatus;
  order_id: string | null;
  created_at: string;
  ack_due_at: string;
  resolve_due_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};
export type TicketMessage = { id: string; from_staff: boolean; body: string; created_at: string };

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useI18n();
  return <span className={`status status-ticket-${status}`}>{t(`help.status.${status}` as MessageKey)}</span>;
}

export function HelpPage() {
  const { t, lang } = useI18n();
  const { session, getAccessToken } = useAuth();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  useEffect(() => {
    if (!session) return;
    getAccessToken()
      .then((tok) => select<Ticket>("tickets", `created_by=eq.${session.user.id}&select=*&order=created_at.desc`, tok))
      .then(setTickets)
      .catch(() => setTickets([]));
  }, [session, getAccessToken]);

  if (!tickets) return <PageSpinner />;
  return (
    <section className="container narrow page-pad">
      <div className="page-head">
        <h1>{t("help.title")}</h1>
        <Link to="/help/new" className="btn btn-primary">{t("help.raise")}</Link>
      </div>
      <p className="lead">{t("help.promise")}</p>
      {tickets.length === 0 ? (
        <EmptyState title={t("help.none")} />
      ) : (
        <ul className="order-list" role="list">
          {tickets.map((tk) => (
            <li key={tk.id}>
              <Link to={`/help/${tk.id}`} className="order-row">
                <span><strong>{tk.ticket_no}</strong> · {tk.subject}<br /><span className="small-print">{formatDate(tk.created_at, lang)}</span></span>
                <TicketStatusBadge status={tk.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="small-print">{t("help.grievanceOfficer")} <Link to="/legal/terms">{t("help.seeTerms")}</Link></p>
    </section>
  );
}

export function NewTicketPage() {
  const { t } = useI18n();
  const { getAccessToken } = useAuth();
  const { search } = useLocation();
  const orderId = search.get("order");
  const [category, setCategory] = useState<Ticket["category"]>(orderId ? "order" : "other");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ subject?: MessageKey; body?: MessageKey }>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (subject.trim().length < 4) errs.subject = "help.subjectShort";
    if (body.trim().length < 10) errs.body = "help.bodyShort";
    setErrors(errs);
    if (errs.subject || errs.body) return;
    setBusy(true);
    try {
      const tok = await getAccessToken();
      const no = await rpc<string>("open_ticket", { p_category: category, p_subject: subject.trim(), p_body: body.trim(), p_order: orderId }, tok);
      const row = await selectOne<{ id: string }>("tickets", `ticket_no=eq.${no}&select=id`, tok);
      navigate(row ? `/help/${row.id}?new=1` : "/help", { replace: true });
    } catch (err) {
      setFormError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container narrow page-pad">
      <h1>{t("help.raise")}</h1>
      <p className="lead">{t("help.promise")}</p>
      <form onSubmit={onSubmit} noValidate>
        {formError && <Alert>{t(formError)}</Alert>}
        {orderId && <p className="small-print">{t("help.aboutOrder", { number: orderId.slice(0, 8).toUpperCase() })}</p>}
        <label className="field">
          <span>{t("help.category")}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Ticket["category"])}>
            {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(`help.cat.${c}` as MessageKey)}</option>)}
          </select>
        </label>
        <TextField label={t("help.subject")} maxLength={140} value={subject} error={errors.subject ? t(errors.subject) : null} onChange={(e) => setSubject(e.target.value)} />
        <label className={`field ${errors.body ? "field-invalid" : ""}`}>
          <span>{t("help.details")}</span>
          <textarea rows={6} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={errors.body ? true : undefined} />
          {errors.body && <span className="field-error" role="alert">{t(errors.body)}</span>}
        </label>
        <Button type="submit" busy={busy} className="btn-block">{t("help.submit")}</Button>
      </form>
    </section>
  );
}

export function TicketThread({ id, staffView = false }: { id: string; staffView?: boolean }) {
  const { t, lang } = useI18n();
  const { getAccessToken } = useAuth();
  const { search } = useLocation();
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [nextStatus, setNextStatus] = useState<TicketStatus | "">("");
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const tok = await getAccessToken();
    const [tk, msgs] = await Promise.all([
      selectOne<Ticket>("tickets", `id=eq.${id}&select=*`, tok),
      select<TicketMessage>("ticket_messages", `ticket_id=eq.${id}&select=id,from_staff,body,created_at&order=created_at`, tok),
    ]);
    setTicket(tk);
    setMessages(msgs);
  }, [id, getAccessToken]);
  useEffect(() => void load().catch(() => setTicket(null)), [load]);

  if (ticket === undefined) return <PageSpinner />;
  if (ticket === null) return <NotFoundPage />;

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await rpc("reply_ticket", { p_ticket: id, p_body: reply.trim(), p_status: nextStatus || null }, await getAccessToken());
      setReply("");
      setNextStatus("");
      await load();
    } catch (err) {
      setError(errorMessageKey(err));
    } finally {
      setBusy(false);
    }
  }

  const late = ticket.status === "open" && new Date(ticket.ack_due_at) < new Date();
  return (
    <section className="container narrow page-pad">
      {search.get("new") && <Alert tone="success">{t("help.created", { number: ticket.ticket_no })}</Alert>}
      <p className="small-print">{ticket.ticket_no} · {t(`help.cat.${ticket.category}` as MessageKey)}</p>
      <h1>{ticket.subject}</h1>
      <p><TicketStatusBadge status={ticket.status} /></p>
      <dl className="summary">
        <div><dt>{t("help.ackBy")}</dt><dd className={late ? "field-error" : ""}>{ticket.acknowledged_at ? `✓ ${formatDateTime(ticket.acknowledged_at, lang)}` : formatDateTime(ticket.ack_due_at, lang)}</dd></div>
        <div><dt>{t("help.resolveBy")}</dt><dd>{ticket.resolved_at ? `✓ ${formatDateTime(ticket.resolved_at, lang)}` : formatDate(ticket.resolve_due_at, lang)}</dd></div>
        {ticket.order_id && <div><dt>{t("orders.title")}</dt><dd>{staffView ? ticket.order_id.slice(0, 8).toUpperCase() : <Link to={`/orders/${ticket.order_id}`}>{ticket.order_id.slice(0, 8).toUpperCase()}</Link>}</dd></div>}
      </dl>
      <ol className="thread" role="list">
        {messages.map((m) => (
          <li key={m.id} className={m.from_staff ? "from-staff" : "from-user"}>
            <p className="small-print">{m.from_staff ? t("help.fromTeam") : t("help.fromYou")} · {formatDateTime(m.created_at, lang)}</p>
            <p className="thread-body">{m.body}</p>
          </li>
        ))}
      </ol>
      {ticket.status !== "closed" && (
        <form onSubmit={onReply} className="stack">
          {error && <Alert>{t(error)}</Alert>}
          <label className="field">
            <span>{t("help.reply")}</span>
            <textarea rows={4} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          {staffView && (
            <label className="field">
              <span>Set status</span>
              <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as TicketStatus | "")}>
                <option value="">Keep (acknowledge if open)</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </label>
          )}
          <Button type="submit" busy={busy}>{t("help.send")}</Button>
        </form>
      )}
    </section>
  );
}
