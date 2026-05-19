package com.ictcrakr.backend.trading.service;

import com.ictcrakr.backend.trading.api.CreateTradeRequest;
import com.ictcrakr.backend.trading.api.TradeEntryResponse;
import com.ictcrakr.backend.trading.api.TradePerformanceResponse;
import com.ictcrakr.backend.trading.api.TradePerformanceSetupResponse;
import com.ictcrakr.backend.trading.config.TradeAnalysisProperties;
import com.ictcrakr.backend.trading.domain.TradeJournalEntry;
import com.ictcrakr.backend.trading.domain.TradeResult;
import com.ictcrakr.backend.trading.repository.TradeJournalRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class TradeJournalService {

  private final TradeJournalRepository repository;
  private final TradeAnalysisProperties analysisProperties;

  public TradeJournalService(
    TradeJournalRepository repository,
    TradeAnalysisProperties analysisProperties
  ) {
    this.repository = repository;
    this.analysisProperties = analysisProperties;
  }

  public TradeEntryResponse recordTrade(CreateTradeRequest request) {
    TradeJournalEntry saved = repository.save(
      new TradeJournalEntry(
        normalizeUpper(request.symbol()),
        normalizeToken(request.timeframe()),
        normalizeText(request.setup()),
        normalizeNullableText(request.session()),
        normalizeNullableText(request.bias()),
        request.direction(),
        request.result(),
        request.rMultiple(),
        request.entryPrice(),
        request.exitPrice(),
        request.stopPrice(),
        request.takeProfitPrice(),
        request.executedAt(),
        request.closedAt() != null ? request.closedAt() : request.executedAt()
      )
    );

    return new TradeEntryResponse(saved.getId(), saved.getCreatedAt());
  }

  public TradePerformanceResponse getPerformance(
    String symbol,
    String timeframe,
    Integer lookbackDays
  ) {
    Specification<TradeJournalEntry> filters = alwaysTrue();

    if (StringUtils.hasText(symbol)) {
      String normalizedSymbol = normalizeUpper(symbol);
      filters = filters.and(
        (root, query, cb) -> cb.equal(cb.upper(root.get("symbol")), normalizedSymbol)
      );
    }

    if (StringUtils.hasText(timeframe)) {
      String normalizedTimeframe = normalizeToken(timeframe);
      filters = filters.and(
        (root, query, cb) -> cb.equal(cb.upper(root.get("timeframe")), normalizedTimeframe)
      );
    }

    if (lookbackDays != null && lookbackDays > 0) {
      Instant cutoff = Instant.now().minus(lookbackDays, ChronoUnit.DAYS);
      filters = filters.and(
        (root, query, cb) -> cb.greaterThanOrEqualTo(root.get("closedAt"), cutoff)
      );
    }

    List<TradeJournalEntry> entries = repository.findAll(
      filters,
      Sort.by(Sort.Order.desc("closedAt"), Sort.Order.desc("createdAt"))
    );

    long wins = 0;
    double totalR = 0;
    Instant lastTradeAt = null;
    Map<String, MutableSetupStats> setupStats = new TreeMap<>();

    for (TradeJournalEntry entry : entries) {
      if (entry.getResult() == TradeResult.WIN) {
        wins += 1;
      }
      totalR += entry.getRMultiple().doubleValue();
      if (lastTradeAt == null || entry.getClosedAt().isAfter(lastTradeAt)) {
        lastTradeAt = entry.getClosedAt();
      }

      MutableSetupStats stats = setupStats.computeIfAbsent(
        entry.getSetupName(),
        ignored -> new MutableSetupStats()
      );
      stats.totalTrades += 1;
      double rMultiple = entry.getRMultiple().doubleValue();
      stats.totalR += rMultiple;
      if (entry.getResult() == TradeResult.WIN) {
        stats.wins += 1;
        stats.winR += rMultiple;
      } else {
        stats.losses += 1;
        stats.lossR += rMultiple;
      }
    }

    Map<String, TradePerformanceSetupResponse> setups = new LinkedHashMap<>();
    for (Map.Entry<String, MutableSetupStats> entry : setupStats.entrySet()) {
      MutableSetupStats stats = entry.getValue();
      double winRate = stats.totalTrades == 0 ? 0 : (double) stats.wins / stats.totalTrades;
      double averageR = stats.totalTrades == 0 ? 0 : stats.totalR / stats.totalTrades;
      double averageWinR = stats.wins == 0 ? 0 : stats.winR / stats.wins;
      double averageLossR = stats.losses == 0 ? 0 : stats.lossR / stats.losses;
      boolean allowed =
        stats.totalTrades < analysisProperties.getMinSampleSize()
          || winRate >= analysisProperties.getMinWinRate();
      double sizeMultiplier =
        winRate >= analysisProperties.getStrongWinRate()
          ? analysisProperties.getStrongSizeMultiplier()
          : analysisProperties.getNeutralSizeMultiplier();

      setups.put(
        entry.getKey(),
        new TradePerformanceSetupResponse(
          stats.totalTrades,
          stats.wins,
          stats.losses,
          winRate,
          averageR,
          averageWinR,
          averageLossR,
          allowed,
          sizeMultiplier
        )
      );
    }

    long totalTrades = entries.size();
    long losses = totalTrades - wins;

    return new TradePerformanceResponse(
      totalTrades,
      wins,
      losses,
      totalTrades == 0 ? 0 : (double) wins / totalTrades,
      totalTrades == 0 ? 0 : totalR / totalTrades,
      lastTradeAt,
      setups
    );
  }

  private static Specification<TradeJournalEntry> alwaysTrue() {
    return (root, query, cb) -> cb.conjunction();
  }

  private static String normalizeUpper(String value) {
    return normalizeText(value).toUpperCase(Locale.ROOT);
  }

  private static String normalizeToken(String value) {
    return normalizeText(value).toUpperCase(Locale.ROOT);
  }

  private static String normalizeText(String value) {
    return value == null ? "" : value.trim();
  }

  private static String normalizeNullableText(String value) {
    if (!StringUtils.hasText(value)) {
      return null;
    }
    return value.trim();
  }

  private static final class MutableSetupStats {
    private long totalTrades;
    private long wins;
    private long losses;
    private double totalR;
    private double winR;
    private double lossR;
  }
}
