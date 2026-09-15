"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { toast } from "sonner";
import { adminAr as a } from "@/locales/admin-ar";
import { formatMoney } from "@/lib/currency";
import { AdminButton, AdminInput, AdminSelect } from "@/components/admin/ui";
import { dayKey } from "@/lib/analytics/daily-profit";
import { canonicalizeMauritaniaPhone } from "@/lib/validation/phone";
import {
  createWhatsAppSaleAction,
  listActiveProductsForManualSaleAction,
  listWhatsAppConversationsAction,
  lookupWhatsAppContactAction,
  type ManualSaleProductOption,
  type WhatsAppConversation,
} from "./actions";

const RELATIVE_TIME = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });

/** "قبل ساعتين" — coarse on purpose; the admin only needs recency, not precision. */
function relativeFromNow(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.round(ms / 60000);
  if (Math.abs(minutes) < 60) return RELATIVE_TIME.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE_TIME.format(hours, "hour");
  return RELATIVE_TIME.format(Math.round(hours / 24), "day");
}

type Props = {
  open: boolean;
  onClose: () => void;
};

type DraftLine = {
  key: string;
  productId: string;
  quantity: string;
};

function newLine(): DraftLine {
  return { key: crypto.randomUUID(), productId: "", quantity: "1" };
}

function unitPriceFor(product: ManualSaleProductOption | undefined): number {
  if (!product) return 0;
  return product.discountPrice ?? product.price;
}

/** How the admin is identifying who to bind the sale to. */
type PhoneMode = "conversation" | "manual";

const SEARCH_DEBOUNCE_MS = 250;
const MANUAL_LOOKUP_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 2;

function segClass(active: boolean): string {
  return `flex-1 px-3 py-2 text-xs font-semibold transition ${
    active
      ? "bg-[var(--accent)] text-white"
      : "bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
  }`;
}

export function WhatsAppSaleForm({ open, onClose }: Props) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<ManualSaleProductOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [selectedPhone, setSelectedPhone] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);
  const [orderDate, setOrderDate] = useState(() => dayKey(new Date()));
  const [initialStatus, setInitialStatus] = useState<"pending" | "confirmed">("confirmed");
  const [submitting, setSubmitting] = useState(false);

  // Conversation mode: a searchable list, not a plain <select>.
  const [phoneMode, setPhoneMode] = useState<PhoneMode>("conversation");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WhatsAppConversation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [pickedConversation, setPickedConversation] = useState<WhatsAppConversation | null>(null);
  const searchRequestIdRef = useRef(0);

  // Manual mode: a typed number, validated client-side and looked up server-side.
  const [manualPhone, setManualPhone] = useState("");
  const [manualPhoneTouched, setManualPhoneTouched] = useState(false);
  const [manualContact, setManualContact] = useState<WhatsAppConversation | null>(null);
  const [manualLookupPending, setManualLookupPending] = useState(false);
  const manualLookupRequestIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setSelectedPhone("");
    setLines([newLine()]);
    setOrderDate(dayKey(new Date()));
    setInitialStatus("confirmed");
    setLoadError(false);
    setProducts(null);
    setPhoneMode("conversation");
    setQuery("");
    setSearchResults(null);
    setSearchError(false);
    setActiveIndex(-1);
    setListCollapsed(false);
    setPickedConversation(null);
    setManualPhone("");
    setManualPhoneTouched(false);
    setManualContact(null);
    listActiveProductsForManualSaleAction()
      .then(setProducts)
      .catch(() => setLoadError(true));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced conversation search — below SEARCH_MIN_CHARS shows the default
  // recent list, otherwise a server-side search (the list is capped, so
  // filtering only the already-loaded page would hide older conversations
  // from the very search meant to find them).
  useEffect(() => {
    if (!open || phoneMode !== "conversation") return;
    setSearching(true);
    const timer = setTimeout(() => {
      const requestId = ++searchRequestIdRef.current;
      const term = query.trim();
      const call =
        term.length >= SEARCH_MIN_CHARS
          ? listWhatsAppConversationsAction(60, term)
          : listWhatsAppConversationsAction();
      call
        .then((res) => {
          if (searchRequestIdRef.current !== requestId) return; // a later request already resolved
          setSearchResults(res);
          setSearchError(false);
        })
        .catch(() => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchError(true);
        })
        .finally(() => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, phoneMode, query]);

  const manualValidation = useMemo(() => {
    const trimmed = manualPhone.trim();
    if (!trimmed) return { valid: false, canonical: "" };
    try {
      return { valid: true, canonical: canonicalizeMauritaniaPhone(trimmed) };
    } catch {
      return { valid: false, canonical: "" };
    }
  }, [manualPhone]);

  // Debounced manual-number lookup, only once the number is a well-formed
  // Mauritania number — an obviously-invalid number never needs a round trip.
  useEffect(() => {
    if (!open || phoneMode !== "manual") return;
    if (!manualValidation.valid) {
      setManualContact(null);
      setManualLookupPending(false);
      return;
    }
    setManualLookupPending(true);
    const timer = setTimeout(() => {
      const requestId = ++manualLookupRequestIdRef.current;
      lookupWhatsAppContactAction(manualPhone)
        .then((res) => {
          if (manualLookupRequestIdRef.current !== requestId) return;
          setManualContact(res);
        })
        .catch(() => {
          if (manualLookupRequestIdRef.current !== requestId) return;
          setManualContact(null);
        })
        .finally(() => {
          if (manualLookupRequestIdRef.current !== requestId) return;
          setManualLookupPending(false);
        });
    }, MANUAL_LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, phoneMode, manualPhone, manualValidation.valid]);

  // selectedPhone (what actually gets submitted) tracks the typed number only
  // once it passes client-side validation — an invalid number can never be
  // the value that reaches createWhatsAppSaleAction.
  useEffect(() => {
    if (phoneMode !== "manual") return;
    setSelectedPhone(manualValidation.valid ? manualValidation.canonical.replace(/^\+/, "") : "");
  }, [phoneMode, manualValidation]);

  const productMap = useMemo(() => {
    const map = new Map<string, ManualSaleProductOption>();
    for (const p of products ?? []) map.set(p.id, p);
    return map;
  }, [products]);

  const total = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return sum;
      return sum + unitPriceFor(productMap.get(line.productId)) * qty;
    }, 0);
  }, [lines, productMap]);

  // The picked row in conversation mode, the looked-up contact in manual mode
  // — the attribution card below reads this one value regardless of mode.
  const selectedConversation = phoneMode === "manual" ? manualContact : pickedConversation;

  // Every option comes from listActiveProductsForManualSaleAction, already
  // scoped to one country, so any loaded product's currency is shared by all.
  const currency = products?.[0]?.currency ?? "MRU";

  if (!open || !mounted) return null;

  function switchMode(mode: PhoneMode) {
    if (mode === phoneMode) return;
    setPhoneMode(mode);
    // A number picked/typed in the abandoned mode must never be submitted.
    setSelectedPhone("");
    setPickedConversation(null);
    setActiveIndex(-1);
  }

  function pickConversation(c: WhatsAppConversation) {
    setSelectedPhone(c.phone);
    setPickedConversation(c);
    // Prefill the WhatsApp profile name, but leave it editable — profile
    // names are often nicknames, and the shipping name is what the delivery
    // agent needs.
    if (c.displayName && !customerName.trim()) {
      setCustomerName(c.displayName);
    }
    setActiveIndex(-1);
  }

  function useManualInstead() {
    setManualPhone(query.replace(/\D/g, ""));
    setManualPhoneTouched(false);
    setQuery("");
    setPhoneMode("manual");
    setSelectedPhone("");
    setPickedConversation(null);
  }

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    const results = searchResults ?? [];
    if (e.key === "Escape") {
      // First Escape closes the results list without closing the dialog —
      // the dialog's own Escape handler is a `window` listener, so stopping
      // propagation here (only while the list is still open) is what keeps
      // it from firing too. A second Escape (list already collapsed) is left
      // to bubble up and close the dialog.
      if (!listCollapsed) {
        e.preventDefault();
        e.stopPropagation();
        setListCollapsed(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setListCollapsed(false);
      setActiveIndex((i) => (results.length === 0 ? -1 : Math.min(i + 1, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setListCollapsed(false);
      setActiveIndex((i) => (results.length === 0 ? -1 : Math.max(i - 1, 0)));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault();
        pickConversation(results[activeIndex]);
      }
    }
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((line) => line.key !== key)));
  }

  async function onSubmit() {
    if (submitting) return;

    const preparedLines = lines
      .filter((line) => line.productId)
      .map((line) => ({ productId: line.productId, quantity: Number(line.quantity) }));

    if (preparedLines.length === 0) {
      toast.error(a.manualSale.noProducts);
      return;
    }
    if (preparedLines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 1)) {
      toast.error(a.orders.quantityInvalid);
      return;
    }
    if (!selectedPhone) {
      toast.error(
        phoneMode === "conversation" ? a.manualSale.conversationRequired : a.manualSale.manualPhoneRequired,
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await createWhatsAppSaleAction({
        customerName,
        conversationPhone: selectedPhone,
        initialStatus,
        lines: preparedLines,
        orderDate,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(a.manualSale.success);
      const anyMetaFailed = res.orders.some((o) => o.metaPurchase?.state === "failed");
      if (anyMetaFailed) {
        toast.warning(a.manualSale.metaPurchaseFailedNote);
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : a.manualSale.success);
    } finally {
      setSubmitting(false);
    }
  }

  const phoneReady = phoneMode === "conversation" ? Boolean(selectedPhone) : manualValidation.valid;
  const showResultsList = phoneMode === "conversation" && !listCollapsed;
  const manualInvalidShown =
    phoneMode === "manual" && manualPhoneTouched && manualPhone.trim().length > 0 && !manualValidation.valid;

  return createPortal(
    <div
      className="admin-shell fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      dir="rtl"
      lang="ar"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label={a.manualSale.close}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--admin-border-strong)] bg-[var(--admin-elevated)] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--accent-muted)] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">
              {a.manualSale.title}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{a.manualSale.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--accent-muted)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--accent-muted)]/20"
          >
            {a.manualSale.close}
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div className="space-y-3">
            <div>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                {a.manualSale.conversation}
              </span>

              <div className="mt-1.5 inline-flex w-full overflow-hidden rounded-lg border border-[var(--accent-muted)]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => switchMode("conversation")}
                  className={segClass(phoneMode === "conversation")}
                >
                  {a.manualSale.modeConversation}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => switchMode("manual")}
                  className={segClass(phoneMode === "manual")}
                >
                  {a.manualSale.modeManual}
                </button>
              </div>

              {phoneMode === "conversation" ? (
                <div className="relative mt-2">
                  <AdminInput
                    placeholder={a.manualSale.searchPlaceholder}
                    value={query}
                    disabled={submitting}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(-1);
                      setListCollapsed(false);
                    }}
                    onFocus={() => setListCollapsed(false)}
                    onKeyDown={onSearchKeyDown}
                  />

                  {searchError ? (
                    <p className="mt-1.5 text-sm text-red-400">{a.manualSale.conversationsFailed}</p>
                  ) : showResultsList ? (
                    <div
                      role="listbox"
                      className="mt-1.5 max-h-[15rem] overflow-y-auto rounded-xl border border-[var(--accent-muted)]"
                    >
                      {searching ? (
                        <p className="px-3 py-2.5 text-xs text-[var(--muted)]">{a.manualSale.searching}</p>
                      ) : (searchResults ?? []).length === 0 ? (
                        <div className="px-3 py-3 text-center">
                          <p className="text-xs text-[var(--muted)]">
                            {query.trim() ? a.manualSale.noSearchResults : a.manualSale.noConversations}
                          </p>
                          {query.trim() ? (
                            <button
                              type="button"
                              onClick={useManualInstead}
                              className="mt-2 text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                            >
                              {a.manualSale.useManualInstead}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        (searchResults ?? []).map((c, i) => (
                          <button
                            key={c.phone}
                            type="button"
                            role="option"
                            aria-selected={pickedConversation?.phone === c.phone}
                            onClick={() => pickConversation(c)}
                            className={`flex w-full flex-col items-start gap-0.5 border-b border-[var(--admin-border)] px-3 py-2 text-start text-xs transition last:border-b-0 ${
                              i === activeIndex ? "bg-[var(--accent-muted)]/25" : "hover:bg-[var(--accent-muted)]/10"
                            } ${pickedConversation?.phone === c.phone ? "bg-[var(--accent-muted)]/20" : ""}`}
                          >
                            <span className="font-medium text-[var(--foreground)]">
                              {c.displayName ?? c.phone}
                              {c.adSourceId ? " · ★" : ""}
                            </span>
                            <span className="flex w-full items-center justify-between gap-2 text-[var(--muted)]">
                              <span className="font-mono" dir="ltr">
                                +{c.phone}
                              </span>
                              <span>{relativeFromNow(c.lastInboundAt)}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2">
                  <AdminInput
                    dir="ltr"
                    inputMode="tel"
                    label={a.manualSale.manualPhone}
                    placeholder="34567890"
                    value={manualPhone}
                    disabled={submitting}
                    error={manualInvalidShown ? a.manualSale.manualPhoneInvalid : undefined}
                    onChange={(e) => setManualPhone(e.target.value)}
                    onBlur={() => setManualPhoneTouched(true)}
                  />
                  {manualValidation.valid ? (
                    manualLookupPending ? (
                      <p className="mt-1.5 text-xs text-[var(--muted)]">{a.manualSale.searching}</p>
                    ) : manualContact ? (
                      <p className="mt-1.5 text-xs text-emerald-400">{a.manualSale.manualContactFound}</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-amber-500">{a.manualSale.manualContactMissing}</p>
                    )
                  ) : null}
                </div>
              )}
            </div>

            {selectedConversation ? (
              <div className="rounded-xl border border-[var(--accent-muted)] bg-[var(--card)]/40 px-4 py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--muted)]">{a.manualSale.phone}</span>
                  <span className="font-mono" dir="ltr">
                    +{selectedConversation.phone}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-[var(--muted)]">{a.manualSale.adSource}</span>
                  {selectedConversation.adSourceId ? (
                    <span className="font-mono" dir="ltr">
                      {selectedConversation.adSourceId}
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">{a.manualSale.adSourceNone}</span>
                  )}
                </div>
                {selectedConversation.adSourceId && !selectedConversation.adAttributable ? (
                  <p className="mt-2 text-amber-500">{a.manualSale.adWindowExpired}</p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AdminInput
                label={a.manualSale.customerName}
                placeholder={a.manualSale.customerNamePlaceholder}
                value={customerName}
                disabled={submitting}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <AdminInput
                type="date"
                label={a.manualSale.orderDate}
                dir="ltr"
                value={orderDate}
                disabled={submitting}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-semibold text-[var(--foreground)]">
              {a.manualSale.product}
            </span>
            {loadError ? (
              <p className="text-sm text-red-400">{a.manualSale.loadProductsFailed}</p>
            ) : null}
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <AdminSelect
                  className="flex-1"
                  value={line.productId}
                  disabled={submitting || !products}
                  onChange={(e) => updateLine(line.key, { productId: e.target.value })}
                >
                  <option value="">{a.manualSale.selectProduct}</option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </AdminSelect>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  dir="ltr"
                  disabled={submitting}
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  className="admin-input w-20 shrink-0 text-center tabular-nums"
                />
                <button
                  type="button"
                  disabled={submitting || lines.length <= 1}
                  onClick={() => removeLine(line.key)}
                  className="min-h-[44px] shrink-0 rounded-xl border border-red-400/30 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {a.manualSale.removeLine}
                </button>
              </div>
            ))}
            <AdminButton type="button" variant="ghost" disabled={submitting} onClick={addLine}>
              {a.manualSale.addLine}
            </AdminButton>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--accent-muted)] bg-[var(--card)]/40 px-4 py-3">
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {a.manualSale.total}
            </span>
            <span className="font-mono text-sm font-semibold" dir="ltr">
              {formatMoney(total, currency)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <span className="text-xs font-semibold text-[var(--foreground)]">
                {a.manualSale.initialStatus}
              </span>
              <select
                disabled={submitting}
                value={initialStatus}
                onChange={(e) => setInitialStatus(e.target.value as "pending" | "confirmed")}
                className="admin-input mt-1.5"
              >
                <option value="confirmed">{a.manualSale.statusConfirmed}</option>
                <option value="pending">{a.manualSale.statusPending}</option>
              </select>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--accent-muted)] px-4 py-4 sm:px-5">
          <AdminButton
            type="button"
            variant="primary"
            className="w-full"
            disabled={submitting || !phoneReady}
            onClick={() => void onSubmit()}
          >
            {submitting ? a.manualSale.submitting : a.manualSale.submit}
          </AdminButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
