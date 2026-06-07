import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function getVerifiedClientId(req: NextRequest): Promise<string | null> {
  try {
    const cookie = req.cookies.get('sb-auth-token')
    if (!cookie) return null

    const session = JSON.parse(decodeURIComponent(cookie.value))
    const accessToken = session?.access_token
    if (!accessToken) return null

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: { user }, error } = await supabase.auth.getUser(accessToken)
    if (error || !user) return null

    return user.id
  } catch {
    return null
  }
}
