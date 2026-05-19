package com.ictcrakr.backend.trading.api;

public record TradePerformanceSetupResponse(
  long totalTrades,
  long wins,
  long losses,
  double winRate,
  double averageR,
  double averageWinR,
  double averageLossR,
  boolean allowed,
  double sizeMultiplier
) {
}
