import fs from 'fs';
import path from 'path';

const MEMORY_FILE = path.join(process.cwd(), 'ict_trade_memory.json');

export type TradeRecord = {
  setup: string;
  session: string;
  bias: string;
  result: 'win' | 'loss';
  rMultiple: number;
  timestamp: number;
};

export type OptimizationWeights = {
  [setupName: string]: {
    winRate: number;
    totalTrades: number;
    allowed: boolean;
    sizeMultiplier: number;
  };
};

export class TradeMemory {
  private memory: TradeRecord[] = [];

  constructor() {
    this.load();
  }

  private load() {
    if (!fs.existsSync(MEMORY_FILE)) {
      this.memory = [];
      return;
    }
    try {
      const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
      this.memory = JSON.parse(raw);
    } catch {
      this.memory = [];
    }
  }

  public logTrade(setup: string, session: string, bias: string, result: 'win' | 'loss', rMultiple: number) {
    this.memory.push({
      setup,
      session,
      bias,
      result,
      rMultiple,
      timestamp: Date.now(),
    });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memory, null, 2));
  }

  public getOptimizationParams(): OptimizationWeights {
    const stats: Record<string, { wins: number; total: number }> = {};
    for (const trade of this.memory) {
      if (!stats[trade.setup]) {
        stats[trade.setup] = { wins: 0, total: 0 };
      }
      stats[trade.setup].total += 1;
      if (trade.result === "win") {
        stats[trade.setup].wins += 1;
      }
    }

    const weights: OptimizationWeights = {};
    for (const setup of Object.keys(stats)) {
      const { wins, total } = stats[setup];
      const winRate = total ? wins / total : 0;
      weights[setup] = {
        winRate,
        totalTrades: total,
        allowed: total < 5 || winRate >= 0.45,
        sizeMultiplier: winRate > 0.6 ? 1.5 : 1,
      };
    }
    return weights;
  }
}
