package com.ictcrakr.backend.trading.api;

import com.ictcrakr.backend.trading.service.TradeJournalService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/trades")
public class TradeJournalController {

  private final TradeJournalService tradeJournalService;

  public TradeJournalController(TradeJournalService tradeJournalService) {
    this.tradeJournalService = tradeJournalService;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  public TradeEntryResponse createTrade(@Valid @RequestBody CreateTradeRequest request) {
    return tradeJournalService.recordTrade(request);
  }

  @GetMapping
  public TradeJournalEntriesResponse getTrades(
    @RequestParam(required = false) String symbol,
    @RequestParam(required = false) String timeframe,
    @RequestParam(required = false) @Min(1) @Max(3650) Integer lookbackDays,
    @RequestParam(required = false) @Min(1) @Max(200) Integer limit
  ) {
    return tradeJournalService.getRecentTrades(symbol, timeframe, lookbackDays, limit);
  }

  @GetMapping("/performance")
  public TradePerformanceResponse getPerformance(
    @RequestParam(required = false) String symbol,
    @RequestParam(required = false) String timeframe,
    @RequestParam(required = false) @Min(1) @Max(3650) Integer lookbackDays
  ) {
    return tradeJournalService.getPerformance(symbol, timeframe, lookbackDays);
  }
}
