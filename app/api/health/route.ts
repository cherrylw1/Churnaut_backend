import { NextResponse } from 'next/server'
import { getAppEnvironment } from '@/lib/environment'
export const dynamic = 'force-dynamic'
export async function GET() { return NextResponse.json({ ok: true, environment: getAppEnvironment(), version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local' }) }
