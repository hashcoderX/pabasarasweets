'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AxiosInstance } from 'axios';

/* ----------------------------------------------------------------------------
 * Amount → words (Sri Lankan cheque style, international numbering)
 * ------------------------------------------------------------------------- */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES: Array<[number, string]> = [
  [1_000_000_000, 'Billion'],
  [1_000_000, 'Million'],
  [1_000, 'Thousand'],
];

const belowThousand = (n: number): string => {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else parts.push([TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join(' '));
  }
  return parts.join(' ');
};

export const integerToWords = (value: number): string => {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  for (const [size, label] of SCALES) {
    if (n >= size) {
      parts.push(`${belowThousand(Math.floor(n / size))} ${label}`);
      n %= size;
    }
  }
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
};

export const amountToWords = (amount: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const totalCents = Math.round(amount * 100);
  const rupees = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const rupeeWords = rupees > 0 ? `${integerToWords(rupees)} ${rupees === 1 ? 'Rupee' : 'Rupees'}` : '';
  const centWords = cents > 0 ? `${integerToWords(cents)} ${cents === 1 ? 'Cent' : 'Cents'}` : '';
  return `${[rupeeWords, centWords].filter(Boolean).join(' and ')} Only`;
};

const formatFigures = (amount: number): string =>
  `**${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**`;

/* ----------------------------------------------------------------------------
 * Layout model (all positions in millimetres from the cheque's top-left corner)
 * ------------------------------------------------------------------------- */

type FieldKey = 'date' | 'payee' | 'amount_words' | 'amount_figures' | 'ac_payee';
type DateFormat = 'DDMMYYYY' | 'DD/MM/YYYY' | 'DD-MM-YYYY';

type FieldLayout = {
  x: number;
  y: number;
  font_size: number;
  enabled: boolean;
  width?: number; // wrap width (amount in words, payee)
  line_height?: number; // amount in words second line spacing
  digit_pitch?: number; // date: mm between digit boxes (DDMMYYYY only)
};

type ChequeLayout = {
  date_format: DateFormat;
  offset_x: number; // printer calibration
  offset_y: number;
  fields: Record<FieldKey, FieldLayout>;
};

export type ChequePrintFormat = {
  id: number;
  name: string;
  bank_name?: string | null;
  width_mm: number;
  height_mm: number;
  layout?: Partial<ChequeLayout> | null;
  is_default: boolean;
  sample_image?: string | null;
};

const FIELD_LABELS: Record<FieldKey, string> = {
  date: 'Date',
  payee: 'Payee',
  amount_words: 'Amount in words',
  amount_figures: 'Amount (figures)',
  ac_payee: 'A/C Payee crossing',
};

const FIELD_ORDER: FieldKey[] = ['date', 'payee', 'amount_words', 'amount_figures', 'ac_payee'];

const DEFAULT_WIDTH = 178;
const DEFAULT_HEIGHT = 89;

const defaultLayout = (): ChequeLayout => ({
  date_format: 'DDMMYYYY',
  offset_x: 0,
  offset_y: 0,
  fields: {
    date: { x: 128, y: 7, font_size: 12, enabled: true, digit_pitch: 5.2 },
    payee: { x: 22, y: 22, font_size: 12, enabled: true, width: 140 },
    amount_words: { x: 22, y: 31, font_size: 11, enabled: true, width: 105, line_height: 8 },
    amount_figures: { x: 132, y: 38, font_size: 13, enabled: true },
    ac_payee: { x: 6, y: 4, font_size: 8, enabled: true },
  },
});

const mergeLayout = (layout?: Partial<ChequeLayout> | null): ChequeLayout => {
  const base = defaultLayout();
  if (!layout) return base;
  const fields = { ...base.fields };
  FIELD_ORDER.forEach((key) => {
    fields[key] = { ...base.fields[key], ...(layout.fields?.[key] || {}) };
  });
  return {
    date_format: layout.date_format || base.date_format,
    offset_x: Number(layout.offset_x ?? 0),
    offset_y: Number(layout.offset_y ?? 0),
    fields,
  };
};

const formatChequeDate = (isoDate: string, format: DateFormat): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate || '');
  if (!match) return '';
  const [, yyyy, mm, dd] = match;
  if (format === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
  if (format === 'DD-MM-YYYY') return `${dd}-${mm}-${yyyy}`;
  return `${dd}${mm}${yyyy}`;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const round1 = (value: number) => Math.round(value * 2) / 2;

/* ----------------------------------------------------------------------------
 * Component
 * ------------------------------------------------------------------------- */

export type ChequePrintPrefill = {
  payee?: string;
  amount?: number | string;
  chequeDate?: string;
};

type Props = {
  open: boolean;
  api: AxiosInstance;
  prefill?: ChequePrintPrefill | null;
  onClose: () => void;
};

type FormatForm = {
  id: number | null;
  name: string;
  bankName: string;
  widthMm: string;
  heightMm: string;
  isDefault: boolean;
  imageFile: File | null;
  imagePreview: string;
  removeImage: boolean;
};

const emptyFormatForm = (): FormatForm => ({
  id: null,
  name: '',
  bankName: '',
  widthMm: String(DEFAULT_WIDTH),
  heightMm: String(DEFAULT_HEIGHT),
  isDefault: false,
  imageFile: null,
  imagePreview: '',
  removeImage: false,
});

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100';
const smallInputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none';

export default function ChequePrintModal({ open, api, prefill, onClose }: Props) {
  const [tab, setTab] = useState<'print' | 'formats'>('print');
  const [formats, setFormats] = useState<ChequePrintFormat[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState<number | 0>(0);
  const [layout, setLayout] = useState<ChequeLayout>(defaultLayout);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [editPositions, setEditPositions] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [payee, setPayee] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [wordsOverride, setWordsOverride] = useState<string | null>(null);
  const [printBackground, setPrintBackground] = useState(false);

  const [formatForm, setFormatForm] = useState<FormatForm>(emptyFormatForm);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewWidthPx, setPreviewWidthPx] = useState(640);
  const dragRef = useRef<{ key: FieldKey; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const selectedFormat = formats.find((format) => format.id === selectedFormatId) || null;
  const widthMm = selectedFormat?.width_mm || DEFAULT_WIDTH;
  const heightMm = selectedFormat?.height_mm || DEFAULT_HEIGHT;
  const scale = previewWidthPx / widthMm; // px per mm

  const amount = Number(amountInput);
  const autoWords = useMemo(() => amountToWords(amount), [amount]);
  const amountWords = wordsOverride ?? autoWords;
  const figures = Number.isFinite(amount) && amount > 0 ? formatFigures(amount) : '';
  const dateText = formatChequeDate(chequeDate, layout.date_format);

  const loadFormats = useCallback(async (preferId?: number) => {
    setFormatsLoading(true);
    try {
      const response = await api.get('/cheque-print-formats');
      const rows = (Array.isArray(response.data?.data) ? response.data.data : []) as ChequePrintFormat[];
      setFormats(rows);
      const next = rows.find((row) => row.id === preferId) || rows.find((row) => row.is_default) || rows[0];
      setSelectedFormatId(next?.id || 0);
      setLayout(mergeLayout(next?.layout));
      setLayoutDirty(false);
    } catch {
      setMessage({ tone: 'error', text: 'Could not load cheque formats.' });
    } finally {
      setFormatsLoading(false);
    }
  }, [api]);

  // Reset the form from the prefill each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setPayee(prefill?.payee || '');
    setChequeDate((prefill?.chequeDate || new Date().toISOString()).slice(0, 10));
    const prefillAmount = Number(prefill?.amount || 0);
    setAmountInput(prefillAmount > 0 ? String(prefillAmount) : '');
    setWordsOverride(null);
    setEditPositions(false);
    setTab('print');
    void loadFormats();
  }, [open, prefill, loadFormats]);

  // Keep the preview scaled to the available width.
  useEffect(() => {
    if (!open || tab !== 'print') return;
    const element = previewRef.current;
    if (!element) return;
    const update = () => setPreviewWidthPx(Math.max(280, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open, tab]);

  const selectFormat = (id: number) => {
    const next = formats.find((format) => format.id === id) || null;
    setSelectedFormatId(next?.id || 0);
    setLayout(mergeLayout(next?.layout));
    setLayoutDirty(false);
  };

  const updateField = (key: FieldKey, patch: Partial<FieldLayout>) => {
    setLayout((prev) => ({ ...prev, fields: { ...prev.fields, [key]: { ...prev.fields[key], ...patch } } }));
    setLayoutDirty(true);
  };

  /* ---------- drag to position ---------- */

  const onFieldPointerDown = (key: FieldKey) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (!editPositions) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      key,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.fields[key].x,
      originY: layout.fields[key].y,
    };
  };

  const onFieldPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    updateField(drag.key, {
      x: Math.min(widthMm - 2, Math.max(0, round1(drag.originX + dx))),
      y: Math.min(heightMm - 2, Math.max(0, round1(drag.originY + dy))),
    });
  };

  const onFieldPointerUp = () => {
    dragRef.current = null;
  };

  /* ---------- rendering of field content (shared by preview + print) ---------- */

  const fieldText = (key: FieldKey): string => {
    switch (key) {
      case 'date': return dateText;
      case 'payee': return payee.trim();
      case 'amount_words': return amountWords.trim();
      case 'amount_figures': return figures;
      case 'ac_payee': return 'A/C PAYEE ONLY';
      default: return '';
    }
  };

  const renderDateDigits = (text: string, pitch: number, unit: (mm: number) => string) =>
    text.split('').map((char, index) => (
      `<span style="position:absolute;left:${unit(index * pitch)};top:0;width:${unit(pitch)};text-align:center">${escapeHtml(char)}</span>`
    )).join('');

  const buildFieldHtml = (key: FieldKey, unit: (mm: number) => string): string => {
    const field = layout.fields[key];
    const text = fieldText(key);
    if (!field.enabled || !text) return '';
    const left = unit(field.x + layout.offset_x);
    const top = unit(field.y + layout.offset_y);
    const fontSize = `${field.font_size}pt`;

    if (key === 'date' && layout.date_format === 'DDMMYYYY') {
      const pitch = field.digit_pitch || 5;
      return `<div style="position:absolute;left:${left};top:${top};height:${unit(6)};width:${unit(pitch * 8)};font-size:${fontSize};font-weight:600;letter-spacing:0">${renderDateDigits(text, pitch, unit)}</div>`;
    }

    if (key === 'ac_payee') {
      return `<div style="position:absolute;left:${left};top:${top};font-size:${fontSize};font-weight:700;padding:${unit(0.8)} ${unit(1.5)};border-top:1px solid #000;border-bottom:1px solid #000;transform:rotate(-12deg);transform-origin:left top;white-space:nowrap">${escapeHtml(text)}</div>`;
    }

    if (key === 'amount_words') {
      const width = unit(field.width || 105);
      const lineHeight = unit(field.line_height || 8);
      return `<div style="position:absolute;left:${left};top:${top};width:${width};font-size:${fontSize};line-height:${lineHeight};font-weight:600;white-space:normal;word-wrap:break-word">${escapeHtml(text)}</div>`;
    }

    if (key === 'payee') {
      const width = unit(field.width || 140);
      return `<div style="position:absolute;left:${left};top:${top};width:${width};font-size:${fontSize};font-weight:600;white-space:nowrap;overflow:hidden">${escapeHtml(text)}</div>`;
    }

    return `<div style="position:absolute;left:${left};top:${top};font-size:${fontSize};font-weight:700;white-space:nowrap">${escapeHtml(text)}</div>`;
  };

  /* ---------- print ---------- */

  const validateForPrint = (): string | null => {
    if (!payee.trim()) return 'Enter the payee name.';
    if (!chequeDate) return 'Select the cheque date.';
    if (!(amount > 0)) return 'Enter a valid amount.';
    if (amount >= 1_000_000_000_000) return 'Amount is too large.';
    return null;
  };

  const printCheque = () => {
    const problem = validateForPrint();
    if (problem) {
      setMessage({ tone: 'error', text: problem });
      return;
    }
    setMessage(null);

    const mm = (value: number) => `${value}mm`;
    const fieldsHtml = FIELD_ORDER.map((key) => buildFieldHtml(key, mm)).join('');
    const background = printBackground && selectedFormat?.sample_image
      ? `<img src="${selectedFormat.sample_image}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill" />`
      : '';

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cheque</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet">
<style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { position: relative; width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; font-family: "DM Sans", sans-serif; color: #000; }
</style></head><body><div class="sheet">${background}${fieldsHtml}</div></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      iframe.remove();
      setMessage({ tone: 'error', text: 'Unable to open the print preview.' });
      return;
    }

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();

    const cleanup = () => window.setTimeout(() => iframe.remove(), 1000);
    const doPrint = () => {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };

    // Wait for the DM Sans stylesheet, fonts and any sample image so text lands in the right place.
    let printed = false;
    const printOnce = () => {
      if (printed) return;
      printed = true;
      doPrint();
    };
    const afterLoad = () => {
      const fontsReady = frameDocument.fonts?.ready ?? Promise.resolve();
      Promise.race([fontsReady, new Promise((resolve) => window.setTimeout(resolve, 1500))]).then(printOnce, printOnce);
    };
    if (frameDocument.readyState === 'complete') afterLoad();
    else frameWindow.addEventListener('load', afterLoad, { once: true });
    window.setTimeout(printOnce, 4000); // offline / slow network fallback
  };

  /* ---------- formats CRUD ---------- */

  const saveLayout = async () => {
    if (!selectedFormat) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('layout', JSON.stringify(layout));
      await api.post(`/cheque-print-formats/${selectedFormat.id}`, body);
      setFormats((prev) => prev.map((format) => (format.id === selectedFormat.id ? { ...format, layout } : format)));
      setLayoutDirty(false);
      setMessage({ tone: 'success', text: `Positions saved to "${selectedFormat.name}".` });
    } catch {
      setMessage({ tone: 'error', text: 'Could not save positions.' });
    } finally {
      setBusy(false);
    }
  };

  const onImageSelected = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setMessage({ tone: 'error', text: 'Upload a PNG, JPG or WEBP image of the cheque.' });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setMessage({ tone: 'error', text: 'Image must be 4 MB or smaller.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const preview = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        // Match the cheque height to the image proportions so the overlay lines up.
        setFormatForm((prev) => {
          const width = Number(prev.widthMm) || DEFAULT_WIDTH;
          const height = img.naturalWidth > 0 ? Math.round((width * img.naturalHeight / img.naturalWidth) * 10) / 10 : Number(prev.heightMm);
          return { ...prev, imageFile: file, imagePreview: preview, removeImage: false, heightMm: String(height) };
        });
      };
      img.src = preview;
    };
    reader.readAsDataURL(file);
  };

  const editFormat = (format: ChequePrintFormat) => {
    setFormatForm({
      id: format.id,
      name: format.name,
      bankName: format.bank_name || '',
      widthMm: String(format.width_mm),
      heightMm: String(format.height_mm),
      isDefault: format.is_default,
      imageFile: null,
      imagePreview: format.sample_image || '',
      removeImage: false,
    });
    setMessage(null);
  };

  const submitFormat = async () => {
    const width = Number(formatForm.widthMm);
    const height = Number(formatForm.heightMm);
    if (!formatForm.name.trim()) {
      setMessage({ tone: 'error', text: 'Enter a format name.' });
      return;
    }
    if (!(width >= 50 && width <= 300) || !(height >= 30 && height <= 200)) {
      setMessage({ tone: 'error', text: 'Width must be 50–300 mm and height 30–200 mm.' });
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append('name', formatForm.name.trim());
      body.append('bank_name', formatForm.bankName.trim());
      body.append('width_mm', String(width));
      body.append('height_mm', String(height));
      body.append('is_default', formatForm.isDefault ? '1' : '0');
      if (formatForm.imageFile) body.append('sample_image', formatForm.imageFile);
      if (formatForm.removeImage) body.append('remove_sample_image', '1');
      if (!formatForm.id) body.append('layout', JSON.stringify(defaultLayout()));

      const response = formatForm.id
        ? await api.post(`/cheque-print-formats/${formatForm.id}`, body)
        : await api.post('/cheque-print-formats', body);

      const savedId = Number(response.data?.data?.id || formatForm.id || 0);
      setFormatForm(emptyFormatForm());
      await loadFormats(savedId);
      setMessage({ tone: 'success', text: 'Cheque format saved. Use "Adjust positions" on the Print tab to line up the fields.' });
    } catch (error) {
      const data = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      const firstError = data?.errors ? Object.values(data.errors)[0]?.[0] : '';
      setMessage({ tone: 'error', text: firstError || data?.message || 'Could not save the cheque format.' });
    } finally {
      setBusy(false);
    }
  };

  const deleteFormat = async (format: ChequePrintFormat) => {
    if (!window.confirm(`Delete cheque format "${format.name}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/cheque-print-formats/${format.id}`);
      if (formatForm.id === format.id) setFormatForm(emptyFormatForm());
      await loadFormats();
      setMessage({ tone: 'success', text: 'Cheque format deleted.' });
    } catch {
      setMessage({ tone: 'error', text: 'Could not delete the cheque format.' });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  // Preview uses px so it can scale; font sizes in pt scale the same way (1pt = 0.3528mm).
  const previewFieldStyle = (key: FieldKey): React.CSSProperties => {
    const field = layout.fields[key];
    return {
      position: 'absolute',
      left: (field.x + layout.offset_x) * scale,
      top: (field.y + layout.offset_y) * scale,
      fontSize: field.font_size * 0.3528 * scale,
    };
  };

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Print Cheque</h2>
            <p className="text-xs text-slate-500">Type the amount as a number, it is written in words automatically and printed in the right places.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(['print', 'formats'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setTab(value); setMessage(null); }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${tab === value ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-white'}`}
                >
                  {value === 'print' ? 'Print' : 'Cheque Formats'}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Close
            </button>
          </div>
        </div>

        {message ? (
          <div className={`mx-5 mt-4 rounded-lg border px-4 py-2 text-sm ${message.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.text}
          </div>
        ) : null}

        {tab === 'print' ? (
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[340px_1fr]">
            {/* ---- form ---- */}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Cheque format</label>
                <div className="flex gap-2">
                  <select
                    value={selectedFormatId}
                    onChange={(e) => selectFormat(Number(e.target.value))}
                    className={inputClass}
                    disabled={formatsLoading}
                  >
                    {formats.length === 0 ? <option value={0}>Standard layout (no format uploaded)</option> : null}
                    {formats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.name}{format.bank_name ? ` – ${format.bank_name}` : ''}{format.is_default ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => { setTab('formats'); setMessage(null); }} className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Upload
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Pay (payee name)</label>
                <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Supplier or person name" className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Cheque date</label>
                  <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Amount (Rs.)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => { setAmountInput(e.target.value); setWordsOverride(null); }}
                    placeholder="0.00"
                    className={`${inputClass} text-right font-semibold`}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">Amount in words</label>
                  {wordsOverride !== null ? (
                    <button type="button" onClick={() => setWordsOverride(null)} className="text-[11px] font-semibold text-emerald-700 hover:underline">
                      Reset to automatic
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400">Automatic, you can edit</span>
                  )}
                </div>
                <textarea
                  value={amountWords}
                  onChange={(e) => setWordsOverride(e.target.value)}
                  rows={3}
                  placeholder="Type an amount above"
                  className={`${inputClass} resize-none`}
                />
                {figures ? <p className="mt-1 text-xs text-slate-500">Figures: <span className="font-semibold text-slate-800">{figures}</span></p> : null}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={layout.fields.ac_payee.enabled} onChange={(e) => updateField('ac_payee', { enabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                  Print &quot;A/C Payee Only&quot; crossing
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={printBackground} onChange={(e) => setPrintBackground(e.target.checked)} disabled={!selectedFormat?.sample_image} className="h-4 w-4 accent-emerald-600" />
                  Test print on plain paper (include sample image)
                </label>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <span>Date style</span>
                  <select
                    value={layout.date_format}
                    onChange={(e) => { setLayout((prev) => ({ ...prev, date_format: e.target.value as DateFormat })); setLayoutDirty(true); }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                  >
                    <option value="DDMMYYYY">D D M M Y Y Y Y (boxes)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={printCheque}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-700 hover:to-teal-700"
              >
                Print Cheque
              </button>
              <p className="text-[11px] leading-4 text-slate-500">
                In the print dialog choose your cheque printer, scale 100% (Actual size) and turn off headers and footers.
              </p>
            </div>

            {/* ---- preview ---- */}
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview · {widthMm} × {heightMm} mm
                </p>
                <div className="flex items-center gap-2">
                  {editPositions && selectedFormat ? (
                    <button
                      type="button"
                      onClick={saveLayout}
                      disabled={busy || !layoutDirty}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? 'Saving...' : 'Save positions'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditPositions((prev) => !prev)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${editPositions ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {editPositions ? 'Done adjusting' : 'Adjust positions'}
                  </button>
                </div>
              </div>

              <div ref={previewRef} className="w-full">
                <div
                  className="relative overflow-hidden rounded-lg border border-slate-300 bg-white shadow-inner"
                  style={{
                    width: previewWidthPx,
                    height: heightMm * scale,
                    backgroundImage: selectedFormat?.sample_image
                      ? `url(${selectedFormat.sample_image})`
                      : 'repeating-linear-gradient(0deg, #f8fafc, #f8fafc 18px, #f1f5f9 18px, #f1f5f9 19px)',
                    backgroundSize: '100% 100%',
                  }}
                >
                  {FIELD_ORDER.map((key) => {
                    const field = layout.fields[key];
                    if (!field.enabled) return null;
                    const text = fieldText(key) || (editPositions ? FIELD_LABELS[key] : '');
                    if (!text) return null;
                    const style = previewFieldStyle(key);
                    const isPlaceholder = !fieldText(key);
                    return (
                      <div
                        key={key}
                        onPointerDown={onFieldPointerDown(key)}
                        onPointerMove={onFieldPointerMove}
                        onPointerUp={onFieldPointerUp}
                        onPointerCancel={onFieldPointerUp}
                        title={editPositions ? `Drag to move ${FIELD_LABELS[key]}` : undefined}
                        className={`select-none text-black ${editPositions ? 'cursor-move rounded-sm bg-amber-200/40 outline outline-1 outline-dashed outline-amber-500' : ''} ${isPlaceholder ? 'italic text-slate-400' : ''}`}
                        style={{
                          ...style,
                          fontWeight: key === 'amount_figures' || key === 'ac_payee' ? 700 : 600,
                          whiteSpace: key === 'amount_words' ? 'normal' : 'nowrap',
                          width: key === 'amount_words' ? (field.width || 105) * scale : key === 'date' && layout.date_format === 'DDMMYYYY' ? (field.digit_pitch || 5) * 8 * scale : undefined,
                          lineHeight: key === 'amount_words' ? `${(field.line_height || 8) * scale}px` : undefined,
                          ...(key === 'ac_payee'
                            ? { borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: `${0.8 * scale}px ${1.5 * scale}px`, transform: 'rotate(-12deg)', transformOrigin: 'left top' }
                            : {}),
                        }}
                      >
                        {key === 'date' && layout.date_format === 'DDMMYYYY' && !isPlaceholder ? (
                          <span className="relative block" style={{ height: 6 * scale }}>
                            {text.split('').map((char, index) => (
                              <span
                                key={index}
                                className="absolute top-0 text-center"
                                style={{ left: index * (field.digit_pitch || 5) * scale, width: (field.digit_pitch || 5) * scale }}
                              >
                                {char}
                              </span>
                            ))}
                          </span>
                        ) : text}
                      </div>
                    );
                  })}
                </div>
              </div>

              {!selectedFormat?.sample_image ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Tip: upload a scanned sample of your bank&apos;s cheque under <b>Cheque Formats</b>, then use <b>Adjust positions</b> to drag each field onto its box.
                </p>
              ) : null}

              {editPositions ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Field</th>
                        <th className="px-2 py-2">Show</th>
                        <th className="px-2 py-2">X (mm)</th>
                        <th className="px-2 py-2">Y (mm)</th>
                        <th className="px-2 py-2">Font (pt)</th>
                        <th className="px-2 py-2">Width / pitch (mm)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {FIELD_ORDER.map((key) => {
                        const field = layout.fields[key];
                        const sizeKey: keyof FieldLayout | null =
                          key === 'date' ? 'digit_pitch' : key === 'amount_words' || key === 'payee' ? 'width' : null;
                        return (
                          <tr key={key}>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{FIELD_LABELS[key]}</td>
                            <td className="px-2 py-1.5">
                              <input type="checkbox" checked={field.enabled} onChange={(e) => updateField(key, { enabled: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                            </td>
                            {(['x', 'y', 'font_size'] as const).map((prop) => (
                              <td key={prop} className="w-20 px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  value={field[prop]}
                                  onChange={(e) => updateField(key, { [prop]: Number(e.target.value) || 0 })}
                                  className={smallInputClass}
                                />
                              </td>
                            ))}
                            <td className="w-24 px-2 py-1.5">
                              {sizeKey ? (
                                <input
                                  type="number"
                                  step="0.1"
                                  value={Number(field[sizeKey] || 0)}
                                  onChange={(e) => updateField(key, { [sizeKey]: Number(e.target.value) || 0 })}
                                  className={smallInputClass}
                                />
                              ) : <span className="text-slate-300">-</span>}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-50/60">
                        <td className="px-3 py-1.5 font-medium text-slate-700">Printer offset</td>
                        <td />
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.5" value={layout.offset_x} onChange={(e) => { setLayout((p) => ({ ...p, offset_x: Number(e.target.value) || 0 })); setLayoutDirty(true); }} className={smallInputClass} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.5" value={layout.offset_y} onChange={(e) => { setLayout((p) => ({ ...p, offset_y: Number(e.target.value) || 0 })); setLayoutDirty(true); }} className={smallInputClass} />
                        </td>
                        <td colSpan={2} className="px-2 py-1.5 text-[11px] text-slate-500">Shift everything if the printer prints slightly off.</td>
                      </tr>
                    </tbody>
                  </table>
                  {!selectedFormat ? (
                    <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-amber-700">Create a cheque format to save these positions permanently.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* ---- formats tab ---- */
          <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_380px]">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Saved cheque formats</h3>
              {formatsLoading ? (
                <div className="space-y-2">
                  {[0, 1].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : formats.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No cheque formats yet. Upload a sample cheque on the right.
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {formats.map((format) => (
                    <li key={format.id} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${format.id === formatForm.id ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
                      <div className="aspect-[2/1] bg-slate-100">
                        {format.sample_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={format.sample_image} alt={`${format.name} sample`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-slate-400">No sample image</div>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {format.name}
                            {format.is_default ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">DEFAULT</span> : null}
                          </p>
                          <p className="truncate text-xs text-slate-500">{format.bank_name || 'Any bank'} · {format.width_mm} × {format.height_mm} mm</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => editFormat(format)} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                          <button type="button" onClick={() => deleteFormat(format)} disabled={busy} className="rounded-md border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Delete</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">{formatForm.id ? 'Edit cheque format' : 'Upload sample cheque format'}</h3>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center hover:border-emerald-400">
                {formatForm.imagePreview && !formatForm.removeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={formatForm.imagePreview} alt="Sample cheque preview" className="max-h-40 w-full rounded object-contain" />
                ) : (
                  <>
                    <span className="text-2xl">🧾</span>
                    <span className="text-xs font-semibold text-slate-700">Click to upload a scanned cheque</span>
                    <span className="text-[11px] text-slate-500">PNG, JPG or WEBP up to 4 MB. Crop to the cheque edges.</span>
                  </>
                )}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { onImageSelected(e.target.files?.[0] || null); e.target.value = ''; }} />
              </label>
              {formatForm.imagePreview && !formatForm.removeImage ? (
                <button type="button" onClick={() => setFormatForm((p) => ({ ...p, imageFile: null, imagePreview: '', removeImage: Boolean(p.id) }))} className="text-xs font-semibold text-rose-600 hover:underline">
                  Remove image
                </button>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Format name</label>
                <input value={formatForm.name} onChange={(e) => setFormatForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. BOC current account" className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Bank (optional)</label>
                <input value={formatForm.bankName} onChange={(e) => setFormatForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="Bank name" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Width (mm)</label>
                  <input type="number" step="0.5" value={formatForm.widthMm} onChange={(e) => setFormatForm((p) => ({ ...p, widthMm: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Height (mm)</label>
                  <input type="number" step="0.5" value={formatForm.heightMm} onChange={(e) => setFormatForm((p) => ({ ...p, heightMm: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Measure your real cheque with a ruler. Height is filled from the image proportions when you upload.</p>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={formatForm.isDefault} onChange={(e) => setFormatForm((p) => ({ ...p, isDefault: e.target.checked }))} className="h-4 w-4 accent-emerald-600" />
                Use as default format
              </label>

              <div className="flex gap-2 pt-1">
                {formatForm.id ? (
                  <button type="button" onClick={() => setFormatForm(emptyFormatForm())} className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                ) : null}
                <button type="button" onClick={submitFormat} disabled={busy} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy ? 'Saving...' : formatForm.id ? 'Update format' : 'Save format'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
