const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  assetClass: 'crypto',
  symbol: 'BTCUSDT',
  timeframe: '15m',
  limit: '300',
  baseUrl: 'http://localhost:3000',
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const assetClass = normalizeAssetClass(options.assetClass || DEFAULTS.assetClass);
  const symbol = (options.symbol || DEFAULTS.symbol).toUpperCase();
  const timeframe = options.timeframe || DEFAULTS.timeframe;
  const limit = normalizeLimit(options.limit || DEFAULTS.limit);
  const baseUrl = (options.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, '');
  const outPath = options.out
    ? path.resolve(process.cwd(), options.out)
    : path.join(
        __dirname,
        'fixtures',
        buildFixtureFileName(assetClass, symbol, timeframe, new Date()),
      );

  const routePath = resolveRoutePath(assetClass);
  const url = new URL(`${baseUrl}${routePath}`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', timeframe);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to capture fixture (${response.status}): ${body}`);
  }

  const json = await response.json();
  const candles = Array.isArray(json.candles) ? json.candles : [];
  if (candles.length < 2) {
    throw new Error(`Expected at least 2 candles from ${url.toString()}`);
  }

  const fixture = {
    fixtureType: 'analysis-regression',
    capturedAt: new Date().toISOString(),
    assetClass,
    symbol,
    timeframe,
    source: json.source || null,
    timezone: json.timezone || 'UTC',
    warning: json.warning || null,
    detail: json.detail || null,
    candles,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

  console.log('saved', path.relative(process.cwd(), outPath));
  console.log('symbol', symbol);
  console.log('assetClass', assetClass);
  console.log('timeframe', timeframe);
  console.log('candles', candles.length);
  console.log('source', fixture.source || 'unknown');
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      options[key] = 'true';
      continue;
    }
    options[key] = value;
    i += 1;
  }
  return options;
}

function normalizeAssetClass(assetClass) {
  if (assetClass === 'crypto' || assetClass === 'forex' || assetClass === 'stocks') {
    return assetClass;
  }
  throw new Error(`Unsupported assetClass "${assetClass}". Use crypto, forex, or stocks.`);
}

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed < 10) {
    throw new Error(`Invalid limit "${limit}". Use a number >= 10.`);
  }
  return Math.floor(parsed);
}

function resolveRoutePath(assetClass) {
  switch (assetClass) {
    case 'crypto':
      return '/api/crypto/klines';
    case 'forex':
      return '/api/forex/klines';
    case 'stocks':
      return '/api/stocks/klines';
    default:
      throw new Error(`Unsupported assetClass "${assetClass}"`);
  }
}

function buildFixtureFileName(assetClass, symbol, timeframe, capturedAt) {
  const stamp = capturedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const safeSymbol = symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const safeTimeframe = timeframe.toLowerCase();
  return `${assetClass}-${safeSymbol}-${safeTimeframe}-${stamp}.json`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
