'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type AssistantMode = 'help' | 'document' | 'graph' | 'details';

type AssistantPayload = {
  answer: string;
  document: string;
  graph_mermaid: string;
  details: string[];
  mode: AssistantMode;
};

type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  mode: AssistantMode;
  prompt: string;
};

const helpTopics: HelpTopic[] = [
  {
    id: 'invoice-returns',
    title: 'Invoice Returns and Deductions',
    summary: 'Draft return handling steps with damaged marking and deductions.',
    mode: 'help',
    prompt: 'How do I handle invoice returns with damaged item deduction in BMS?',
  },
  {
    id: 'workflow-document',
    title: 'Document Making',
    summary: 'Generate SOP, memo, or user instruction documents.',
    mode: 'document',
    prompt: 'Create a one-page SOP for GRN verification and stock update workflow.',
  },
  {
    id: 'process-graph',
    title: 'Graph Previewing',
    summary: 'Generate a process flow graph (Mermaid) from your scenario.',
    mode: 'graph',
    prompt: 'Create a flowchart for invoice creation, return deduction, payment and closing.',
  },
  {
    id: 'detail-finder',
    title: 'Find Details',
    summary: 'Extract risks, missing checks, and key details from user questions.',
    mode: 'details',
    prompt: 'Find critical checks before confirming a vehicle load with batch-based items.',
  },
];

const modeLabel: Record<AssistantMode, string> = {
  help: 'Help',
  document: 'Document',
  graph: 'Graph',
  details: 'Detail Finder',
};

const parseGraphEdges = (mermaid: string): string[] => {
  const lines = mermaid
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const edges: string[] = [];

  for (const line of lines) {
    if (line.startsWith('flowchart') || line.startsWith('graph') || line.startsWith('%%')) continue;

    const matches = line.match(/([A-Za-z0-9_\-\[\]\(\)"' ]+)\s*[-=.]+>\s*([A-Za-z0-9_\-\[\]\(\)"' ]+)/g);
    if (!matches) continue;

    for (const part of matches) {
      const simple = part
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (simple) edges.push(simple);
    }
  }

  return Array.from(new Set(edges)).slice(0, 12);
};

export default function DashboardAssistantPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<AssistantMode>('help');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<AssistantPayload | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const graphEdges = useMemo(
    () => parseGraphEdges(response?.graph_mermaid || ''),
    [response?.graph_mermaid]
  );

  const submitQuery = async () => {
    const prompt = question.trim();
    if (!prompt || !token) return;

    try {
      setLoading(true);
      setError('');

      const result = await axios.post(
        '/api/assistant/query',
        { prompt, mode },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = result?.data?.data as AssistantPayload | undefined;
      if (!data) {
        setError('Assistant returned empty response.');
        return;
      }

      setResponse({
        answer: String(data.answer || ''),
        document: String(data.document || ''),
        graph_mermaid: String(data.graph_mermaid || ''),
        details: Array.isArray(data.details) ? data.details.map((x) => String(x)) : [],
        mode: (data.mode || mode) as AssistantMode,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Assistant request failed.');
    } finally {
      setLoading(false);
    }
  };

  const applyTopic = (topic: HelpTopic) => {
    setMode(topic.mode);
    setQuestion(topic.prompt);
  };

  const copyText = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op
    }
  };

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_8%_10%,_rgba(34,211,238,0.2),_transparent_28%),radial-gradient(circle_at_90%_12%,_rgba(16,185,129,0.22),_transparent_30%),radial-gradient(circle_at_70%_88%,_rgba(14,165,233,0.18),_transparent_30%),linear-gradient(180deg,_#ecfeff_0%,_#f8fafc_42%,_#f0fdfa_100%)] p-4 sm:p-6 lg:p-8"
      style={{ fontFamily: "'Space Grotesk', 'Manrope', 'Segoe UI', sans-serif" }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 overflow-hidden rounded-[30px] border border-white/85 bg-white/85 p-5 shadow-[0_28px_100px_-42px_rgba(6,182,212,0.55)] backdrop-blur-xl sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                Skilled AI Assistant
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Work with SaaraAI</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Live AI support for document making, graph previewing, and finding operational details.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-100"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-white/80 bg-white/92 p-5 shadow-[0_20px_70px_-35px_rgba(14,165,233,0.5)]">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Ask Assistant</h2>
                <p className="mt-1 text-sm text-slate-500">Choose mode and enter your question.</p>
              </div>
              <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-700">Mode</p>
                <p className="text-sm font-bold text-slate-900">{modeLabel[mode]}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(modeLabel) as AssistantMode[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setMode(entry)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    mode === entry
                      ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50'
                  }`}
                >
                  {modeLabel[entry]}
                </button>
              ))}
            </div>

            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Type your request..."
              rows={6}
              className="mt-3 w-full rounded-2xl border border-cyan-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
            />

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">Tip: use Document mode for SOPs, Graph mode for process maps.</p>
              <button
                type="button"
                onClick={submitQuery}
                disabled={loading || !question.trim() || !token}
                className="rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-200/80 transition hover:from-cyan-700 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Thinking...' : 'Ask Assistant'}
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            {response && (
              <div className="mt-4 space-y-3 rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/80 via-white to-emerald-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Assistant Answer</p>
                  <button
                    type="button"
                    onClick={() => copyText(response.answer)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Copy
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{response.answer || 'No summary returned.'}</p>

                {response.document && (
                  <div className="rounded-xl border border-emerald-100 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Document Draft</p>
                      <button
                        type="button"
                        onClick={() => copyText(response.document)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs text-slate-700">{response.document}</pre>
                  </div>
                )}

                {response.graph_mermaid && (
                  <div className="rounded-xl border border-sky-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Graph Preview</p>
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{response.graph_mermaid}</pre>
                    {graphEdges.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {graphEdges.map((edge) => (
                          <div key={edge} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                            {edge}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {response.details.length > 0 && (
                  <div className="rounded-xl border border-amber-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Detail Finder</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {response.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/92 p-5 shadow-[0_20px_70px_-35px_rgba(16,185,129,0.5)]">
            <h2 className="text-base font-semibold text-slate-900">Quick Starter</h2>
            <p className="mt-1 text-xs text-slate-500">Tap a scenario to auto-fill prompt + mode.</p>
            <div className="mt-3 space-y-2.5">
              {helpTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => applyTopic(topic)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{topic.title}</p>
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-cyan-700">
                      {modeLabel[topic.mode]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{topic.summary}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
