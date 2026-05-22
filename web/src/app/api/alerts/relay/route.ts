import { NextRequest, NextResponse } from 'next/server';
import type {
  AlertRelayChannel,
  AlertRelayRequest,
  AlertRelayResult,
} from '@/lib/alertConnectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RelayTarget = {
  channel: AlertRelayChannel;
  url: string;
  token: string | null;
};

type ParsedRelayBody = {
  json: unknown;
  text: string | null;
  preview: string | null;
};

type RelayAcceptanceStatus = AlertRelayResult['acceptanceStatus'];

export async function GET() {
  const target = resolveRelayTarget();
  return NextResponse.json({
    configured: Boolean(target),
    channel: target?.channel ?? null,
    label: target ? relayChannelLabel(target.channel) : 'Local only',
  });
}

export async function POST(request: NextRequest) {
  const payload = await parsePayload(request);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid alert payload.' }, { status: 400 });
  }

  const target = resolveRelayTarget();
  if (!target) {
    return NextResponse.json(
      buildResult({
        channel: 'webhook',
        deliveryStatus: 'skipped',
        ackStatus: 'missing',
        acceptanceStatus: 'unknown',
        detail: 'No webhook or execution adapter is configured.',
        lastResponse: null,
      }),
      { status: 503 },
    );
  }

  try {
    const response = await fetch(target.url, {
      method: 'POST',
      headers: buildRelayHeaders(target.token),
      body: JSON.stringify({
        ...payload,
        sourceApp: 'ict-trading-desk',
        relayedAt: new Date().toISOString(),
      }),
      cache: 'no-store',
    });
    const parsed = await parseRelayBody(response);
    const acceptanceStatus = inferAcceptanceStatus(parsed, response.ok);
    const detail = describeRelayOutcome(target.channel, response, acceptanceStatus);
    const result = buildResult({
      channel: target.channel,
      deliveryStatus: response.ok ? 'delivered' : 'failed',
      ackStatus: 'acknowledged',
      acceptanceStatus,
      detail,
      lastResponse: {
        status: response.status,
        statusText: response.statusText || null,
        bodyPreview: parsed.preview,
        receivedAt: Date.now(),
      },
    });
    return NextResponse.json(result, { status: response.ok ? 200 : 502 });
  } catch (error) {
    const result = buildResult({
      channel: target.channel,
      deliveryStatus: 'failed',
      ackStatus: 'missing',
      acceptanceStatus: 'unknown',
      detail: error instanceof Error ? error.message : 'Relay adapter request failed.',
      lastResponse: null,
    });
    return NextResponse.json(result, { status: 502 });
  }
}

function buildRelayHeaders(token: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

function resolveRelayTarget(): RelayTarget | null {
  const preferredChannel = resolveRelayMode();
  const executionUrl =
    process.env.ALERT_EXECUTION_URL?.trim() || process.env.NEXT_PUBLIC_ALERT_EXECUTION_URL?.trim() || null;
  const webhookUrl =
    process.env.ALERT_WEBHOOK_URL?.trim() || process.env.NEXT_PUBLIC_ALERT_WEBHOOK?.trim() || null;
  const executionTarget = executionUrl
    ? {
        channel: 'execution' as const,
        url: executionUrl,
        token: process.env.ALERT_EXECUTION_TOKEN?.trim() || null,
      }
    : null;
  const webhookTarget = webhookUrl
    ? {
        channel: 'webhook' as const,
        url: webhookUrl,
        token: process.env.ALERT_WEBHOOK_TOKEN?.trim() || null,
      }
    : null;

  if (preferredChannel === 'execution') {
    return executionTarget ?? webhookTarget;
  }
  if (preferredChannel === 'webhook') {
    return webhookTarget ?? executionTarget;
  }
  return executionTarget ?? webhookTarget;
}

async function parsePayload(request: NextRequest): Promise<AlertRelayRequest | null> {
  try {
    const payload = (await request.json()) as Partial<AlertRelayRequest>;
    if (
      payload.type !== 'ict_alert' ||
      typeof payload.signalId !== 'string' ||
      typeof payload.time !== 'number' ||
      (payload.direction !== 'buy' && payload.direction !== 'sell') ||
      typeof payload.setup !== 'string' ||
      typeof payload.price !== 'number'
    ) {
      return null;
    }
    return {
      type: payload.type,
      signalId: payload.signalId,
      time: payload.time,
      direction: payload.direction,
      setup: payload.setup,
      price: payload.price,
      stop: payload.stop ?? null,
      tp1: payload.tp1 ?? null,
      session: payload.session ?? null,
      bias: payload.bias ?? null,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      source: payload.source,
    };
  } catch {
    return null;
  }
}

async function parseRelayBody(response: Response): Promise<ParsedRelayBody> {
  const text = await response.text().catch(() => '');
  if (!text) {
    return { json: null, text: null, preview: null };
  }

  try {
    const json = JSON.parse(text);
    return { json, text, preview: buildPreview(text) };
  } catch {
    return { json: null, text, preview: buildPreview(text) };
  }
}

function inferAcceptanceStatus(
  body: ParsedRelayBody,
  responseOk: boolean,
): RelayAcceptanceStatus {
  const explicitFromJson = inferAcceptanceFromJson(body.json);
  if (explicitFromJson) return explicitFromJson;

  const explicitFromText = inferAcceptanceFromText(body.text);
  if (explicitFromText) return explicitFromText;

  return responseOk ? 'unknown' : 'rejected';
}

function inferAcceptanceFromJson(value: unknown): Exclude<RelayAcceptanceStatus, 'unknown'> | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  for (const key of ['accepted', 'ack', 'acknowledged', 'success', 'ok', 'queued', 'received']) {
    const field = record[key];
    if (typeof field === 'boolean') {
      return field ? 'accepted' : 'rejected';
    }
  }

  for (const key of ['status', 'state', 'result', 'message']) {
    const field = record[key];
    if (typeof field === 'string') {
      const inferred = inferAcceptanceFromText(field);
      if (inferred) return inferred;
    }
  }

  return null;
}

function inferAcceptanceFromText(value: string | null): Exclude<RelayAcceptanceStatus, 'unknown'> | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes('accepted') ||
    normalized.includes('acknowledged') ||
    normalized.includes('queued') ||
    normalized.includes('received') ||
    normalized === 'ok' ||
    normalized === 'success'
  ) {
    return 'accepted';
  }

  if (
    normalized.includes('rejected') ||
    normalized.includes('denied') ||
    normalized.includes('ignored') ||
    normalized.includes('failed') ||
    normalized.includes('invalid') ||
    normalized.includes('error')
  ) {
    return 'rejected';
  }

  return null;
}

function describeRelayOutcome(
  channel: AlertRelayChannel,
  response: Response,
  acceptanceStatus: RelayAcceptanceStatus,
) {
  const label = channel === 'execution' ? 'Execution adapter' : 'Webhook adapter';
  const statusLabel = response.statusText ? ` ${response.statusText}` : '';
  if (!response.ok) {
    return `${label} rejected the alert (${response.status}${statusLabel}).`;
  }
  if (acceptanceStatus === 'accepted') {
    return `${label} acknowledged and accepted the alert (${response.status}${statusLabel}).`;
  }
  if (acceptanceStatus === 'rejected') {
    return `${label} responded, but rejected the alert (${response.status}${statusLabel}).`;
  }
  return `${label} acknowledged delivery (${response.status}${statusLabel}), but acceptance was not explicit.`;
}

function buildPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 179)}…`;
}

function buildResult(result: AlertRelayResult): AlertRelayResult {
  return result;
}

function resolveRelayMode(): AlertRelayChannel | null {
  const value = process.env.ALERT_RELAY_MODE?.trim() || process.env.NEXT_PUBLIC_ALERT_RELAY_MODE?.trim() || null;
  if (value === 'execution' || value === 'webhook') {
    return value;
  }
  return null;
}

function relayChannelLabel(channel: AlertRelayChannel) {
  return channel === 'execution' ? 'Execution' : 'Webhook';
}
