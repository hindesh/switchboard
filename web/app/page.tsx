'use client';

import { useRef, useState, useEffect } from 'react';
import type { ConversationContext, OrchestratorEvent } from '@/lib/orchestrator';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Sparkles, Send, Key, MessageSquare, ShieldAlert, CheckCircle2, User, Bot, ServerCog } from 'lucide-react';
import Link from 'next/link';

type ProviderType = 'anthropic' | 'openai' | 'google';

type LogEntry =
  | { kind: 'node_start'; node: string }
  | { kind: 'node_reply'; node: string; content: string; confidence?: number }
  | { kind: 'routing'; from: string; to: string; reason: string }
  | { kind: 'context'; context: ConversationContext }
  | { kind: 'error'; message: string };

const NODE_LABEL: Record<string, string> = {
  vendor_bot: 'Vendor Bot',
  internal_agent: 'Internal Agent',
  human_agent: 'Human Agent',
};

const NODE_ICON: Record<string, any> = {
  vendor_bot: Bot,
  internal_agent: ServerCog,
  human_agent: User,
};

const NODE_STYLES: Record<string, { border: string; bg: string; badge: string; dot: string; glow: string }> = {
  vendor_bot: {
    border: 'border-blue-200/60',
    bg: 'bg-white/80 backdrop-blur-md shadow-[0_8px_30px_rgba(59,130,246,0.08)]',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
    glow: ''
  },
  internal_agent: {
    border: 'border-violet-200/60',
    bg: 'bg-white/80 backdrop-blur-md shadow-[0_8px_30px_rgba(139,92,246,0.08)]',
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
    dot: 'bg-violet-500',
    glow: ''
  },
  human_agent: {
    border: 'border-amber-200/60',
    bg: 'bg-white/80 backdrop-blur-md shadow-[0_8px_30px_rgba(245,158,11,0.08)]',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    glow: ''
  },
};

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic Claude', keyPlaceholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI GPT-4', keyPlaceholder: 'sk-...' },
  { id: 'google', name: 'Google Gemini', keyPlaceholder: 'AIza...' },
] as const;

const DEFAULT_MESSAGE =
  "I bought $500 of ETH about 2 hours ago. The money left my bank account but the crypto never showed up in my wallet. The transaction shows 'pending'. I've already tried refreshing and logging out.";

export default function Home() {
  const [provider, setProvider] = useState<ProviderType>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const append = (entry: LogEntry) => {
    setLog(prev => [...prev, entry]);
  };

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [log]);

  const run = async () => {
    if (!apiKey.trim() || !message.trim() || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLog([]);
    setRunning(true);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, userMessage: message }),
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event: OrchestratorEvent = JSON.parse(line.slice(6));
          if (event.type === 'node_start') append({ kind: 'node_start', node: event.node });
          else if (event.type === 'node_reply') append({ kind: 'node_reply', node: event.node, content: event.content, confidence: event.confidence });
          else if (event.type === 'routing') append({ kind: 'routing', from: event.from, to: event.to, reason: event.reason });
          else if (event.type === 'context') append({ kind: 'context', context: event.context });
          else if (event.type === 'error') append({ kind: 'error', message: event.message });
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        append({ kind: 'error', message: String(err) });
      }
    } finally {
      setRunning(false);
    }
  };

  const hasOutput = log.length > 0;
  const currentProvider = PROVIDERS.find(p => p.id === provider)!;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-500/20 overflow-hidden flex flex-col relative">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-indigo-100/60 to-transparent pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-400/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-400/20 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Switchboard
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Context-preserving orchestration · Agnostic AI Router
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/example" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-100 transition-colors">
            View App Example
          </Link>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
            {(['vendor_bot', 'internal_agent', 'human_agent'] as const).map(n => {
              const Icon = NODE_ICON[n];
              return (
                <span key={n} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                  <Icon className={`w-3.5 h-3.5 ${NODE_STYLES[n].dot.replace('bg-', 'text-')}`} />
                  <span>{NODE_LABEL[n]}</span>
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative z-10" style={{ height: 'calc(100vh - 73px)' }}>
        {/* Sidebar */}
        <aside className="w-[400px] border-r border-slate-200/60 bg-white/70 backdrop-blur-xl flex flex-col p-7 overflow-y-auto shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] relative z-20">
          <div className="space-y-6">
            
            {/* Provider Selection */}
            <div className="relative">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">
                <ServerCog className="w-3.5 h-3.5" /> AI Provider
              </label>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 transition-all duration-200 shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <span className="font-semibold">{currentProvider.name}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-2 p-1.5 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
                    >
                      {PROVIDERS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setProvider(p.id); setDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                            provider === p.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">
                <Key className="w-3.5 h-3.5" /> API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={currentProvider.keyPlaceholder}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm"
              />
            </div>

            {/* Message */}
            <div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-2 uppercase tracking-widest">
                <MessageSquare className="w-3.5 h-3.5" /> Customer Message
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 resize-none transition-all shadow-sm leading-relaxed"
              />
            </div>

            {/* Run Button */}
            <button
              onClick={run}
              disabled={!apiKey.trim() || !message.trim() || running}
              className="w-full relative group overflow-hidden bg-slate-900 text-white rounded-xl py-3.5 text-sm font-bold shadow-lg hover:shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
              <div className="flex items-center justify-center gap-2">
                {running ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                    <Sparkles className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {running ? 'Orchestrating…' : 'Run Orchestration'}
              </div>
            </button>
          </div>

          <div className="mt-auto pt-8">
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-indigo-900 text-sm mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" /> Smart Routing
              </h3>
              <p className="text-xs text-indigo-800/80 leading-relaxed font-medium">
                Switchboard routes requests between AI agents to preserve context and escalate only when necessary.
              </p>
            </div>
          </div>
        </aside>

        {/* Output panel */}
        <div ref={outputRef} className="flex-1 overflow-y-auto p-10 space-y-8 scroll-smooth bg-transparent custom-scrollbar">
          {!hasOutput && !running && (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-2xl bg-white/60 backdrop-blur-xl p-10 rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-200/50">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center border border-slate-100 shadow-md mb-6">
                  <Sparkles className="w-8 h-8 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-4">Context-Preserving Multi-Agent Orchestrator</h2>
                  <div className="space-y-4 text-slate-600 text-[15px] leading-relaxed font-medium">
                    <p>
                      <strong>Switchboard</strong> is an intelligent orchestration layer designed for customer support. It dynamically routes user requests across a hierarchy of specialized AI agents and human fallbacks, ensuring that context is perfectly preserved throughout the entire lifecycle of a ticket.
                    </p>
                    <p>
                      The system follows a tiered escalation path:
                    </p>
                    <ul className="list-disc pl-5 space-y-2 text-slate-700">
                      <li><strong>Vendor Bot:</strong> A fast, lightweight agent that handles FAQs and basic troubleshooting without needing secure account access.</li>
                      <li><strong>Internal Agent:</strong> A highly capable agent equipped with secure access to internal systems (like billing or user accounts) to investigate complex issues.</li>
                      <li><strong>Human Agent:</strong> The final fallback for sensitive security incidents or issues requiring manual intervention.</li>
                    </ul>
                    <p className="pt-2 text-indigo-600 font-semibold">
                      To begin, select a provider on the left, enter an API key, and hit "Run Orchestration" to watch the agents collaborate in real-time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {hasOutput && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-white shadow-md p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                    <User className="w-4.5 h-4.5 text-slate-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Customer Request</span>
                </div>
                <div className="pl-12">
                  <p className="text-[15px] text-slate-700 leading-relaxed font-medium">{message}</p>
                </div>
              </motion.div>
            )}

            {log.map((entry, i) => {
              if (entry.kind === 'node_start') {
                return (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={i} 
                    className="flex items-center gap-4 py-2 max-w-4xl mx-auto"
                  >
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-slate-300" />
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-4 py-1.5 rounded-full border border-slate-200 bg-white shadow-sm">
                      Starting {NODE_LABEL[entry.node] ?? entry.node}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-300 to-slate-300" />
                  </motion.div>
                );
              }

              if (entry.kind === 'node_reply') {
                const s = NODE_STYLES[entry.node] ?? NODE_STYLES.vendor_bot;
                const Icon = NODE_ICON[entry.node] || Bot;
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    key={i} 
                    className={`max-w-4xl mx-auto rounded-2xl border ${s.border} ${s.bg} p-6 transition-all`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${s.badge}`}>
                          <Icon className="w-4.5 h-4.5" />
                        </div>
                        <span className={`text-[15px] font-bold tracking-wide text-slate-800`}>
                          {NODE_LABEL[entry.node] ?? entry.node}
                        </span>
                      </div>
                      {entry.confidence !== undefined && (
                        <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                          <CheckCircle2 className={`w-4 h-4 ${entry.confidence > 0.5 ? 'text-emerald-500' : 'text-amber-500'}`} />
                          <span className="text-xs font-bold text-slate-600">
                            Confidence: {Math.round(entry.confidence * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pl-12">
                      <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{entry.content}</p>
                    </div>
                  </motion.div>
                );
              }

              if (entry.kind === 'routing') {
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className="flex items-start gap-4 pl-4 py-2 max-w-4xl mx-auto"
                  >
                    <div className="w-px h-full bg-slate-300" />
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1">
                      <div className="flex items-center gap-3 text-sm font-semibold">
                        <span className="text-slate-500">{NODE_LABEL[entry.from] ?? entry.from}</span>
                        <div className="flex-1 h-px border-t border-dashed border-slate-400 mx-2 relative">
                          <div className="absolute right-0 top-[-4px] w-2 h-2 border-t border-r border-slate-400 rotate-45" />
                        </div>
                        <span className="text-slate-800">{NODE_LABEL[entry.to] ?? entry.to}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3 text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                        Reason: {entry.reason}
                      </div>
                    </div>
                  </motion.div>
                );
              }

              if (entry.kind === 'context') {
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i} 
                    className="max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-slate-800 mt-8 shadow-xl overflow-hidden"
                  >
                    <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-900">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                        <ServerCog className="w-4 h-4" /> Final Context Object
                      </span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-bold">
                        schema v{entry.context.schema_version}
                      </span>
                    </div>
                    <div className="p-6 overflow-x-auto custom-scrollbar">
                      <pre className="text-[13px] text-slate-300 font-mono leading-relaxed">
                        {JSON.stringify(entry.context, null, 2)}
                      </pre>
                    </div>
                  </motion.div>
                );
              }

              if (entry.kind === 'error') {
                return (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={i} 
                    className="max-w-4xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm"
                  >
                    <div className="flex items-center gap-2 text-red-600 mb-2 font-bold uppercase tracking-widest text-xs">
                      <ShieldAlert className="w-4 h-4" /> Error
                    </div>
                    <p className="text-sm text-red-700 leading-relaxed font-medium">{entry.message}</p>
                  </motion.div>
                );
              }

              return null;
            })}

            {running && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="flex items-center justify-center gap-3 py-8 max-w-4xl mx-auto"
              >
                <div className="flex gap-1.5">
                  <motion.div className="w-2.5 h-2.5 rounded-full bg-indigo-500" animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} />
                  <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-500" animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} />
                  <motion.div className="w-2.5 h-2.5 rounded-full bg-pink-500" animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} />
                </div>
                <span className="text-sm font-bold text-slate-500">Processing stream...</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
