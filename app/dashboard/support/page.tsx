'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, HelpCircle } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  loading?: boolean
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
        content: res.ok ? data.answer : data.error || 'Something went wrong.',
      }))
    } catch {
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat({
        id: crypto.randomUUID(), role: 'assistant', content: 'Network error — please try again.',
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
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-5 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-[24px] font-bold text-[var(--text-primary)] font-sans flex items-center gap-2.5">
            <HelpCircle className="text-[var(--accent)] w-6 h-6" />
            SUPPORT
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1 font-mono uppercase tracking-wider">
            Ask anything about Churnaut
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">AI Support</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5 text-[var(--accent)]" />
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              {msg.loading ? (
                <div className="border border-[var(--border-subtle)] bg-[var(--bg-surface)] rounded-[12px] px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
                  <span className="text-xs font-mono text-[var(--text-muted)]">Thinking...</span>
                </div>
              ) : (
                <div className={`rounded-[12px] px-4 py-3 text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                }`}>
                  {msg.content}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-[10px] font-mono text-[var(--text-secondary)]">U</span>
              </div>
            )}
          </div>
        ))}
        {messages.length === 1 && (
          <div className="space-y-2 pt-2">
            <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Common questions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="text-left text-xs font-sans text-[var(--text-secondary)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 hover:text-[var(--text-primary)] px-3 py-2.5 rounded-[8px] transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex gap-3 items-end">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Ask a question about Churnaut..."
            rows={1} disabled={loading}
            className="flex-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] focus:border-[var(--accent)]/50 rounded-[10px] px-4 py-3 text-sm font-sans text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none resize-none transition-all disabled:opacity-50"
            style={{ minHeight: '46px', maxHeight: '120px' }} />
          <button onClick={handleSend} disabled={loading || !input.trim()}
            className="bg-[#6366f1] hover:bg-[#5053e1] disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-[10px] transition-all active:scale-[0.97] flex-shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] font-mono text-[var(--text-muted)] mt-2 text-center uppercase tracking-wider">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
