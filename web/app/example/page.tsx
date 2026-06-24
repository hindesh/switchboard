'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowUpRight, ArrowDownRight, Wallet, Activity, CreditCard, 
  Settings, HelpCircle, MessageCircle, X, Send, Sparkles, User, Bot, ServerCog, CheckCircle2 
} from 'lucide-react';
import type { OrchestratorEvent } from '@/lib/orchestrator';

type LogEntry =
  | { kind: 'node_start'; node: string }
  | { kind: 'node_reply'; node: string; content: string; confidence?: number }
  | { kind: 'routing'; from: string; to: string; reason: string }
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

const RECENT_TRANSACTIONS = [
  { id: 1, type: 'buy', amount: '0.15 ETH', status: 'pending', date: '2 hours ago', fiat: '-$500.00' },
  { id: 2, type: 'sell', amount: '0.05 BTC', status: 'completed', date: 'Yesterday', fiat: '+$3,240.00' },
  { id: 3, type: 'deposit', amount: '', status: 'completed', date: 'Oct 12', fiat: '+$1,000.00' },
];

export default function ExamplePage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const append = (entry: LogEntry) => {
    setLog(prev => [...prev, entry]);
  };

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [log, running]);

  const runChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !message.trim() || running) return;
    
    // Add user message to log
    append({ kind: 'node_reply', node: 'user', content: message });
    
    const userMsg = message;
    setMessage('');
    
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic', apiKey, userMessage: userMsg }),
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex">
      {/* App Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">CryptoEx</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 bg-indigo-50 text-indigo-700 rounded-lg font-medium text-sm">
            <Activity className="w-4.5 h-4.5" /> Dashboard
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">
            <Wallet className="w-4.5 h-4.5" /> Portfolio
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">
            <CreditCard className="w-4.5 h-4.5" /> Transactions
          </a>
        </nav>
        
        <div className="p-4 border-t border-slate-100 space-y-1">
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors">
            <Settings className="w-4.5 h-4.5" /> Settings
          </a>
          <button 
            onClick={() => setIsChatOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium text-sm transition-colors"
          >
            <HelpCircle className="w-4.5 h-4.5" /> Support
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-xl font-bold">Dashboard Overview</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
              ← Back to Debug View
            </Link>
            <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
              <User className="w-4.5 h-4.5 text-slate-600" />
            </div>
          </div>
        </header>

        <div className="p-8 max-w-5xl mx-auto space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="text-sm font-medium text-slate-500 mb-1">Total Balance</div>
              <div className="text-3xl font-bold text-slate-900">$12,450.00</div>
              <div className="flex items-center gap-1 mt-2 text-sm font-medium text-emerald-600 bg-emerald-50 w-max px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3.5 h-3.5" /> +2.4%
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="text-sm font-medium text-slate-500 mb-1">Active Assets</div>
              <div className="text-3xl font-bold text-slate-900">4</div>
            </div>
            
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="text-sm font-medium text-slate-500 mb-1">24h Volume</div>
              <div className="text-3xl font-bold text-slate-900">$3,240.00</div>
              <div className="flex items-center gap-1 mt-2 text-sm font-medium text-amber-600 bg-amber-50 w-max px-2 py-0.5 rounded-full">
                <ArrowDownRight className="w-3.5 h-3.5" /> -1.2%
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-lg">Recent Transactions</h2>
              <button className="text-sm font-semibold text-indigo-600">View All</button>
            </div>
            <div className="divide-y divide-slate-100">
              {RECENT_TRANSACTIONS.map((tx) => (
                <div key={tx.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'buy' ? 'bg-indigo-100 text-indigo-600' : 
                      tx.type === 'sell' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {tx.type === 'buy' ? <ArrowDownRight className="w-5 h-5" /> : 
                       tx.type === 'sell' ? <ArrowUpRight className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 capitalize">{tx.type} {tx.amount}</div>
                      <div className="text-sm font-medium text-slate-500">{tx.date}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">{tx.fiat}</div>
                    <div className={`text-xs font-bold uppercase tracking-wider mt-1 ${
                      tx.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'
                    }`}>{tx.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Floating Chat Button */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl hover:shadow-indigo-500/30 flex items-center justify-center hover:bg-indigo-700 transition-colors z-40"
          >
            <MessageCircle className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Support Chat Widget */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-white rounded-2xl shadow-2xl shadow-slate-900/10 border border-slate-200 flex flex-col z-50 overflow-hidden"
          >
            <div className="bg-indigo-600 px-5 py-4 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">CryptoEx Support</h3>
                  <p className="text-xs text-indigo-200 font-medium">Powered by Switchboard AI</p>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Chat Area */}
            <div ref={outputRef} className="flex-1 overflow-y-auto p-5 bg-slate-50 space-y-4">
              <div className="text-center text-xs font-semibold text-slate-400 my-2">Chat Started</div>
              
              {!apiKey && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-700">
                  <p className="font-bold mb-1">Demo Mode Setup Required</p>
                  <p className="mb-2">Please enter an Anthropic API key below to test the chat feature.</p>
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-white border border-amber-200 rounded p-2 focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-sm shadow-sm text-[13px] text-slate-700 leading-relaxed font-medium">
                  Hi there! I'm the CryptoEx automated assistant. How can I help you today?
                </div>
              </div>

              {log.map((entry, i) => {
                if (entry.kind === 'node_reply') {
                  const isUser = entry.node === 'user';
                  if (isUser) {
                    return (
                      <div key={i} className="flex justify-end gap-3 pl-10">
                        <div className="bg-indigo-600 text-white p-3.5 rounded-2xl rounded-tr-sm shadow-sm text-[13px] leading-relaxed font-medium">
                          {entry.content}
                        </div>
                      </div>
                    );
                  }

                  const Icon = NODE_ICON[entry.node] || Bot;
                  const label = NODE_LABEL[entry.node] || entry.node;
                  
                  return (
                    <div key={i} className="flex items-start gap-3 pr-10">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                        <Icon className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                          {label}
                        </div>
                        <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-sm shadow-sm text-[13px] text-slate-700 leading-relaxed font-medium">
                          {entry.content}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (entry.kind === 'routing') {
                  return (
                    <div key={i} className="flex justify-center my-4">
                      <div className="bg-slate-200/50 px-3 py-1.5 rounded-full border border-slate-200 flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <ServerCog className="w-3 h-3 text-indigo-500" />
                        <span>Transferring to {NODE_LABEL[entry.to]}</span>
                      </div>
                    </div>
                  );
                }
                
                return null;
              })}

              {running && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                    <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                  </div>
                  <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <form onSubmit={runChat} className="p-4 bg-white border-t border-slate-100 shrink-0">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={apiKey ? "Type your message..." : "Enter API key above first"}
                  disabled={!apiKey || running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full pl-4 pr-12 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!apiKey.trim() || !message.trim() || running}
                  className="absolute right-2 w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-300 transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
