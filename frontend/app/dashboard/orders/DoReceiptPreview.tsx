'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from '@/lib/http';
import PageSkeleton from '@/app/components/PageSkeleton';

type PaperSize = '54mm' | '80mm' | 'A4';

type DoItem = {
  id: number;
  item_code?: string | null;
  item_name?: string | null;
  unit?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
  line_total?: number | string | null;
};

type DoRecord = {
  id: number;
  do_number: string;
  do_date?: string | null;
  due_date?: string | null;
  delivery_date?: string | null;
  call_confirmed?: boolean | number | null;
  created_at?: string | null;
  subtotal?: number | string | null;
  discount?: number | string | null;
  total?: number | string | null;
  paid_amount?: number | string | null;
  status?: string | null;
  notes?: string | null;
  customer?: { shop_name?: string | null; customer_code?: string | null } | null;
  items?: DoItem[];
};

type Company = {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  logo_path?: string;
};

type Props = {
  doId: number | null;
  token: string;
  apiUrl: string;
  onClose: () => void;
};

const PAPER_KEY = 'do_receipt_paper_v1';
const COMPANY_PROFILE_ID_KEY = 'company_profile_id';
const DM_SANS_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet">';

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => num(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (value?: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return '-';
  const [, y, m, d] = match;
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${d} ${month} ${y}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? formatDate(value)
    : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Same convention as the sidebar and company settings: logos are served from same-origin /storage.
// A logo that fails to load is simply hidden (no broken-image icon on the receipt).
const resolveLogo = (company: Company): string => {
  const path = String(company.logo_path || '').trim();
  if (path) return `/storage/${path.replace(/^\/+/, '')}`;
  const url = String(company.logo_url || '').trim();
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/storage/')) return parsed.pathname + (parsed.search || '');
    } catch {
      return url;
    }
  }
  return url;
};

// Notes are stored with machine tags ([ORDER_ID:..], Call Confirmed, Delivery Date); show only the human part.
const cleanNotes = (notes?: string | null) => String(notes || '')
  .split('\n')
  .filter((line) => !/^\s*(\[ORDER_ID:|Call Confirmed:|Delivery Date:)/i.test(line))
  .join(' ')
  .trim();

/* Shared receipt styles: used in the preview and injected into the print document. */
const RECEIPT_CSS = `
.do-doc { font-family: "DM Sans", var(--font-dm-sans), sans-serif; color: #0f172a; background: #fff; box-sizing: border-box; }
.do-doc * { box-sizing: border-box; }
.do-doc p { margin: 2px 0; }
.do-roll { padding: 5mm 4mm; font-size: 12px; line-height: 1.45; }
.do-roll.do-54 { width: 54mm; font-size: 11px; line-height: 1.4; }
.do-roll.do-80 { width: 80mm; font-size: 13px; line-height: 1.5; }
.do-roll .do-head { text-align: center; }
.do-roll .do-head img { display: block; margin: 0 auto 6px; max-height: 56px; max-width: 80%; object-fit: contain; }
.do-roll .do-head h1 { margin: 0; font-size: 1.35em; font-weight: 800; }
.do-badge { display: inline-block; margin-top: 6px; padding: 2px 10px; border: 1.5px solid #0f172a; border-radius: 999px; font-size: 0.85em; font-weight: 800; letter-spacing: 0.12em; }
.do-divider { border-top: 1px dashed #475569; margin: 8px 0; }
.do-roll h2 { margin: 7px 0 5px; border-left: 3px solid #2563eb; padding-left: 5px; font-size: 1em; font-weight: 800; text-transform: uppercase; }
.do-line { border-bottom: 1px dotted #cbd5e1; padding: 4px 0; }
.do-line .row { display: flex; justify-content: space-between; gap: 8px; }
.do-line .sub { color: #64748b; font-size: 0.88em; }
.do-sum p { display: flex; justify-content: space-between; margin: 4px 0; }
.do-sum .total { border-top: 1px solid #1d4ed8; padding-top: 6px; font-size: 1.25em; }
.do-sign { margin-top: 12px; }
.do-sign .title { text-align: center; font-weight: 600; margin-bottom: 8px; }
.do-sign .box { border: 1px solid #334155; border-radius: 4px; min-height: 52px; padding: 8px 10px; display: flex; align-items: flex-end; justify-content: center; }
.do-sign .line { border-top: 1px solid #1f2937; width: 78%; }
.do-foot { border-top: 1px dashed #475569; margin-top: 9px; padding-top: 7px; text-align: center; font-weight: 700; }
.do-credit { font-size: 0.85em; font-weight: 600; color: #475569; }

.do-a4 { width: 210mm; min-height: 297mm; padding: 14mm 14mm 12mm; font-size: 12px; line-height: 1.5; display: flex; flex-direction: column; }
.do-a4 .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 3px solid #1d4ed8; }
.do-a4 .brand { display: flex; gap: 12px; align-items: flex-start; }
.do-a4 .brand img { max-height: 64px; max-width: 120px; object-fit: contain; }
.do-a4 .brand h1 { margin: 0 0 2px; font-size: 20px; font-weight: 800; }
.do-a4 .brand p { color: #475569; }
.do-a4 .title { text-align: right; }
.do-a4 .title h2 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.06em; color: #1d4ed8; }
.do-a4 .title .no { font-size: 14px; font-weight: 700; }
.do-a4 .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
.do-a4 .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc; }
.do-a4 .card .label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
.do-a4 .card .kv { display: flex; justify-content: space-between; gap: 8px; }
.do-a4 .card .kv span:first-child { color: #64748b; }
.do-a4 table { width: 100%; border-collapse: collapse; }
.do-a4 thead th { background: #1e293b; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px; text-align: left; }
.do-a4 thead th.r, .do-a4 tbody td.r { text-align: right; }
.do-a4 tbody td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.do-a4 tbody tr:nth-child(even) td { background: #f8fafc; }
.do-a4 tbody td .code { color: #64748b; font-size: 10.5px; }
.do-a4 .bottom { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; }
.do-a4 .notes { flex: 1; }
.do-a4 .totals { width: 76mm; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.do-a4 .totals p { display: flex; justify-content: space-between; margin: 0; padding: 6px 12px; }
.do-a4 .totals .grand { background: #1d4ed8; color: #fff; font-size: 15px; font-weight: 800; }
.do-a4 .signs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: auto; padding-top: 36px; }
.do-a4 .signs div { border-top: 1px solid #334155; padding-top: 6px; text-align: center; font-size: 11px; color: #475569; }
.do-a4 .credit { margin-top: 14px; text-align: center; font-size: 10px; color: #94a3b8; }
`;

export default function DoReceiptPreview({ doId, token, apiUrl, onClose }: Props) {
  const [paper, setPaper] = useState<PaperSize>(() => {
    try {
      const saved = localStorage.getItem(PAPER_KEY);
      return saved === '54mm' || saved === '80mm' || saved === 'A4' ? saved : '80mm';
    } catch {
      return '80mm';
    }
  });
  // Result of the last fetch; "loading" is derived from whether it belongs to the requested DO.
  const [result, setResult] = useState<{ doId: number; record: DoRecord | null; company: Company; error: string } | null>(null);
  const [failedLogo, setFailedLogo] = useState('');
  const loading = Boolean(doId) && result?.doId !== doId;
  const record = loading ? null : result?.record ?? null;
  const company = (loading ? null : result?.company) ?? {};
  const error = loading ? '' : result?.error ?? '';
  const docRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { localStorage.setItem(PAPER_KEY, paper); } catch { /* ignore */ }
  }, [paper]);

  useEffect(() => {
    if (!doId || !token) return;
    let active = true;
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      axios.get(`${apiUrl}/api/distribution/dos/${doId}`, { headers }),
      axios.get(`${apiUrl}/api/companies`, { headers }).catch(() => null),
    ])
      .then(([doRes, companyRes]) => {
        if (!active) return;
        const payload = companyRes?.data;
        const rows = (Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []) as Array<Company & { id?: number }>;
        let profileId = 0;
        try { profileId = Number(localStorage.getItem(COMPANY_PROFILE_ID_KEY) || 0); } catch { /* ignore */ }
        setResult({
          doId,
          record: (doRes.data?.data || null) as DoRecord | null,
          company: rows.find((row) => Number(row.id) === profileId) || rows[0] || {},
          error: '',
        });
      })
      .catch(() => {
        if (active) setResult({ doId, record: null, company: {}, error: 'Could not load the DO for printing.' });
      });

    return () => { active = false; };
  }, [apiUrl, doId, token]);

  const figures = useMemo(() => {
    const items = record?.items || [];
    const gross = items.reduce((sum, item) => sum + num(item.quantity) * num(item.unit_price), 0);
    const itemDiscount = items.reduce((sum, item) => sum + num(item.quantity) * num(item.discount), 0);
    const billDiscount = num(record?.discount);
    const total = record?.total != null ? num(record.total) : Math.max(gross - itemDiscount - billDiscount, 0);
    const paid = num(record?.paid_amount);
    const qty = items.reduce((sum, item) => sum + num(item.quantity), 0);
    return { gross, itemDiscount, billDiscount, total, paid, balance: Math.max(total - paid, 0), qty };
  }, [record]);

  if (!doId) return null;

  const resolvedLogo = resolveLogo(company);
  const logo = resolvedLogo && resolvedLogo !== failedLogo ? resolvedLogo : '';
  const deliveryDate = record?.delivery_date || record?.due_date;
  const notes = cleanNotes(record?.notes);
  const isRoll = paper !== 'A4';

  const print = () => {
    const node = docRef.current;
    if (!node) return;
    const pageRule = isRoll ? `@page { size: ${paper} auto; margin: 0; }` : '@page { size: A4; margin: 0; }';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${record?.do_number || 'Delivery Order'}</title>${DM_SANS_LINK}
<style>${pageRule} html, body { margin: 0; padding: 0; background: #fff; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } ${RECEIPT_CSS}</style>
</head><body>${node.outerHTML}</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);
    const frameWindow = iframe.contentWindow;
    const frameDoc = frameWindow?.document;
    if (!frameWindow || !frameDoc) {
      iframe.remove();
      return;
    }
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(() => iframe.remove(), 1000);
    };
    const afterLoad = () => {
      const fontsReady = frameDoc.fonts?.ready ?? Promise.resolve();
      Promise.race([fontsReady, new Promise((resolve) => window.setTimeout(resolve, 1500))]).then(doPrint, doPrint);
    };
    if (frameDoc.readyState === 'complete') afterLoad();
    else frameWindow.addEventListener('load', afterLoad, { once: true });
    window.setTimeout(doPrint, 4000);
  };

  const items = record?.items || [];

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6">
      <style>{RECEIPT_CSS}</style>
      <div className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Delivery Order Preview</h3>
            <p className="text-xs text-slate-500">Choose a POS roll width or A4 paper, then print.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={paper}
              onChange={(event) => setPaper(event.target.value as PaperSize)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              aria-label="Paper size"
            >
              <option value="54mm">54mm roll</option>
              <option value="80mm">80mm roll</option>
              <option value="A4">A4 paper</option>
            </select>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Close</button>
            <button
              type="button"
              onClick={print}
              disabled={!record || loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Print
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="mx-auto max-w-md rounded-xl bg-white"><PageSkeleton compact /></div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : record ? (
            <div className={`mx-auto w-fit shadow-lg ${isRoll ? '' : 'origin-top scale-[0.85] sm:scale-100'}`}>
              {isRoll ? (
                <div ref={docRef} className={`do-doc do-roll ${paper === '54mm' ? 'do-54' : 'do-80'}`}>
                  <header className="do-head">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" onError={() => setFailedLogo(resolvedLogo)} />
                    ) : null}
                    <h1>{company.name || 'Company'}</h1>
                    {company.address ? <p>{company.address}</p> : null}
                    {company.phone ? <p>Tel: {company.phone}</p> : null}
                    {company.email ? <p>{company.email}</p> : null}
                    <span className="do-badge">DELIVERY ORDER</span>
                  </header>

                  <div className="do-divider" />
                  <section>
                    <p><strong>DO No:</strong> {record.do_number}</p>
                    <p><strong>Date:</strong> {formatDateTime(record.created_at || record.do_date)}</p>
                    <p><strong>Delivery:</strong> {formatDate(deliveryDate)}</p>
                    <p><strong>Customer:</strong> {record.customer?.shop_name || '-'}</p>
                    {record.customer?.customer_code ? <p><strong>Code:</strong> {record.customer.customer_code}</p> : null}
                  </section>

                  <div className="do-divider" />
                  <section>
                    <h2>Delivery Items</h2>
                    {items.map((item) => {
                      const qty = num(item.quantity);
                      const unitPrice = num(item.unit_price);
                      const perUnitDiscount = num(item.discount);
                      return (
                        <div key={item.id} className="do-line">
                          <div className="row"><span>{item.item_name}</span><strong>{money(qty * unitPrice)}</strong></div>
                          <div>{qty.toFixed(2)} x {money(unitPrice)}{item.unit ? ` / ${item.unit}` : ''}</div>
                          {perUnitDiscount > 0 ? (
                            <div className="sub">Discount: {money(qty * perUnitDiscount)} ({money(perUnitDiscount)} / unit)</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </section>

                  <div className="do-divider" />
                  <section className="do-sum">
                    <p><span>Total quantity</span><strong>{figures.qty.toFixed(2)}</strong></p>
                    <p><span>Subtotal</span><strong>{money(figures.gross)}</strong></p>
                    {figures.itemDiscount > 0 ? <p><span>Item discounts</span><strong>-{money(figures.itemDiscount)}</strong></p> : null}
                    {figures.billDiscount > 0 ? <p><span>Bill discount</span><strong>-{money(figures.billDiscount)}</strong></p> : null}
                    <p className="total"><span>Total</span><strong>{money(figures.total)}</strong></p>
                    <p><span>Paid</span><strong>{money(figures.paid)}</strong></p>
                    <p><span>Balance</span><strong>{money(figures.balance)}</strong></p>
                  </section>

                  {notes ? (
                    <>
                      <div className="do-divider" />
                      <p><strong>Notes:</strong> {notes}</p>
                    </>
                  ) : null}

                  <section className="do-sign">
                    <p className="title">Received in good condition</p>
                    <div className="box"><div className="line" /></div>
                  </section>
                  <footer className="do-foot">
                    <p>Thank you</p>
                    <p className="do-credit">Software By Softcodelk(PVT)Ltd - 0702932000</p>
                  </footer>
                </div>
              ) : (
                <div ref={docRef} className="do-doc do-a4">
                  <div className="top">
                    <div className="brand">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" onError={() => setFailedLogo(resolvedLogo)} />
                      ) : null}
                      <div>
                        <h1>{company.name || 'Company'}</h1>
                        {company.address ? <p>{company.address}</p> : null}
                        <p>{[company.phone ? `Tel: ${company.phone}` : '', company.email || ''].filter(Boolean).join('  ·  ')}</p>
                      </div>
                    </div>
                    <div className="title">
                      <h2>DELIVERY ORDER</h2>
                      <p className="no">{record.do_number}</p>
                      <p>{formatDateTime(record.created_at || record.do_date)}</p>
                    </div>
                  </div>

                  <div className="meta">
                    <div className="card">
                      <p className="label">Deliver to</p>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{record.customer?.shop_name || '-'}</p>
                      {record.customer?.customer_code ? <p>Code: {record.customer.customer_code}</p> : null}
                    </div>
                    <div className="card">
                      <p className="label">Delivery details</p>
                      <p className="kv"><span>DO date</span><strong>{formatDate(record.do_date)}</strong></p>
                      <p className="kv"><span>Delivery date</span><strong>{formatDate(deliveryDate)}</strong></p>
                      <p className="kv"><span>Customer call</span><strong>{record.call_confirmed ? 'Confirmed' : 'Not confirmed'}</strong></p>
                    </div>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '6%' }}>#</th>
                        <th>Item</th>
                        <th className="r" style={{ width: '11%' }}>Qty</th>
                        <th className="r" style={{ width: '14%' }}>Unit price</th>
                        <th className="r" style={{ width: '14%' }}>Discount</th>
                        <th className="r" style={{ width: '15%' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        const qty = num(item.quantity);
                        const unitPrice = num(item.unit_price);
                        const lineDiscount = qty * num(item.discount);
                        return (
                          <tr key={item.id}>
                            <td>{index + 1}</td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                              <div className="code">{item.item_code}</div>
                            </td>
                            <td className="r">{qty.toFixed(2)}{item.unit ? ` ${item.unit}` : ''}</td>
                            <td className="r">{money(unitPrice)}</td>
                            <td className="r">{lineDiscount > 0 ? `-${money(lineDiscount)}` : '-'}</td>
                            <td className="r" style={{ fontWeight: 700 }}>{money(qty * unitPrice - lineDiscount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="bottom">
                    <div className="notes">
                      <p><strong>Total quantity:</strong> {figures.qty.toFixed(2)}</p>
                      {notes ? <p style={{ marginTop: 6 }}><strong>Notes:</strong> {notes}</p> : null}
                    </div>
                    <div className="totals">
                      <p><span>Subtotal</span><strong>{money(figures.gross)}</strong></p>
                      {figures.itemDiscount > 0 ? <p><span>Item discounts</span><strong>-{money(figures.itemDiscount)}</strong></p> : null}
                      {figures.billDiscount > 0 ? <p><span>Bill discount</span><strong>-{money(figures.billDiscount)}</strong></p> : null}
                      <p className="grand"><span>Total</span><span>{money(figures.total)}</span></p>
                      <p><span>Paid</span><strong>{money(figures.paid)}</strong></p>
                      <p><span>Balance</span><strong>{money(figures.balance)}</strong></p>
                    </div>
                  </div>

                  <div className="signs">
                    <div>Prepared by</div>
                    <div>Driver / Delivered by</div>
                    <div>Customer signature</div>
                  </div>
                  <p className="credit">Software By Softcodelk(PVT)Ltd - 0702932000</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
