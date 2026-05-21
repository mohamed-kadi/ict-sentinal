package com.ictcrakr.backend.trading.api;

import java.util.List;

public record TradeJournalEntriesResponse(
  long totalEntries,
  List<TradeJournalEntrySummaryResponse> entries
) {
}
