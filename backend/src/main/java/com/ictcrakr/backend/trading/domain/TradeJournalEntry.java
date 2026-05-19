package com.ictcrakr.backend.trading.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "trade_journal_entries")
public class TradeJournalEntry {

  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;

  @Column(nullable = false, length = 32)
  private String symbol;

  @Column(nullable = false, length = 16)
  private String timeframe;

  @Column(name = "setup_name", nullable = false, length = 128)
  private String setupName;

  @Column(name = "session_name", length = 64)
  private String sessionName;

  @Column(name = "market_bias", length = 32)
  private String marketBias;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 8)
  private TradeDirection direction;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 8)
  private TradeResult result;

  @Column(name = "r_multiple", nullable = false, precision = 10, scale = 4)
  private BigDecimal rMultiple;

  @Column(name = "entry_price", precision = 18, scale = 8)
  private BigDecimal entryPrice;

  @Column(name = "exit_price", precision = 18, scale = 8)
  private BigDecimal exitPrice;

  @Column(name = "stop_price", precision = 18, scale = 8)
  private BigDecimal stopPrice;

  @Column(name = "take_profit_price", precision = 18, scale = 8)
  private BigDecimal takeProfitPrice;

  @Column(name = "executed_at", nullable = false)
  private Instant executedAt;

  @Column(name = "closed_at", nullable = false)
  private Instant closedAt;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected TradeJournalEntry() {
  }

  public TradeJournalEntry(
    String symbol,
    String timeframe,
    String setupName,
    String sessionName,
    String marketBias,
    TradeDirection direction,
    TradeResult result,
    BigDecimal rMultiple,
    BigDecimal entryPrice,
    BigDecimal exitPrice,
    BigDecimal stopPrice,
    BigDecimal takeProfitPrice,
    Instant executedAt,
    Instant closedAt
  ) {
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.setupName = setupName;
    this.sessionName = sessionName;
    this.marketBias = marketBias;
    this.direction = direction;
    this.result = result;
    this.rMultiple = rMultiple;
    this.entryPrice = entryPrice;
    this.exitPrice = exitPrice;
    this.stopPrice = stopPrice;
    this.takeProfitPrice = takeProfitPrice;
    this.executedAt = executedAt;
    this.closedAt = closedAt;
  }

  @PrePersist
  void assignCreatedAt() {
    if (createdAt == null) {
      createdAt = Instant.now();
    }
  }

  public UUID getId() {
    return id;
  }

  public String getSymbol() {
    return symbol;
  }

  public String getTimeframe() {
    return timeframe;
  }

  public String getSetupName() {
    return setupName;
  }

  public String getSessionName() {
    return sessionName;
  }

  public String getMarketBias() {
    return marketBias;
  }

  public TradeDirection getDirection() {
    return direction;
  }

  public TradeResult getResult() {
    return result;
  }

  public BigDecimal getRMultiple() {
    return rMultiple;
  }

  public BigDecimal getEntryPrice() {
    return entryPrice;
  }

  public BigDecimal getExitPrice() {
    return exitPrice;
  }

  public BigDecimal getStopPrice() {
    return stopPrice;
  }

  public BigDecimal getTakeProfitPrice() {
    return takeProfitPrice;
  }

  public Instant getExecutedAt() {
    return executedAt;
  }

  public Instant getClosedAt() {
    return closedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
