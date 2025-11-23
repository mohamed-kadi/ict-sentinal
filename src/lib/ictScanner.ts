import { Bias, PremiumDiscountRange, Signal } from './types';

export type IctScannerResult = {
  direction: 'buy' | 'sell' | null;
  label: string;
  score: number;
  summary: string;
  reasons: string[];
};

type EvaluateArgs = {
  signal?: Signal;
  bias?: Bias;
  premiumDiscount?: PremiumDiscountRange | null;
  latestPrice?: number | null;
};

export function evaluateIctScanner({ signal, bias, premiumDiscount, latestPrice }: EvaluateArgs): IctScannerResult {
  if (!signal) {
    return {
      direction: null,
      label: 'Neutral',
      score: 50,
      summary: 'No qualified ICT setups on this timeframe yet.',
      reasons: ['Await alignment of ICT confluence factors.'],
    };
  }

  let score = 50;
  const reasons: string[] = [];
  const direction = signal.direction;
  const price = latestPrice ?? signal.price;

  if (bias?.label) {
    const aligned = (bias.label === 'Bullish' && direction === 'buy') || (bias.label === 'Bearish' && direction === 'sell');
    if (aligned) {
      score += 15;
      reasons.push(`Bias ${bias.label} supports ${direction === 'buy' ? 'long' : 'short'} setups.`);
    } else {
      score -= 15;
      reasons.push(`Bias ${bias.label} contradicts signal direction.`);
    }
  }

  if (premiumDiscount) {
    if (direction === 'buy' && price <= premiumDiscount.equilibrium) {
      score += 15;
      reasons.push('Price trades inside the discount side of the dealing range.');
    }
    if (direction === 'sell' && price >= premiumDiscount.equilibrium) {
      score += 15;
      reasons.push('Price trades inside the premium side of the dealing range.');
    }
  }

  const rr = computeRR(signal);
  if (rr != null) {
    if (rr >= 2) {
      score += 10;
      reasons.push(`Risk-to-reward is attractive (${rr.toFixed(2)}R).`);
    } else if (rr < 1) {
      score -= 10;
      reasons.push(`Risk-to-reward is weak (${rr.toFixed(2)}R).`);
    }
  }

  const sessionScore = scoreForSession(signal.time);
  score += sessionScore.value;
  if (sessionScore.reason) reasons.push(sessionScore.reason);

  score = Math.max(0, Math.min(100, score));
  const label = labelForScore(score, direction);
  const summary =
    direction == null
      ? 'Waiting for cleaner ICT confluence.'
      : `${label} opportunity (${score.toFixed(0)} confidence).`;

  return {
    direction,
    label,
    score,
    summary,
    reasons,
  };
}

function computeRR(signal: Signal): number | null {
  if (!signal.stop || !signal.tp1) return null;
  const risk = signal.direction === 'buy' ? signal.price - signal.stop : signal.stop - signal.price;
  const reward = signal.direction === 'buy' ? signal.tp1 - signal.price : signal.price - signal.tp1;
  if (risk <= 0) return null;
  return reward / risk;
}

function scoreForSession(timeMs: number) {
  const date = new Date(timeMs);
  const utcHour = date.getUTCHours();
  if (utcHour >= 12 && utcHour <= 20) {
    return { value: 10, reason: 'Signal printed during a high-liquidity NY session window.' };
  }
  if (utcHour >= 7 && utcHour < 12) {
    return { value: 5, reason: 'Signal printed during the London session.' };
  }
  return { value: -5, reason: 'Signal is outside typical kill-zones; monitor for confirmation.' };
}

function labelForScore(score: number, direction: 'buy' | 'sell' | null) {
  if (!direction) {
    if (score >= 60) return 'Bullish bias';
    if (score <= 40) return 'Bearish bias';
    return 'Neutral';
  }
  const dirWord = direction === 'buy' ? 'Buy' : 'Sell';
  if (score >= 80) return `Strong ${dirWord}`;
  if (score >= 65) return dirWord;
  if (score <= 35) return `Strong ${direction === 'buy' ? 'Sell' : 'Buy'}`;
  if (score <= 50) return direction === 'buy' ? 'Caution Buy' : 'Caution Sell';
  return dirWord;
}
