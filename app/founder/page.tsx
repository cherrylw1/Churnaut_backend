'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, Send, Loader2, Code2, ChevronDown, ChevronUp, Sparkles, Plus, MessageSquare, Trash2, KeyRound, LogOut, ShieldAlert } from 'lucide-react'

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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [loginAccountId, setLoginAccountId] = useState('')
  const [loginPasskey, setLoginPasskey] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

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

  // Verify auth session from localStorage on mount
  useEffect(() => {
    const storedAccountId = localStorage.getItem('founder_account_id')
    const storedPasskey = localStorage.getItem('founder_passkey')
    if (storedAccountId === 'FOUNDER_CLIENT_ID' && storedPasskey) {
      setIsAuthenticated(true)
      loadChats(storedPasskey)
    } else {
      setIsAuthenticated(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadChats = async (passkeyOverride?: string) => {
    const passkey = passkeyOverride || localStorage.getItem('founder_passkey') || ''
    if (!passkey) return
    try {
      const res = await fetch('/api/founder/chats', {
        headers: { 'Authorization': `Bearer ${passkey}` }
      })
      if (res.ok) {
        const data = await res.json()
        setChats(data.chats || [])
      } else if (res.status === 401) {
        handleLogout()
      }
    } catch (err) {
      console.error('Failed to load chats:', err)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    if (loginAccountId.trim() !== 'FOUNDER_CLIENT_ID') {
      setLoginError('Invalid Account ID')
      return
    }
    const passkey = loginPasskey.trim()
    if (!passkey) {
      setLoginError('Passkey is required')
      return
    }
    setLoginLoading(true)
    try {
      const res = await fetch('/api/founder/chats', {
        headers: { 'Authorization': `Bearer ${passkey}` }
      })
      if (res.ok) {
        localStorage.setItem('founder_account_id', 'FOUNDER_CLIENT_ID')
        localStorage.setItem('founder_passkey', passkey)
        setIsAuthenticated(true)
        const data = await res.json()
        setChats(data.chats || [])
      } else {
        setLoginError('Invalid Passkey or Account ID combination')
      }
    } catch {
      setLoginError('Network error during authentication')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('founder_account_id')
    localStorage.removeItem('founder_passkey')
    setIsAuthenticated(false)
    setMessages([WELCOME_MSG])
    setActiveChatId(null)
    setChats([])
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
    const passkey = localStorage.getItem('founder_passkey') || ''
    try {
      await fetch(`/api/founder/chats?id=${chatId}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${passkey}` }
      })
      if (activeChatId === chatId) startNewChat()
      await loadChats()
    } catch (err) {
      console.error('Failed to delete chat:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const saveChat = useCallback(async (chatId: string | null, msgs: Message[], firstUserMsg: string) => {
    const cleanMsgs = msgs.filter(m => !m.loading && m.id !== 'welcome')
    const passkey = localStorage.getItem('founder_passkey') || ''
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${passkey}`
    }
    try {
      if (chatId) {
        await fetch('/api/founder/chats', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ id: chatId, messages: cleanMsgs }),
        })
        return chatId
      } else {
        const title = firstUserMsg.slice(0, 50) + (firstUserMsg.length > 50 ? '...' : '')
        const res = await fetch('/api/founder/chats', {
          method: 'POST',
          headers,
          body: JSON.stringify({ title, messages: cleanMsgs }),
        })
        const data = await res.json()
        return data.id as string
      }
    } catch (err) {
      console.error('Failed to save chat history:', err)
      return chatId || ''
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
      const passkey = localStorage.getItem('founder_passkey') || ''
      const res = await fetch('/api/chat/founder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${passkey}`
        },
        body: JSON.stringify({
          message: text,
          history: getHistory(messages),
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

  // Render initial loading screen while verifying session from localStorage
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#080B0F] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-[#C2683D] animate-spin" />
        <p className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-widest">Checking Decryption Keys...</p>
      </div>
    )
  }

  // Render Sleek, Cyberpunk Founder Login Screen if not authenticated
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen bg-[#080B0F] flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none"></div>

        <div className="w-full max-w-[420px] bg-[#0c0f16]/95 border border-[#1e293b] rounded-xl shadow-[0_0_50px_rgba(99,102,241,0.06)] p-8 relative z-10 transition-all">
          <div className="flex flex-col items-center text-center space-y-4 mb-8">
            <div className="w-12 h-12 rounded-lg bg-[#C2683D]/10 border border-[#C2683D]/25 flex items-center justify-center">
              <Bot className="w-6 h-6 text-[#C2683D]" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-mono text-white tracking-widest uppercase">FOUNDER ACCESS ONLY</h2>
              <p className="text-xs font-mono text-[var(--text-muted)] mt-1">Decrypt codebase & live RevOps intelligence console.</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-widest block">Account ID</label>
              <input
                type="text"
                value={loginAccountId}
                onChange={e => setLoginAccountId(e.target.value)}
                placeholder="e.g. FOUNDER_CLIENT_ID"
                className="w-full bg-[#080B0F] border border-[#1e293b] focus:border-[#C2683D]/50 rounded-[8px] px-3.5 py-2.5 text-sm font-mono text-white placeholder:text-gray-700 outline-none transition-all"
                disabled={loginLoading}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase tracking-widest block">Founder Passkey</label>
              <div className="relative">
                <input
                  type="password"
                  value={loginPasskey}
                  onChange={e => setLoginPasskey(e.target.value)}
                  placeholder="Enter User ID / Token"
                  className="w-full bg-[#080B0F] border border-[#1e293b] focus:border-[#C2683D]/50 rounded-[8px] px-3.5 py-2.5 pl-10 text-sm font-mono text-white placeholder:text-gray-700 outline-none transition-all"
                  disabled={loginLoading}
                />
                <KeyRound className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {loginError && (
              <div className="flex items-center gap-2 text-xs font-mono text-[var(--red)] bg-[var(--red)]/10 border border-[var(--red)]/30 p-2.5 rounded-[6px]">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-[#C2683D] hover:bg-[#A8552F] disabled:opacity-50 text-white font-mono text-xs font-bold uppercase tracking-widest py-3 rounded-[8px] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Decrypt Console'
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Render the authenticated main chat interface
  return (
    <div className="min-h-screen bg-[#080B0F] flex">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} flex-shrink-0 transition-all duration-200 overflow-hidden border-r border-[#1e1e2e] flex flex-col`}>
        <div className="p-3 flex-shrink-0">
          <button onClick={startNewChat}
            className="w-full flex items-center gap-2 bg-[#C2683D] hover:bg-[#A8552F] text-white px-3 py-2.5 rounded-[8px] text-sm font-mono transition-all">
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {chats.length === 0 && (
            <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider px-2 py-3">No chats yet</p>
          )}
          {chats.map(chat => (
            <div key={chat.id} onClick={() => openChat(chat)}
              className={`group flex items-center gap-2 px-2 py-2 rounded-[6px] cursor-pointer transition-all ${
                activeChatId === chat.id ? 'bg-[#C2683D]/10 border border-[#C2683D]/20' : 'hover:bg-[#111118]'
              }`}>
              <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-sans text-[var(--text-secondary)] truncate">{chat.title}</p>
                <p className="text-[10px] font-mono text-[var(--text-muted)]">{formatDate(chat.updated_at)}</p>
              </div>
              <button onClick={(e) => deleteChat(e, chat.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-[var(--red)] text-[var(--text-muted)]">
                {deletingId === chat.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-[#1e1e2e] flex-shrink-0 flex items-center justify-between">
          <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Churnaut AI · Founder</p>
          <button onClick={handleLogout} className="flex items-center gap-1 text-[10px] font-mono text-[var(--red)] hover:text-[var(--red)] uppercase tracking-wider transition-colors active:scale-95">
            <LogOut className="w-3 h-3" />
            Logout
          </button>
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(p => !p)}
              className="text-[var(--text-muted)] hover:text-white transition-colors p-1">
              <MessageSquare className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-bold text-white font-sans flex items-center gap-2">
                <Bot className="text-[#C2683D] w-4 h-4" />
                {activeChatId ? (chats.find(c => c.id === activeChatId)?.title || 'Chat') : 'New Chat'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-[#C2683D]" />
            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Qwen2.5-7B · RAG</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#C2683D]/10 border border-[#C2683D]/25 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5 text-[#C2683D]" />
                </div>
              )}
              <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                {msg.loading ? (
                  <div className="border border-[#1e1e2e] bg-[#111118] rounded-[12px] px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-[#C2683D] animate-spin" />
                    <span className="text-xs font-mono text-[var(--text-muted)]">Searching codebase...</span>
                  </div>
                ) : (
                  <>
                    <div className={`rounded-[12px] px-4 py-3 text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                       msg.role === 'user' ? 'bg-[#C2683D] text-white' : 'border border-[#1e1e2e] bg-[#111118] text-gray-100'
                    }`}>
                      {msg.content}
                    </div>
                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="w-full">
                        <button onClick={() => toggleSources(msg.id)}
                          className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors uppercase tracking-wider">
                          <Code2 className="w-3 h-3" />
                          {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} used
                          {expandedSources[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {expandedSources[msg.id] && (
                          <div className="mt-1.5 space-y-1">
                            {msg.sources.map(src => (
                              <div key={src} className="text-[10px] font-mono text-[#C2683D] bg-[#C2683D]/5 border border-[#C2683D]/10 px-2 py-1 rounded-[4px]">{src}</div>
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
                  <span className="text-[10px] font-mono text-[var(--text-secondary)]">S</span>
                </div>
              )}
            </div>
          ))}
          {messages.length === 1 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Suggested questions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                    className="text-left text-xs font-sans text-[var(--text-secondary)] border border-[#1e1e2e] bg-[#111118] hover:bg-[#1a1a2e] hover:border-[#C2683D]/30 hover:text-white px-3 py-2.5 rounded-[8px] transition-all">
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
              className="flex-1 bg-[#111118] border border-[#1e1e2e] focus:border-[#C2683D]/50 rounded-[10px] px-4 py-3 text-sm font-sans text-white placeholder:text-[var(--text-muted)] outline-none resize-none transition-all disabled:opacity-50"
              style={{ minHeight: '46px', maxHeight: '120px' }} />
            <button onClick={handleSend} disabled={loading || !input.trim()}
              className="bg-[#C2683D] hover:bg-[#A8552F] disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-[10px] transition-all active:scale-[0.97] flex-shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] font-mono text-[var(--text-muted)] mt-2 text-center uppercase tracking-wider">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  )
}
