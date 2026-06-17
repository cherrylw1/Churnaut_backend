'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, X, HelpCircle, Maximize2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! Need help with Churnaut? Ask me anything — setup, features, troubleshooting.",
}

export default function SupportWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100) }, [open])

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
        content: res.ok ? data.answer : 'Sorry, something went wrong.',
      }))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat({
        id: crypto.randomUUID(), role: 'assistant', content: 'Network error — please try again.',
      }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-[#C2683D] hover:bg-[#A8552F] text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95">
          <HelpCircle className="w-5 h-5" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 h-[480px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[16px] shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#C2683D]/10 border border-[#C2683D]/20 flex items-center justify-center">
                <Bot className="w-3 h-3 text-[#C2683D]" />
              </div>
              <div>
                <p className="text-xs font-mono font-medium text-[var(--text-primary)]">Churnaut Support</p>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">AI-powered · Always on</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => router.push('/dashboard/support')}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors" title="Open full page">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setOpen(false)}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-5 h-5 rounded-full bg-[#C2683D]/10 border border-[#C2683D]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-2.5 h-2.5 text-[#C2683D]" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-[10px] px-3 py-2 text-xs font-sans leading-relaxed ${
                  msg.loading ? 'border border-[var(--border-subtle)] bg-[var(--bg-elevated)]' :
                  msg.role === 'user' ? 'bg-[#C2683D] text-white' :
                  'border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                }`}>
                  {msg.loading ? (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 text-[#C2683D] animate-spin" />
                      <span className="text-[var(--text-muted)]">Thinking...</span>
                    </div>
                  ) : msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3 border-t border-[var(--border-subtle)]">
            <div className="flex gap-2 items-center">
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="Ask a question..."
                disabled={loading}
                className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[#C2683D]/50 rounded-[8px] px-3 py-2 text-xs font-sans text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-all disabled:opacity-50" />
              <button onClick={handleSend} disabled={loading || !input.trim()}
                className="bg-[#C2683D] hover:bg-[#A8552F] disabled:opacity-40 text-white p-2 rounded-[8px] transition-all flex-shrink-0">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
