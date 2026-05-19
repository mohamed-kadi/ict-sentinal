package com.ictcrakr.backend.analysis.api;

import java.util.List;

public record SignalAnalysisResponse(
  SignalBiasResponse bias,
  List<SignalAnalysisSignalResponse> signals,
  List<SwingPayload> swings,
  List<GapPayload> gaps,
  List<OrderBlockPayload> orderBlocks,
  List<StructureShiftPayload> structureShifts,
  List<LiquiditySweepPayload> sweeps,
  List<EqualLiquidityLevelPayload> equalHighsLows,
  List<BreakerBlockPayload> breakerBlocks,
  PremiumDiscountRangePayload premiumDiscount,
  HtfLevelsPayload htfLevels,
  Model2022Payload model2022,
  String engineVersion,
  List<String> supportedSetups
) {
  public record SwingPayload(
    int index,
    long time,
    double price,
    String type
  ) {
  }

  public record GapPayload(
    long startTime,
    long endTime,
    double top,
    double bottom,
    String type
  ) {
  }

  public record OrderBlockPayload(
    long startTime,
    long endTime,
    double high,
    double low,
    String type
  ) {
  }

  public record StructureShiftPayload(
    long time,
    double price,
    String direction,
    String label
  ) {
  }

  public record LiquiditySweepPayload(
    long time,
    double price,
    String type,
    String direction
  ) {
  }

  public record EqualLiquidityLevelPayload(
    double price,
    List<Long> times,
    String kind
  ) {
  }

  public record BreakerBlockPayload(
    long startTime,
    long endTime,
    double high,
    double low,
    String type,
    String sourceObType,
    String grade
  ) {
  }

  public record PremiumDiscountRangePayload(
    double high,
    double low,
    double equilibrium
  ) {
  }

  public record HtfLevelsPayload(
    Double prevDayHigh,
    Double prevDayLow,
    Double prevWeekHigh,
    Double prevWeekLow,
    Double weekOpen,
    Double monthOpen
  ) {
  }

  public record Model2022Payload(
    List<StrongWeakSwingPayload> strongSwings,
    List<OrderBlockPayload> obWithDisplacement,
    DailyCandlePayload dailyCandle,
    DailyLiquidityPayload dailyLiquidity,
    List<Model2022SignalPayload> m15Signals
  ) {
  }

  public record StrongWeakSwingPayload(
    int index,
    long time,
    double price,
    String type,
    String strength
  ) {
  }

  public record DailyCandlePayload(
    String date,
    double open,
    double high,
    double low,
    double close
  ) {
  }

  public record DailyLiquidityPayload(
    Double pdh,
    Double pdl,
    List<DailyLevelPayload> last3Highs,
    List<DailyLevelPayload> last3Lows,
    Double midnightOpen
  ) {
  }

  public record DailyLevelPayload(
    double price,
    String date
  ) {
  }

  public record Model2022SignalPayload(
    long time,
    String direction,
    String label,
    GapPayload fvg,
    double entry,
    Double stop,
    List<String> basis
  ) {
  }
}
