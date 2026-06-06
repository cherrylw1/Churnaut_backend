'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, Code2, ChevronDown, ChevronUp, Sparkles, Lock } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  loading?: boolean
}

const FOUNDER_PASSWORD = process.env.NEXT_PUBLIC_FOUNDER_KEY || ''

export default function FounderPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hey Sharath — I know your entire Churnaut codebase. Ask me anything about how it's built, how a specific feature works, why something behaves a certain way, or what files to look at for a given problem.",
      sources: [],
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('founder_unlocked')
    if (saved === 'true') setUnlocked(true)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleUnlock = () => {
    if (passwordInput === FOUNDER_PASSWORD) {
      setUnlocked(true)
      localStorage.setItem('founder_unlocked', 'true')
      setPasswordError(false)
    } else {
      setPasswordError(true)
    }
  }

  const getHistory = () =>
    messages
      .filter((m) => !m.loading && m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }))

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true }
    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat/codebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: getHistory(), founderKey: passwordInput || localStorage.getItem('founder_unlocked') }),
      })
      const data = await res.json()
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.ok ? data.answer : data.error || 'Something went wrong.',
        sources: res.ok ? data.sources : [],
      }
      setMessages((prev) => prev.filter((m) => m.id !== 'loading').concat(assistantMsg))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== 'loading').concat({
        id: crypto.randomUUID(), role: 'assistant',
        content: 'Network error — could not reach the codebase chat API.', sources: [],
      }))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const toggleSources = (id: string) => {
    setExpandedSources((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const SUGGESTED = [
    'How does the resolve API work step by step?',
    'Explain Scout AI scoring end to end',
    'How are routing rules evaluated?',
    'How does HubSpot OAuth work?',
    'How does the webhook create a tracked link?',
    'What features are still blocked and why?',
    'What is Churnaut and what problem does it solve?',
    'What should I build next?',
  ]

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#080B0F] flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#6366f1]/10 border border-[#6366f1]/20 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5 text-[#6366f1]" />
            </div>
            <h1 className="text-xl font-bold text-white font-sans">Founder Access</h1>
            <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Churnaut Internal</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="Enter founder key"
              className="w-full bg-[#111118] border border-[#1e1e2e] focus:border-[#6366f1]/50 rounded-[10px] px-4 py-3 text-sm font-mono text-white placeholder:text-gray-600 outline-none"
            />
            {passwordError && (
               <p className="text-xs text-red-400 font-mono text-center">Invalid key</p>
            )}
            <button
              onClick={handleUnlock}
              className="w-full bg-[#6366f1] hover:bg-[#5053e1] text-white py-3 rounded-[10px] text-sm font-mono font-medium transition-all"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080B0F] p-6">
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-48px)]">
        <div className="flex items-center justify-between border-b border-[#1e1e2e] pb-5 mb-4 flex-shrink-0">
          <div>
            <h1 className="text-[24px] font-bold text-white font-sans flex items-center gap-2.5">
              <Bot className="text-[#6366f1] w-6 h-6" />
              CHURNAUT AI
            </h1>
            <p className="text-xs text-gray-500 mt-1 font-mono uppercase tracking-wider">
              Founder-only · Full codebase + product context
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#6366f1]" />
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
              Qwen2.5-7B · RAG · 549 chunks
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/10 border border-[#6366f1]/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5 text-[#6366f1]" />
                </div>
              )}
              <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                {msg.loading ? (
                  <div className="border border-[#1e1e2e] bg-[#111118] rounded-[12px] px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-[#6366f1] animate-spin" />
                    <span className="text-xs font-mono text-gray-500">Searching codebase...</span>
                  </div>
                ) : (
                  <>
                    <div className={`rounded-[12px] px-4 py-3 text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' ? 'bg-[#6366f1] text-white' : 'border border-[#1e1e2e] bg-[#111118] text-gray-100'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="w-full">
                        <button onClick={() => toggleSources(msg.id)}
                          className="flex items-center gap-1.5 text-[10px] font-mono text-gray-600 hover:text-gray-400 transition-colors uppercase tracking-wider">
                          <Code2 className="w-3.5 h-3.5" />
                          {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} used
                          {expandedSources[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {expandedSources[msg.id] && (
                          <div className="mt-1.5 space-y-1">
                            {msg.sources.map((src) => (
                              <div key={src} className="text-[10px] font-mono text-[#6366f1] bg-[#6366f1]/5 border border-[#6366f1]/10 px-2 py-1 rounded-[4px]">
                                {src}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-[#1e1e2e] border border-[#2e2e3e] flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-[10px] font-mono text-gray-400">S</span>
                </div>
              )}
            </div>
          ))}
          {messages.length === 1 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">Suggested questions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED.map((q) => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                    className="text-left text-xs font-sans text-gray-400 border border-[#1e1e2e] bg-[#111118] hover:bg-[#1a1a2e] hover:border-[#6366f1]/30 hover:text-white px-3 py-2.5 rounded-[8px] transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="flex-shrink-0 border-t border-[#1e1e2e] pt-4">
          <div className="flex gap-3 items-end">
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="Ask anything about Churnaut..."
              rows={1} disabled={loading}
              className="flex-1 bg-[#111118] border border-[#1e1e2e] focus:border-[#6366f1]/50 rounded-[10px] px-4 py-3 text-sm font-sans text-white placeholder:text-gray-600 outline-none resize-none transition-all disabled:opacity-50"
              style={{ minHeight: '46px', maxHeight: '120px' }} />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="bg-[#6366f1] hover:bg-[#5053e1] disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-[10px] transition-all active:scale-[0.97] flex-shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] font-mono text-gray-600 mt-2 text-center uppercase tracking-wider">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
