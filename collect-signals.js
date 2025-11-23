const fs=require('fs');
const path=require('path');
require('ts-node/register');
const {
  detectSwings,
  detectFVG,
  detectOrderBlocks,
  detectLiquiditySweeps,
  detectBreakerBlocks,
  computePremiumDiscountRange,
  detectSignals,
  computeBias,
}=require('./src/lib/ict.ts');
const sessions=[
  { label: 'Asia', startHour: 0, endHour: 3 },
  { label: 'London', startHour: 7, endHour: 10, killStartHour: 7, killEndHour: 10 },
  { label: 'New York', startHour: 12, endHour: 16, killStartHour: 12, killEndHour: 16 },
];
const data=JSON.parse(fs.readFileSync('public/backtest-sample.json','utf8'));
const candles=data.candles;
const swings=detectSwings(candles);
const gaps=detectFVG(candles);
const orderBlocks=detectOrderBlocks(candles);
const sweeps=detectLiquiditySweeps(candles);
const breakers=detectBreakerBlocks(orderBlocks,candles);
const premiumRange=computePremiumDiscountRange(candles);
const bias=computeBias(candles);
const signals=detectSignals(
  candles,
  bias,
  gaps,
  orderBlocks,
  sessions,
  swings,
  sweeps,
  true,
  breakers,
  premiumRange,
  null,
  { debug: true },
);
console.log('signals', signals.length);
if (signals.length) {
  console.log(signals.slice(0,5));
}
