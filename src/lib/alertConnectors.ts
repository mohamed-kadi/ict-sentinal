import type { Signal, Bias, Timeframe } from '@/lib/types';

export type AlertConnectorContext = {
  symbol?: string;
  timeframe?: Timeframe;
  bias?: Bias;
  price?: number;
  session?: string | null;
  source?: string;
};

const webhookUrl = process.env.NEXT_PUBLIC_ALERT_WEBHOOK;

export async function notifyAlertConnectors(signal: Signal, context: AlertConnectorContext) {
  if (typeof window === 'undefined') return;
  const biasLabel = signal.bias ?? context.bias?.label ?? null;
  const payload = {
    type: 'ict_alert',
    time: signal.time,
    direction: signal.direction,
    setup: signal.setup ?? 'ict',
    price: signal.price,
    stop: signal.stop ?? null,
    tp1: signal.tp1 ?? null,
    session: signal.session ?? context.session ?? null,
    bias: biasLabel,
    symbol: context.symbol,
    timeframe: context.timeframe,
    source: context.source,
  };
  if (!webhookUrl) {
    if (process.env.NEXT_PUBLIC_DEBUG_SIGNALS === 'true') {
      console.info('[ICT][alert]', payload);
    }
    return;
  }
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[ICT] alert webhook failed', err);
  }
}
