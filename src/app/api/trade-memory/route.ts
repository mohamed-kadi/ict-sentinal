import { NextResponse } from 'next/server';
import { TradeMemory } from '@/lib/tradeMemory';

const tradeMemory = new TradeMemory();

type Payload = {
  setup?: string;
  session?: string | null;
  bias?: string | null;
  result?: 'win' | 'loss';
  rMultiple?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;
    const { setup, session, bias, result, rMultiple } = body ?? {};
    if (!setup || (result !== 'win' && result !== 'loss')) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const numericR = Number(rMultiple);
    tradeMemory.logTrade(
      setup,
      session ?? 'Unknown',
      bias ?? 'Neutral',
      result,
      Number.isFinite(numericR) ? numericR : 0,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[TradeMemory] Failed to log trade', error);
    return NextResponse.json({ error: 'Failed to log trade' }, { status: 500 });
  }
}
