import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClientId } from '@/lib/auth'
import { purgeDemoData } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const clientId = await getAuthedClientId(req)
  if (!clientId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await purgeDemoData(clientId)
  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Purge failed' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
