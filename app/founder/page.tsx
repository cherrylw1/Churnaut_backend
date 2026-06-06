'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, Send, Loader2, Code2, ChevronDown, ChevronUp, Sparkles, Lock, Plus, MessageSquare, Trash2 } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  loading?: boolean
}

interface Chat {
  id: string
  title: string
  created_at: string
  updated_at: string
  messages: Message[]
}

const FOUNDER_PASSWORD = process.env.NEXT_PUBLIC_FOUNDER_KEY || 'churnaut2026'

const WELCOME_MSG: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey Sharath — I know your entire Churnaut codebase. Ask me anything about how it's built, how a specific feature works, why something behaves a certain way, or what files to look at for a given problem.",
  sources: [],
}

const SUGGESTED = [
  'What broke recently?',
  'How does the resolve API work step by step?',
  'Write a build prompt to add Salesforce OAuth',
  'Explain Scout AI scoring end to end',
  'Where is this bug coming from: Cannot read properties of undefined',
  'What features are still blocked and why?',
  'Write a build prompt to add email notifications for new signups',
  'What should I build next?',
]

export default function FounderPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('founder_unlocked')
    if (saved === 'true') setUnlocked(true)
  }, [])

  useEffect(() => {
    if (unlocked) loadChats()
  }, [unlocked])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadChats = async () => {
    const res = await fetch('/api/founder/chats')
    if (res.ok) {
      const data = await res.json()
      setChats(data.chats || [])
    }
  }

  const handleUnlock = () => {
    if (passwordInput === FOUNDER_PASSWORD) {
      setUnlocked(true)
      localStorage.setItem('founder_unlocked', 'true')
      setPasswordError(false)
    } else {
      setPasswordError(true)
    }
  }

  const startNewChat = () => {
    setActiveChatId(null)
    setMessages([WELCOME_MSG])
    setInput('')
    setExpandedSources({})
    inputRef.current?.focus()
  }

  const openChat = async (chat: Chat) => {
    setActiveChatId(chat.id)
    setMessages(chat.messages.length > 0 ? chat.messages : [WELCOME_MSG])
    setExpandedSources({})
  }

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    setDeletingId(chatId)
    await fetch(`/api/founder/chats?id=${chatId}`, { method: 'DELETE' })
    if (activeChatId === chatId) startNewChat()
    await loadChats()
    setDeletingId(null)
  }

  const saveChat = useCallback(async (chatId: string | null, msgs: Message[], firstUserMsg: string) => {
    const cleanMsgs = msgs.filter(m => !m.loading && m.id !== 'welcome')
    if (chatId) {
      await fetch('/api/founder/chats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chatId, messages: cleanMsgs }),
      })
      return chatId
    } else {
      const title = firstUserMsg.slice(0, 50) + (firstUserMsg.length > 50 ? '...' : '')
      const res = await fetch('/api/founder/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, messages: cleanMsgs }),
      })
      const data = await res.json()
      return data.id as string
    }
  }, [])

  const getHistory = (msgs: Message[]) =>
    msgs.filter(m => !m.loading && m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }))

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const loadingMsg: Message = { id: 'loading', role: 'assistant', content: '', loading: true }
    const newMessages = [...messages, userMsg, loadingMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    let currentChatId = activeChatId
    try {
      const res = await fetch('/api/chat/founder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: getHistory(messages),
          founderKey: 'true',
        }),
      })
      const data = await res.json()
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.ok ? data.answer : data.error || 'Something went wrong.',
        sources: res.ok ? data.sources : [],
      }
      const finalMessages = newMessages.filter(m => m.id !== 'loading').concat(assistantMsg)
      setMessages(finalMessages)
      currentChatId = await saveChat(currentChatId, finalMessages, text)
      if (!activeChatId) setActiveChatId(currentChatId)
      await loadChats()
    } catch {
      setMessages(prev => prev.filter(m => m.id !== 'loading').concat({
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

  const toggleSources = (id: string) => setExpandedSources(prev => ({ ...prev, [id]: !prev[id] }))

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

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
            <input type="password" value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false) }}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              placeholder="Enter founder key"
              className="w-full bg-[#111118] border border-[#1e1e2e] focus:border-[#6366f1]/50 rounded-[10px] px-4 py-3 text-sm font-mono text-white placeholder:text-gray-600 outline-none" />
            {passwordError && <p className="text-xs text-red-400 font-mono text-center">Invalid key</p>}
            <button onClick={handleUnlock}
              className="w-full bg-[#6366f1] hover:bg-[#5053e1] text-white py-3 rounded-[10px] text-sm font-mono font-medium transition-all">
              Unlock
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080B0F] flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 transition-all duration-200 overflow-hidden border-r border-[#1e1e2e] flex flex-col`}>
        <div className="p-3 flex-shrink-0">
          <button onClick={startNewChat}
            className="w-full flex items-center gap-2 bg-[#6366f1] hover:bg-[#5053e1] text-white px-3 py-2.5 rounded-[8px] text-sm font-mono transition-all">
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {chats.length === 0 && (
            <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider px-2 py-3">No chats yet</p>
          )}
          {chats.map(chat => (
            <div key={chat.id} onClick={() => openChat(chat)}
              className={`group flex items-center gap-2 px-2 py-2 rounded-[6px] cursor-pointer transition-all ${
                activeChatId === chat.id ? 'bg-[#6366f1]/10 border border-[#6366f1]/20' : 'hover:bg-[#111118]'
              }`}>
              <MessageSquare className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-sans text-gray-300 truncate">{chat.title}</p>
                <p className="text-[10px] font-mono text-gray-600">{formatDate(chat.updated_at)}</p>
              </div>
              <button onClick={(e) => deleteChat(e, chat.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-400 text-gray-600">
                {deletingId === chat.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-[#1e1e2e] flex-shrink-0">
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">Churnaut AI · Founder</p>
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(p => !p)}
              className="text-gray-500 hover:text-white transition-colors p-1">
              <MessageSquare className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-white font-sans flex items-center gap-2">
                <Bot className="text-[#6366f1] w-4 h-4" />
                {activeChatId ? (chats.find(c => c.id === activeChatId)?.title || 'Chat') : 'New Chat'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-[#6366f1]" />
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Qwen2.5-7B · RAG</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/10 border border-[#6366f1]/20 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5 text-[#6366f1]" />
                </div>
              )}
              <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
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
                          <Code2 className="w-3 h-3" />
                          {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} used
                          {expandedSources[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {expandedSources[msg.id] && (
                          <div className="mt-1.5 space-y-1">
                            {msg.sources.map(src => (
                              <div key={src} className="text-[10px] font-mono text-[#6366f1] bg-[#6366f1]/5 border border-[#6366f1]/10 px-2 py-1 rounded-[4px]">{src}</div>
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
                {SUGGESTED.map(q => (
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

        <div className="flex-shrink-0 border-t border-[#1e1e2e] px-6 py-4">
          <div className="flex gap-3 items-end">
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} placeholder="Ask anything about Churnaut..."
              rows={1} disabled={loading}
              className="flex-1 bg-[#111118] border border-[#1e1e2e] focus:border-[#6366f1]/50 rounded-[10px] px-4 py-3 text-sm font-sans text-white placeholder:text-gray-600 outline-none resize-none transition-all disabled:opacity-50"
              style={{ minHeight: '46px', maxHeight: '120px' }} />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="bg-[#6366f1] hover:bg-[#5053e1] disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-[10px] transition-all active:scale-[0.97] flex-shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] font-mono text-gray-600 mt-2 text-center uppercase tracking-wider">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}
