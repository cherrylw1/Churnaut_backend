import { NextRequest, NextResponse } from 'next/server';
import { fetchHubSpotPipeline } from '@/lib/integrations/hubspot-pipeline';
import { scoreDealsWithScout } from '@/lib/scout-scoring';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  
  if (secret !== 'gemini-diagnostics') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientId = 'c8aa7742-287a-40ea-9d5c-064b51a58d9c';
    const deals = await fetchHubSpotPipeline(clientId);
    const scores = await scoreDealsWithScout(clientId, deals);
    return NextResponse.json({
      success: true,
      deals_count: deals.length,
      scores,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : '';
    return NextResponse.json({
      success: false,
      error: errMsg,
      stack: errStack,
    }, { status: 500 });
  }
}
