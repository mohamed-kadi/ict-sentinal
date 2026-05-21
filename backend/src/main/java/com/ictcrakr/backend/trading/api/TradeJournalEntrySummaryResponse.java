package com.ictcrakr.backend.trading.api;

import com.ictcrakr.backend.trading.domain.TradeDirection;
import com.ictcrakr.backend.trading.domain.TradeResult;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record TradeJournalEntrySummaryResponse(
  UUID id,
  String symbol,
  String timeframe,
  String setup,
  String session,
  String bias,
  TradeDirection direction,
  TradeResult result,
  BigDecimal rMultiple,
  BigDecimal entryPrice,
  BigDecimal exitPrice,
  BigDecimal stopPrice,
  BigDecimal takeProfitPrice,
  Instant executedAt,
  Instant closedAt,
  Instant createdAt
) {
}
