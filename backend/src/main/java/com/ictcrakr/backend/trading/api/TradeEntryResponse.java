package com.ictcrakr.backend.trading.api;

import java.time.Instant;
import java.util.UUID;

public record TradeEntryResponse(
  UUID id,
  Instant createdAt
) {
}
