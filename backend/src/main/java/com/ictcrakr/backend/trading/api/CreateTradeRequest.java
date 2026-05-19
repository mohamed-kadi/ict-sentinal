package com.ictcrakr.backend.trading.api;

import com.ictcrakr.backend.trading.domain.TradeDirection;
import com.ictcrakr.backend.trading.domain.TradeResult;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;

public record CreateTradeRequest(
  @NotBlank String symbol,
  @NotBlank String timeframe,
  @NotBlank String setup,
  String session,
  String bias,
  @NotNull TradeDirection direction,
  @NotNull TradeResult result,
  @NotNull BigDecimal rMultiple,
  BigDecimal entryPrice,
  BigDecimal exitPrice,
  BigDecimal stopPrice,
  BigDecimal takeProfitPrice,
  @NotNull Instant executedAt,
  Instant closedAt
) {
}
