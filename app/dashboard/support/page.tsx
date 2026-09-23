'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { Surface } from '@/components/dashboard/Surface'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
  retry?: string
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm the Churnaut support assistant. I can help you set up tracked links, configure routing rules, connect your CRM, troubleshoot issues, or answer any questions about the platform. What do you need help with?",
}

const SUGGESTED = [
  'How do I install the snippet on my website?',
  'How do I connect HubSpot?',
  'How do I set up Instantly webhook?',
  'Why is my routing rule not triggering?',
  'How does Scout AI scoring work?',
  'How do I create a bulk tracked link?',
]

export default function SupportPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    bottomRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [messages])

  const getHistory = () => messages.filter(m => !m.loading && m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }))

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: getHistory() }),
      })
      const data = await res.json()
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat({
        id: crypto.randomUUID(), role: 'assistant',
        content: res.ok ? data.answer : data.error || 'Something went wrong.', retry: res.ok ? undefined : text,
      }))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat({
        id: crypto.randomUUID(), role: 'assistant', content: 'Network error — please try again.', retry: text,
      }))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="dashboard-support mx-auto flex min-h-[calc(100dvh-80px)] max-w-3xl flex-col">
      <div className="flex-shrink-0 mb-4">
        <PageHeader eyebrow="Signal Field · Support desk" title="Support" description="Ask anything about Churnaut." actions={<div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Bot className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />AI support</div>} />
      </div>

      <Surface role="log" aria-label="Support conversation" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto p-5 md:p-6 pb-6">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-[#165B40]/10 border border-[#165B40]/25 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot aria-hidden="true" className="w-4 h-4 text-[#165B40]" />
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              {msg.loading ? (
                <div role="status" aria-busy="true" className="border border-slate-200 bg-white rounded-2xl px-5 py-3.5 flex items-center gap-2 shadow-xs">
                  <Loader2 aria-hidden="true" className="w-4 h-4 motion-safe:animate-spin text-[#165B40]" />
                  <span className="text-xs font-mono text-slate-400">Thinking...</span>
                </div>
              ) : (
                <div role={msg.retry ? 'alert' : undefined} className={`rounded-2xl px-5 py-3.5 text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[#165B40] text-white shadow-xs'
                    : msg.retry ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-slate-200/90 bg-white text-slate-800 shadow-xs'
                }`}>
                  {msg.content}{msg.retry && <button type="button" onClick={() => { setInput(msg.retry || ''); inputRef.current?.focus() }} className="mt-3 block text-xs font-semibold underline">TRY AGAIN</button>}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-xs font-semibold text-slate-600">U</span>
              </div>
            )}
          </div>
        ))}
        {messages.length === 1 && (
          <div className="space-y-2.5 pt-3">
            <p className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-semibold">Common questions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="text-left text-xs font-sans text-slate-600 border border-slate-200 bg-white hover:bg-emerald-50/50 hover:border-[#165B40]/40 hover:text-[#165B40] px-4 py-2.5 rounded-full transition-all shadow-xs">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </Surface>

      <div className="flex-shrink-0 border-t border-slate-200 pt-4">
        <div className="flex gap-3 items-end">
          <label htmlFor="support-message" className="sr-only">Support message</label>
          <textarea id="support-message" ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Ask a question about Churnaut..."
            rows={1} disabled={loading}
            className="flex-1 bg-white border border-slate-200 focus:border-[#165B40] rounded-2xl px-5 py-3 text-sm font-sans text-slate-900 placeholder:text-slate-400 outline-none resize-none transition-all shadow-xs disabled:opacity-50"
            style={{ minHeight: '46px', maxHeight: '120px' }} />
          <button onClick={handleSend} disabled={loading || !input.trim()} aria-label="Send message" aria-busy={loading}
            className="dashboard-circle-button !w-11 !h-11 !bg-[#165B40] !text-white hover:!bg-[#114933] shadow-sm disabled:cursor-not-allowed disabled:opacity-40">
            {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] font-mono text-slate-400 mt-2 text-center uppercase tracking-wider">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
