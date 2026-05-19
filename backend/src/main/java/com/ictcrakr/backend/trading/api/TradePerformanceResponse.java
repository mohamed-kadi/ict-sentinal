package com.ictcrakr.backend.trading.api;

import java.time.Instant;
import java.util.Map;

public record TradePerformanceResponse(
  long totalTrades,
  long wins,
  long losses,
  double winRate,
  double averageR,
  Instant lastTradeAt,
  Map<String, TradePerformanceSetupResponse> setups
) {
}
