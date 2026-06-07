import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedClientId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId || clientId !== process.env.FOUNDER_CLIENT_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('founder_chats')
    .select('id, title, created_at, updated_at, messages')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chats: data })
}

export async function POST(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId || clientId !== process.env.FOUNDER_CLIENT_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, messages } = await req.json()
  const { data, error } = await supabase
    .from('founder_chats')
    .insert({ title, messages })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

export async function PATCH(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId || clientId !== process.env.FOUNDER_CLIENT_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, messages } = await req.json()
  const { error } = await supabase
    .from('founder_chats')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId || clientId !== process.env.FOUNDER_CLIENT_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase
    .from('founder_chats')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
