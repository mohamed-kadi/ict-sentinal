const fs = require('fs');
const path = require('path');

async function main() {
  const backendBaseUrl =
    (process.env.BACKEND_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  const requestedPath = process.argv[2];
  const samplePath = requestedPath
    ? path.resolve(process.cwd(), requestedPath)
    : path.join(__dirname, 'fixtures', 'backtest-sample.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const candles = Array.isArray(sample.candles) ? sample.candles : [];

  if (candles.length < 2) {
    throw new Error(`Expected at least 2 candles in ${samplePath}`);
  }

  const response = await fetch(`${backendBaseUrl}/api/v1/analysis/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: sample.symbol || 'BTCUSDT',
      timeframe: sample.timeframe || sample.interval || '15m',
      candles,
      signalLimit: 25,
      optimizerEnabled: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Backend analysis failed (${response.status}): ${body}`);
  }

  const analysis = await response.json();
  console.log('fixture', path.relative(process.cwd(), samplePath));
  console.log('engine', analysis.engineVersion);
  console.log('signals', analysis.signals.length);
  if (analysis.signals.length) {
    console.log(analysis.signals.slice(0, 5));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
