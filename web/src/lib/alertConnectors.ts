import type { Signal, Bias, Timeframe } from '@/lib/types';

export type AlertConnectorContext = {
  symbol?: string;
  timeframe?: Timeframe;
  bias?: Bias;
  price?: number;
  session?: string | null;
  source?: string;
};

export type AlertRelayChannel = 'webhook' | 'execution';

export type AlertRelayDeliveryStatus = 'delivered' | 'executed' | 'armed' | 'skipped' | 'failed';

export type AlertRelayAckStatus = 'acknowledged' | 'missing' | 'not-applicable';

export type AlertRelayAcceptanceStatus = 'accepted' | 'rejected' | 'unknown' | 'not-applicable';

export type AlertRelayResponseSnapshot = {
  status: number | null;
  statusText?: string | null;
  bodyPreview?: string | null;
  receivedAt: number;
};

export type AlertRelayRequest = {
  type: 'ict_alert';
  signalId: string;
  time: number;
  direction: Signal['direction'];
  setup: string;
  price: number;
  stop: number | null;
  tp1: number | null;
  session: string | null;
  bias: Bias['label'] | null;
  symbol?: string;
  timeframe?: Timeframe;
  source?: string;
};

export type AlertRelayResult = {
  channel: AlertRelayChannel;
  deliveryStatus: 'delivered' | 'skipped' | 'failed';
  ackStatus: 'acknowledged' | 'missing';
  acceptanceStatus: 'accepted' | 'rejected' | 'unknown';
  detail: string;
  lastResponse: AlertRelayResponseSnapshot | null;
};

const publicRelayMode = normalizeRelayMode(process.env.NEXT_PUBLIC_ALERT_RELAY_MODE);
const publicExecutionUrl = process.env.NEXT_PUBLIC_ALERT_EXECUTION_URL?.trim() || null;
const publicWebhookUrl = process.env.NEXT_PUBLIC_ALERT_WEBHOOK?.trim() || null;

export const alertRelayMode: AlertRelayChannel | null =
  publicRelayMode ?? (publicExecutionUrl ? 'execution' : publicWebhookUrl ? 'webhook' : null);
export const alertRelayConfigured = Boolean(alertRelayMode);
export const alertRelayLabel =
  alertRelayMode === 'execution' ? 'Execution' : alertRelayMode === 'webhook' ? 'Webhook' : 'Local only';

export async function notifyAlertConnectors(
  signal: Signal,
  context: AlertConnectorContext,
): Promise<AlertRelayResult> {
  if (typeof window === 'undefined') {
    return {
      channel: alertRelayMode ?? 'webhook',
      deliveryStatus: 'skipped',
      ackStatus: 'missing',
      acceptanceStatus: 'unknown',
      detail: 'Browser relay is unavailable on the server.',
      lastResponse: null,
    };
  }
  const biasLabel = signal.bias ?? context.bias?.label ?? null;
  const payload: AlertRelayRequest = {
    type: 'ict_alert',
    signalId: `${signal.direction}-${signal.time}-${signal.setup ?? 'ict'}`,
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
  const debugSignals = process.env.NEXT_PUBLIC_DEBUG_SIGNALS === 'true';
  if (debugSignals) {
    console.info('[ICT][alert]', payload);
  }
  try {
    const response = await fetch('/api/alerts/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const parsed = (await response.json().catch(() => null)) as unknown;
    if (isAlertRelayResult(parsed)) {
      return parsed;
    }
    return {
      channel: alertRelayMode ?? 'webhook',
      deliveryStatus: response.ok ? 'delivered' : 'failed',
      ackStatus: response.ok ? 'acknowledged' : 'missing',
      acceptanceStatus: response.ok ? 'unknown' : 'rejected',
      detail: response.ok
        ? 'Relay adapter responded, but did not return structured delivery details.'
        : `Relay adapter request failed (${response.status}).`,
      lastResponse: {
        status: response.status,
        statusText: response.statusText || null,
        receivedAt: Date.now(),
      },
    };
  } catch (err) {
    console.warn('[ICT] alert webhook failed', err);
    return {
      channel: alertRelayMode ?? 'webhook',
      deliveryStatus: 'failed',
      ackStatus: 'missing',
      acceptanceStatus: 'unknown',
      detail: err instanceof Error ? err.message : 'Webhook relay failed.',
      lastResponse: null,
    };
  }
}

function normalizeRelayMode(value?: string | null): AlertRelayChannel | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'execution' || normalized === 'webhook') {
    return normalized;
  }
  return null;
}

function isAlertRelayResult(value: unknown): value is AlertRelayResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AlertRelayResult>;
  return (
    (candidate.channel === 'webhook' || candidate.channel === 'execution') &&
    (candidate.deliveryStatus === 'delivered' ||
      candidate.deliveryStatus === 'skipped' ||
      candidate.deliveryStatus === 'failed') &&
    (candidate.ackStatus === 'acknowledged' || candidate.ackStatus === 'missing') &&
    (candidate.acceptanceStatus === 'accepted' ||
      candidate.acceptanceStatus === 'rejected' ||
      candidate.acceptanceStatus === 'unknown') &&
    typeof candidate.detail === 'string'
  );
}
