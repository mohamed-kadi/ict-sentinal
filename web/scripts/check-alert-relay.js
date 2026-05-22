const { randomUUID } = require('crypto');

function readOption(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readNumberOption(flag, fallback) {
  const value = readOption(flag, fallback);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a numeric value for ${flag}, received "${value}"`);
  }
  return parsed;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { response, text, json };
}

function printBlock(label, value) {
  console.log(`${label}:`);
  if (typeof value === 'string') {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function buildPayload() {
  const direction = readOption('--direction', process.env.ALERT_TEST_DIRECTION || 'buy');
  if (direction !== 'buy' && direction !== 'sell') {
    throw new Error(`Expected --direction to be "buy" or "sell", received "${direction}"`);
  }

  const setup = readOption('--setup', process.env.ALERT_TEST_SETUP || 'Trend Pullback');
  const symbol = readOption('--symbol', process.env.ALERT_TEST_SYMBOL || 'BTCUSDT');
  const timeframe = readOption('--timeframe', process.env.ALERT_TEST_TIMEFRAME || '15m');
  const session = readOption('--session', process.env.ALERT_TEST_SESSION || 'smoke-test');
  const source = readOption('--source', process.env.ALERT_TEST_SOURCE || 'relay-smoke-script');
  const price = readNumberOption('--price', process.env.ALERT_TEST_PRICE || '65000');
  const stop = readNumberOption('--stop', process.env.ALERT_TEST_STOP || String(price - 250));
  const tp1 = readNumberOption('--tp1', process.env.ALERT_TEST_TP1 || String(price + 500));
  const time = Date.now();

  return {
    type: 'ict_alert',
    signalId: randomUUID(),
    time,
    direction,
    setup,
    price,
    stop,
    tp1,
    session,
    bias: direction === 'buy' ? 'Bullish' : 'Bearish',
    symbol,
    timeframe,
    source,
  };
}

async function main() {
  const baseUrl = (
    readOption('--base-url', process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://localhost:3000')
  ).replace(/\/+$/, '');

  console.log(`Checking relay through ${baseUrl}/api/alerts/relay`);

  const status = await requestJson(`${baseUrl}/api/alerts/relay`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!status.response.ok) {
    throw new Error(
      `Relay status check failed (${status.response.status}): ${status.text || status.response.statusText || 'Unknown error'}`,
    );
  }

  printBlock('Relay status', status.json ?? status.text);

  if (!status.json || status.json.configured !== true) {
    throw new Error('Relay is not configured. Set ALERT_WEBHOOK_URL or ALERT_EXECUTION_URL before running this check.');
  }

  const payload = buildPayload();
  printBlock('Sample alert', payload);

  const result = await requestJson(`${baseUrl}/api/alerts/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  printBlock('Relay result', result.json ?? result.text);

  if (!result.response.ok) {
    throw new Error(
      `Relay smoke check failed (${result.response.status}): ${result.text || result.response.statusText || 'Unknown error'}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
