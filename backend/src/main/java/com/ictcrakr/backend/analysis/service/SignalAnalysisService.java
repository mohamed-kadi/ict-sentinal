package com.ictcrakr.backend.analysis.service;

import com.ictcrakr.backend.analysis.api.SignalAnalysisCandleRequest;
import com.ictcrakr.backend.analysis.api.SignalAnalysisRequest;
import com.ictcrakr.backend.analysis.api.SignalAnalysisResponse;
import com.ictcrakr.backend.analysis.api.SignalAnalysisSignalResponse;
import com.ictcrakr.backend.analysis.api.SignalBiasResponse;
import com.ictcrakr.backend.trading.api.TradePerformanceSetupResponse;
import com.ictcrakr.backend.trading.service.TradeJournalService;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Service;

@Service
public class SignalAnalysisService {

  private static final String ENGINE_VERSION = "spring-ict-v1";
  private static final List<SessionZone> SESSION_ZONES = List.of(
    new SessionZone("Asia", 0, 3, 0, 2),
    new SessionZone("London", 7, 10, 7, 10),
    new SessionZone("New York", 12, 16, 12, 15)
  );
  private static final List<String> SUPPORTED_SETUPS = List.of(
    "Bias + OB/FVG + Session",
    "CHoCH + FVG + OTE",
    "PD Array (Discount)",
    "PD Array (Premium)",
    "Sweep + Shift",
    "Trend Pullback",
    "Kill Zone Liquidity Entry",
    "Asia Sweep Reversal",
    "Silver Bullet",
    "Turtle Soup",
    "Engulfing Shift",
    "Pullback Reentry"
  );
  private static final DateTimeFormatter DAY_KEY_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;

  private final TradeJournalService tradeJournalService;

  public SignalAnalysisService(TradeJournalService tradeJournalService) {
    this.tradeJournalService = tradeJournalService;
  }

  public SignalAnalysisResponse analyze(SignalAnalysisRequest request) {
    List<CandleBar> candles = request.candles()
      .stream()
      .filter(Objects::nonNull)
      .map(this::toCandleBar)
      .sorted(Comparator.comparingLong(CandleBar::t))
      .toList();

    if (candles.isEmpty()) {
      return new SignalAnalysisResponse(
        new SignalBiasResponse("Neutral", "No candles available"),
        List.of(),
        List.of(),
        List.of(),
        List.of(),
        List.of(),
        List.of(),
        List.of(),
        List.of(),
        null,
        null,
        emptyModel2022Payload(),
        ENGINE_VERSION,
        SUPPORTED_SETUPS
      );
    }

    BiasState baseBias = computeBias(candles);
    List<SwingPoint> swings = detectSwings(candles, 2);
    List<GapZone> gaps = detectFvg(candles);
    List<OrderBlockZone> orderBlocks = detectOrderBlocks(candles, 5);
    List<StructureShiftPoint> structureShifts = detectStructureShifts(candles, swings, 0d);
    List<LiquiditySweepPoint> sweeps = detectLiquiditySweeps(candles, 0.0005, 3);
    List<EqualLiquidityLevelData> equalHighsLows = detectEqualHighsLows(candles, 0.0005);
    List<BreakerBlockData> breakerBlocks = detectBreakerBlocks(orderBlocks, candles);
    HtfLevelsData htfLevels = computeHtfLevels(candles);
    Map<String, TradePerformanceSetupResponse> optimizationWeights =
      Boolean.FALSE.equals(request.optimizerEnabled())
        ? Map.of()
        : tradeJournalService.getPerformance(request.symbol(), request.timeframe(), null).setups();
    Model2022Data model2022 = buildModel2022State(candles, swings, gaps, orderBlocks, baseBias, structureShifts);

    List<SignalAnalysisSignalResponse> signals = detectSignals(
      candles,
      baseBias,
      gaps,
      orderBlocks,
      swings,
      structureShifts,
      sweeps,
      htfLevels,
      optimizationWeights,
      request.signalLimit()
    ).stream().map(this::toSignalResponse).toList();

    return new SignalAnalysisResponse(
      new SignalBiasResponse(baseBias.label(), baseBias.reason()),
      signals,
      swings.stream().map(this::toSwingPayload).toList(),
      gaps.stream().map(this::toGapPayload).toList(),
      orderBlocks.stream().map(this::toOrderBlockPayload).toList(),
      structureShifts.stream().map(this::toStructureShiftPayload).toList(),
      sweeps.stream().map(this::toLiquiditySweepPayload).toList(),
      equalHighsLows.stream().map(this::toEqualLiquidityLevelPayload).toList(),
      breakerBlocks.stream().map(this::toBreakerBlockPayload).toList(),
      toPremiumDiscountRangePayload(computePremiumDiscountRange(candles)),
      toHtfLevelsPayload(htfLevels),
      toModel2022Payload(model2022),
      ENGINE_VERSION,
      SUPPORTED_SETUPS
    );
  }

  private CandleBar toCandleBar(SignalAnalysisCandleRequest candle) {
    return new CandleBar(candle.t(), candle.o(), candle.h(), candle.l(), candle.c(), candle.v());
  }

  private SignalAnalysisSignalResponse toSignalResponse(GeneratedSignal signal) {
    return new SignalAnalysisSignalResponse(
      signal.time,
      signal.price,
      signal.direction,
      signal.basis,
      signal.setup,
      signal.stop,
      signal.tp1,
      signal.tp2,
      signal.tp3,
      signal.tp4,
      signal.sizeMultiplier,
      signal.session,
      signal.bias
    );
  }

  private SignalAnalysisResponse.SwingPayload toSwingPayload(SwingPoint swing) {
    return new SignalAnalysisResponse.SwingPayload(
      swing.index,
      swing.time,
      swing.price,
      swing.type
    );
  }

  private SignalAnalysisResponse.GapPayload toGapPayload(GapZone gap) {
    return new SignalAnalysisResponse.GapPayload(
      gap.startTime,
      gap.endTime,
      gap.top,
      gap.bottom,
      gap.type
    );
  }

  private SignalAnalysisResponse.OrderBlockPayload toOrderBlockPayload(OrderBlockZone block) {
    return new SignalAnalysisResponse.OrderBlockPayload(
      block.startTime,
      block.endTime,
      block.high,
      block.low,
      block.type
    );
  }

  private SignalAnalysisResponse.StructureShiftPayload toStructureShiftPayload(StructureShiftPoint shift) {
    return new SignalAnalysisResponse.StructureShiftPayload(
      shift.time,
      shift.price,
      shift.direction,
      shift.label
    );
  }

  private SignalAnalysisResponse.LiquiditySweepPayload toLiquiditySweepPayload(LiquiditySweepPoint sweep) {
    return new SignalAnalysisResponse.LiquiditySweepPayload(
      sweep.time,
      sweep.price,
      sweep.type,
      sweep.direction
    );
  }

  private SignalAnalysisResponse.EqualLiquidityLevelPayload toEqualLiquidityLevelPayload(EqualLiquidityLevelData level) {
    return new SignalAnalysisResponse.EqualLiquidityLevelPayload(
      level.price,
      level.times,
      level.kind
    );
  }

  private SignalAnalysisResponse.BreakerBlockPayload toBreakerBlockPayload(BreakerBlockData breaker) {
    return new SignalAnalysisResponse.BreakerBlockPayload(
      breaker.startTime,
      breaker.endTime,
      breaker.high,
      breaker.low,
      breaker.type,
      breaker.sourceObType,
      breaker.grade
    );
  }

  private SignalAnalysisResponse.PremiumDiscountRangePayload toPremiumDiscountRangePayload(PremiumDiscountRangeData range) {
    if (range == null) {
      return null;
    }
    return new SignalAnalysisResponse.PremiumDiscountRangePayload(range.high, range.low, range.equilibrium);
  }

  private SignalAnalysisResponse.HtfLevelsPayload toHtfLevelsPayload(HtfLevelsData levels) {
    if (levels == null) {
      return null;
    }
    return new SignalAnalysisResponse.HtfLevelsPayload(
      levels.prevDayHigh,
      levels.prevDayLow,
      levels.prevWeekHigh,
      levels.prevWeekLow,
      levels.weekOpen,
      levels.monthOpen
    );
  }

  private SignalAnalysisResponse.Model2022Payload toModel2022Payload(Model2022Data model2022) {
    return new SignalAnalysisResponse.Model2022Payload(
      model2022.strongSwings.stream().map(this::toStrongWeakSwingPayload).toList(),
      model2022.obWithDisplacement.stream().map(this::toOrderBlockPayload).toList(),
      toDailyCandlePayload(model2022.dailyCandle),
      toDailyLiquidityPayload(model2022.dailyLiquidity),
      model2022.m15Signals.stream().map(this::toModel2022SignalPayload).toList()
    );
  }

  private SignalAnalysisResponse.StrongWeakSwingPayload toStrongWeakSwingPayload(StrongWeakSwingData swing) {
    return new SignalAnalysisResponse.StrongWeakSwingPayload(
      swing.index,
      swing.time,
      swing.price,
      swing.type,
      swing.strength
    );
  }

  private SignalAnalysisResponse.DailyCandlePayload toDailyCandlePayload(DailyCandleData candle) {
    if (candle == null) {
      return null;
    }
    return new SignalAnalysisResponse.DailyCandlePayload(
      candle.date,
      candle.open,
      candle.high,
      candle.low,
      candle.close
    );
  }

  private SignalAnalysisResponse.DailyLiquidityPayload toDailyLiquidityPayload(DailyLiquidityData dailyLiquidity) {
    if (dailyLiquidity == null) {
      return new SignalAnalysisResponse.DailyLiquidityPayload(null, null, List.of(), List.of(), null);
    }
    return new SignalAnalysisResponse.DailyLiquidityPayload(
      dailyLiquidity.pdh,
      dailyLiquidity.pdl,
      dailyLiquidity.last3Highs.stream().map(level -> new SignalAnalysisResponse.DailyLevelPayload(level.price, level.date)).toList(),
      dailyLiquidity.last3Lows.stream().map(level -> new SignalAnalysisResponse.DailyLevelPayload(level.price, level.date)).toList(),
      dailyLiquidity.midnightOpen
    );
  }

  private SignalAnalysisResponse.Model2022SignalPayload toModel2022SignalPayload(Model2022SignalData signal) {
    return new SignalAnalysisResponse.Model2022SignalPayload(
      signal.time,
      signal.direction,
      signal.label,
      toGapPayload(signal.fvg),
      signal.entry,
      signal.stop,
      signal.basis
    );
  }

  private SignalAnalysisResponse.Model2022Payload emptyModel2022Payload() {
    return new SignalAnalysisResponse.Model2022Payload(
      List.of(),
      List.of(),
      null,
      new SignalAnalysisResponse.DailyLiquidityPayload(null, null, List.of(), List.of(), null),
      List.of()
    );
  }

  private BiasState computeBias(List<CandleBar> candles) {
    if (candles.size() < 5) {
      return new BiasState("Neutral", "Not enough data to compute bias");
    }

    Map<String, List<CandleBar>> grouped = groupByDay(candles);
    List<String> days = new ArrayList<>(grouped.keySet());
    days.sort(String::compareTo);
    if (days.size() < 2) {
      return new BiasState("Neutral", "Waiting for at least two sessions");
    }

    String currentDayKey = days.get(days.size() - 1);
    String prevDayKey = days.get(days.size() - 2);
    CandleBar latest = candles.get(candles.size() - 1);
    List<CandleBar> currentDay = grouped.getOrDefault(currentDayKey, List.of())
      .stream()
      .filter(c -> c.t <= latest.t)
      .toList();
    List<CandleBar> prevDay = grouped.getOrDefault(prevDayKey, List.of());

    if (currentDay.isEmpty() || prevDay.isEmpty()) {
      return new BiasState("Neutral", "Incomplete session data");
    }

    DayStats prevStats = dayStats(prevDay);
    double currentOpen = currentDay.get(0).o;
    double currentClose = currentDay.get(currentDay.size() - 1).c;
    double currentHigh = currentDay.stream().mapToDouble(CandleBar::h).max().orElse(currentClose);
    double currentLow = currentDay.stream().mapToDouble(CandleBar::l).min().orElse(currentClose);
    boolean tookHigh = currentHigh >= prevStats.high();
    boolean tookLow = currentLow <= prevStats.low();
    boolean aboveOpen = currentClose > currentOpen;
    boolean abovePrevClose = currentClose > prevStats.close();

    if (aboveOpen && abovePrevClose && tookHigh) {
      return new BiasState("Bullish", "Above daily open/prev close and swept prior high");
    }
    if (!aboveOpen && !abovePrevClose && tookLow) {
      return new BiasState("Bearish", "Below daily open/prev close and swept prior low");
    }

    BiasState trendFallback = computeTrendBias(candles);
    if (trendFallback != null) {
      return trendFallback;
    }

    return new BiasState("Neutral", "Inside previous range or mixed signals");
  }

  private BiasState computeTrendBias(List<CandleBar> candles) {
    if (candles.size() < 40) {
      return null;
    }

    double[] closes = candles.stream().mapToDouble(CandleBar::c).toArray();
    double shortAvg = average(Arrays.copyOfRange(closes, Math.max(0, closes.length - 40), closes.length));
    double longAvg = average(Arrays.copyOfRange(closes, Math.max(0, closes.length - 160), closes.length));
    if (!Double.isFinite(shortAvg) || !Double.isFinite(longAvg)) {
      return null;
    }
    if (shortAvg > longAvg * 1.0005) {
      return new BiasState("Bullish", "Fallback trend bias (short avg above long avg)");
    }
    if (shortAvg < longAvg * 0.9995) {
      return new BiasState("Bearish", "Fallback trend bias (short avg below long avg)");
    }
    return null;
  }

  private List<SwingPoint> detectSwings(List<CandleBar> candles, int lookback) {
    List<SwingPoint> swings = new ArrayList<>();
    for (int i = lookback; i < candles.size() - lookback; i++) {
      CandleBar center = candles.get(i);
      double maxHigh = Double.NEGATIVE_INFINITY;
      double minLow = Double.POSITIVE_INFINITY;
      for (int j = i - lookback; j <= i + lookback; j++) {
        maxHigh = Math.max(maxHigh, candles.get(j).h);
        minLow = Math.min(minLow, candles.get(j).l);
      }
      if (center.h == maxHigh) {
        swings.add(new SwingPoint(i, center.t, center.h, "high"));
      }
      if (center.l == minLow) {
        swings.add(new SwingPoint(i, center.t, center.l, "low"));
      }
    }
    return swings;
  }

  private List<GapZone> detectFvg(List<CandleBar> candles) {
    List<GapZone> gaps = new ArrayList<>();
    for (int i = 1; i < candles.size() - 1; i++) {
      CandleBar a = candles.get(i - 1);
      CandleBar b = candles.get(i);
      CandleBar c = candles.get(i + 1);
      boolean bullishGap = a.h < c.l && b.c > b.o;
      boolean bearishGap = a.l > c.h && b.c < b.o;
      if (bullishGap) {
        gaps.add(new GapZone(a.t, c.t, a.h, c.l, "bullish"));
      }
      if (bearishGap) {
        gaps.add(new GapZone(a.t, c.t, c.h, a.l, "bearish"));
      }
    }
    return gaps;
  }

  private List<OrderBlockZone> detectOrderBlocks(List<CandleBar> candles, int window) {
    List<OrderBlockZone> blocks = new ArrayList<>();
    for (int i = 1; i < candles.size() - 1; i++) {
      CandleBar current = candles.get(i);
      CandleBar next = candles.get(i + 1);
      double prevHigh = Double.NEGATIVE_INFINITY;
      double prevLow = Double.POSITIVE_INFINITY;
      for (int j = Math.max(0, i - window); j < i; j++) {
        prevHigh = Math.max(prevHigh, candles.get(j).h);
        prevLow = Math.min(prevLow, candles.get(j).l);
      }
      boolean bullishOb = current.c < current.o && next.h > prevHigh;
      boolean bearishOb = current.c > current.o && next.l < prevLow;
      if (bullishOb) {
        blocks.add(new OrderBlockZone(current.t, next.t, current.h, current.l, "bullish"));
      }
      if (bearishOb) {
        blocks.add(new OrderBlockZone(current.t, next.t, current.h, current.l, "bearish"));
      }
    }
    return dedupeBlocks(blocks);
  }

  private List<StructureShiftPoint> detectStructureShifts(
    List<CandleBar> candles,
    List<SwingPoint> swings,
    double displacementAtr
  ) {
    if (candles.isEmpty() || swings.size() < 2) {
      return List.of();
    }

    List<StructureShiftPoint> shifts = new ArrayList<>();
    List<SwingPoint> sortedSwings = swings.stream()
      .sorted(Comparator.comparingLong(SwingPoint::time))
      .toList();
    List<SwingPoint> highSwings = sortedSwings.stream().filter(s -> "high".equals(s.type)).toList();
    List<SwingPoint> lowSwings = sortedSwings.stream().filter(s -> "low".equals(s.type)).toList();
    int highIndex = -1;
    int lowIndex = -1;
    String state = null;
    int lastShiftBar = Integer.MIN_VALUE;
    int minSwingDistance = 1;
    int minSpacingBars = 3;
    double minBreakPct = 0.00008;

    for (int bar = 0; bar < candles.size(); bar++) {
      CandleBar candle = candles.get(bar);
      while (highIndex + 1 < highSwings.size() && highSwings.get(highIndex + 1).time <= candle.t) {
        highIndex++;
      }
      while (lowIndex + 1 < lowSwings.size() && lowSwings.get(lowIndex + 1).time <= candle.t) {
        lowIndex++;
      }

      SwingPoint activeHigh = highIndex >= 0 ? highSwings.get(highIndex) : null;
      SwingPoint activeLow = lowIndex >= 0 ? lowSwings.get(lowIndex) : null;
      boolean highSpacingOk = activeHigh == null || bar - activeHigh.index >= minSwingDistance;
      boolean lowSpacingOk = activeLow == null || bar - activeLow.index >= minSwingDistance;
      boolean brokeHigh = activeHigh != null && highSpacingOk && hasDisplacement(candle, activeHigh.price, "up", displacementAtr, minBreakPct);
      boolean brokeLow = activeLow != null && lowSpacingOk && hasDisplacement(candle, activeLow.price, "down", displacementAtr, minBreakPct);

      if (brokeHigh && !"bullish".equals(state) && activeHigh != null) {
        if (isWithinBarSpacing(bar, lastShiftBar, minSpacingBars)) {
          continue;
        }
        shifts.add(new StructureShiftPoint(
          candle.t,
          activeHigh.price,
          "bullish",
          "bearish".equals(state) ? "CHoCH" : "BOS"
        ));
        state = "bullish";
        lastShiftBar = bar;
      } else if (brokeLow && !"bearish".equals(state) && activeLow != null) {
        if (isWithinBarSpacing(bar, lastShiftBar, minSpacingBars)) {
          continue;
        }
        shifts.add(new StructureShiftPoint(
          candle.t,
          activeLow.price,
          "bearish",
          "bullish".equals(state) ? "CHoCH" : "BOS"
        ));
        state = "bearish";
        lastShiftBar = bar;
      }
    }

    return tail(shifts, 30);
  }

  private boolean hasDisplacement(
    CandleBar candle,
    double level,
    String direction,
    double displacementAtr,
    double minBreakPct
  ) {
    double range = candle.h - candle.l;
    if (range == 0) {
      range = Math.abs(candle.c - candle.o);
    }
    if (range == 0) {
      range = 1;
    }

    double atrThreshold = displacementAtr > 0 ? displacementAtr * 0.4 : range * 0.35;
    double buffer = Math.max(level * minBreakPct, atrThreshold * 0.1);
    if ("up".equals(direction)) {
      return candle.h > level + buffer && candle.c > level + atrThreshold * 0.25;
    }
    return candle.l < level - buffer && candle.c < level - atrThreshold * 0.25;
  }

  private List<LiquiditySweepPoint> detectLiquiditySweeps(
    List<CandleBar> candles,
    double tolerancePct,
    int minSpacingBars
  ) {
    List<LiquiditySweepPoint> sweeps = new ArrayList<>();
    if (candles.size() < 3) {
      return sweeps;
    }

    List<LevelPoint> highLevels = new ArrayList<>();
    List<LevelPoint> lowLevels = new ArrayList<>();
    int lastHighSweepIndex = Integer.MIN_VALUE;
    int lastLowSweepIndex = Integer.MIN_VALUE;
    double lastHighSweepPrice = Double.NaN;
    double lastLowSweepPrice = Double.NaN;

    for (int i = 1; i < candles.size(); i++) {
      CandleBar prev = candles.get(i - 1);
      CandleBar current = candles.get(i);
      double tolHigh = prev.h * tolerancePct;
      double tolLow = prev.l * tolerancePct;
      if (Math.abs(current.h - prev.h) <= tolHigh) {
        highLevels.add(new LevelPoint((current.h + prev.h) / 2, current.t));
      }
      if (Math.abs(current.l - prev.l) <= tolLow) {
        lowLevels.add(new LevelPoint((current.l + prev.l) / 2, current.t));
      }
    }

    for (int i = 1; i < candles.size(); i++) {
      CandleBar candle = candles.get(i);
      LevelPoint sweptHigh = highLevels.stream().filter(l -> candle.h > l.price && candle.t > l.time).findFirst().orElse(null);
      if (
        sweptHigh != null &&
        hasRequiredBarSpacing(i, lastHighSweepIndex, minSpacingBars) &&
        (Double.isNaN(lastHighSweepPrice) || Math.abs(sweptHigh.price - lastHighSweepPrice) > sweptHigh.price * tolerancePct)
      ) {
        sweeps.add(new LiquiditySweepPoint(candle.t, sweptHigh.price, "eqh", "up"));
        lastHighSweepIndex = i;
        lastHighSweepPrice = sweptHigh.price;
      }
      LevelPoint sweptLow = lowLevels.stream().filter(l -> candle.l < l.price && candle.t > l.time).findFirst().orElse(null);
      if (
        sweptLow != null &&
        hasRequiredBarSpacing(i, lastLowSweepIndex, minSpacingBars) &&
        (Double.isNaN(lastLowSweepPrice) || Math.abs(sweptLow.price - lastLowSweepPrice) > sweptLow.price * tolerancePct)
      ) {
        sweeps.add(new LiquiditySweepPoint(candle.t, sweptLow.price, "eql", "down"));
        lastLowSweepIndex = i;
        lastLowSweepPrice = sweptLow.price;
      }
    }

    return tail(sweeps, 20);
  }

  private HtfLevelsData computeHtfLevels(List<CandleBar> candles) {
    if (candles.isEmpty()) {
      return new HtfLevelsData(null, null, null, null, null, null);
    }

    Map<String, List<CandleBar>> byDay = groupByDay(candles);
    List<String> dayKeys = new ArrayList<>(byDay.keySet());
    dayKeys.sort(String::compareTo);
    String prevDayKey = dayKeys.size() >= 2 ? dayKeys.get(dayKeys.size() - 2) : null;
    List<CandleBar> prevDay = prevDayKey != null ? byDay.getOrDefault(prevDayKey, List.of()) : List.of();

    Map<String, List<CandleBar>> byWeek = new HashMap<>();
    for (CandleBar candle : candles) {
      String weekKey = weekKey(candle.t);
      byWeek.computeIfAbsent(weekKey, ignored -> new ArrayList<>()).add(candle);
    }
    List<String> weekKeys = new ArrayList<>(byWeek.keySet());
    weekKeys.sort(String::compareTo);
    String prevWeekKey = weekKeys.size() >= 2 ? weekKeys.get(weekKeys.size() - 2) : null;
    List<CandleBar> prevWeek = prevWeekKey != null ? byWeek.getOrDefault(prevWeekKey, List.of()) : List.of();

    Double weekOpen = weekKeys.isEmpty() ? null : byWeek.get(weekKeys.get(weekKeys.size() - 1)).get(0).o;
    Double monthOpen = candles.get(0).o;
    for (CandleBar candle : candles) {
      ZonedDateTime dateTime = utc(candle.t);
      if (dateTime.getDayOfMonth() == 1 && dateTime.getHour() == 0) {
        monthOpen = candle.o;
        break;
      }
    }

    return new HtfLevelsData(
      prevDay.isEmpty() ? null : prevDay.stream().mapToDouble(CandleBar::h).max().orElseThrow(),
      prevDay.isEmpty() ? null : prevDay.stream().mapToDouble(CandleBar::l).min().orElseThrow(),
      prevWeek.isEmpty() ? null : prevWeek.stream().mapToDouble(CandleBar::h).max().orElseThrow(),
      prevWeek.isEmpty() ? null : prevWeek.stream().mapToDouble(CandleBar::l).min().orElseThrow(),
      weekOpen,
      monthOpen
    );
  }

  private List<EqualLiquidityLevelData> detectEqualHighsLows(List<CandleBar> candles, double tolerancePct) {
    List<EqualLiquidityLevelData> levels = new ArrayList<>();
    if (candles.size() < 2) {
      return levels;
    }
    for (int i = 1; i < candles.size(); i++) {
      CandleBar prev = candles.get(i - 1);
      CandleBar current = candles.get(i);
      double highTolerance = prev.h * tolerancePct;
      double lowTolerance = prev.l * tolerancePct;
      if (Math.abs(current.h - prev.h) <= highTolerance) {
        levels.add(new EqualLiquidityLevelData((current.h + prev.h) / 2, List.of(prev.t, current.t), "highs"));
      }
      if (Math.abs(current.l - prev.l) <= lowTolerance) {
        levels.add(new EqualLiquidityLevelData((current.l + prev.l) / 2, List.of(prev.t, current.t), "lows"));
      }
    }
    return tail(levels, 20);
  }

  private List<BreakerBlockData> detectBreakerBlocks(List<OrderBlockZone> orderBlocks, List<CandleBar> candles) {
    List<BreakerBlockData> breakers = new ArrayList<>();
    if (orderBlocks.isEmpty() || candles.isEmpty()) {
      return breakers;
    }

    for (OrderBlockZone orderBlock : orderBlocks) {
      CandleBar violatingCandle = candles.stream()
        .filter(candle -> {
          if (candle.t <= orderBlock.endTime) {
            return false;
          }
          if ("bullish".equals(orderBlock.type)) {
            return candle.c < orderBlock.low;
          }
          return candle.c > orderBlock.high;
        })
        .findFirst()
        .orElse(null);
      if (violatingCandle == null) {
        continue;
      }

      String breakerType = "bullish".equals(orderBlock.type) ? "bearish" : "bullish";
      double displacement =
        "bullish".equals(orderBlock.type)
          ? (orderBlock.low - violatingCandle.c) / Math.max(1e-9, violatingCandle.h - violatingCandle.l)
          : (violatingCandle.c - orderBlock.high) / Math.max(1e-9, violatingCandle.h - violatingCandle.l);
      String grade = displacement > 1 ? "strong" : displacement > 0.5 ? "medium" : "weak";
      breakers.add(new BreakerBlockData(
        orderBlock.startTime,
        violatingCandle.t,
        orderBlock.high,
        orderBlock.low,
        breakerType,
        orderBlock.type,
        grade
      ));
    }

    return tail(breakers, 10);
  }

  private Model2022Data buildModel2022State(
    List<CandleBar> candles,
    List<SwingPoint> swings,
    List<GapZone> gaps,
    List<OrderBlockZone> orderBlocks,
    BiasState bias,
    List<StructureShiftPoint> structureShifts
  ) {
    return new Model2022Data(
      deriveStrongWeakSwings(swings, bias, structureShifts),
      filterOrderBlocksWithFvg(orderBlocks, gaps, candles),
      computeDailyCandle(candles),
      computeDailyLiquidity(candles),
      detectModel2022Signals(candles)
    );
  }

  private List<StrongWeakSwingData> deriveStrongWeakSwings(
    List<SwingPoint> swings,
    BiasState bias,
    List<StructureShiftPoint> structureShifts
  ) {
    String latestShiftDirection = structureShifts.isEmpty() ? null : structureShifts.get(structureShifts.size() - 1).direction;
    String biasDirection =
      "Bullish".equals(bias.label) ? "bullish" : "Bearish".equals(bias.label) ? "bearish" : null;
    String direction = latestShiftDirection != null ? latestShiftDirection : biasDirection;

    return swings.stream().map(swing -> new StrongWeakSwingData(
      swing.index,
      swing.time,
      swing.price,
      swing.type,
      direction == null
        ? "weak"
        : "bullish".equals(direction)
          ? ("low".equals(swing.type) ? "strong" : "weak")
          : ("high".equals(swing.type) ? "strong" : "weak")
    )).toList();
  }

  private List<OrderBlockZone> filterOrderBlocksWithFvg(
    List<OrderBlockZone> orderBlocks,
    List<GapZone> gaps,
    List<CandleBar> candles
  ) {
    if (orderBlocks.isEmpty() || gaps.isEmpty()) {
      return List.of();
    }
    Long frameMs = inferTimeframeMs(candles);
    long lookahead = frameMs != null ? frameMs * 6 : 6L * 60 * 60 * 1000;
    return orderBlocks.stream()
      .filter(orderBlock -> gaps.stream().anyMatch(gap ->
        gap.type.equals(orderBlock.type) &&
          gap.startTime >= orderBlock.endTime &&
          gap.startTime <= orderBlock.endTime + lookahead
      ))
      .toList();
  }

  private DailyCandleData computeDailyCandle(List<CandleBar> candles) {
    if (candles.isEmpty()) {
      return null;
    }
    Map<String, List<CandleBar>> byDay = groupByDay(candles);
    List<String> keys = new ArrayList<>(byDay.keySet());
    keys.sort(String::compareTo);
    String latestKey = keys.isEmpty() ? null : keys.get(keys.size() - 1);
    if (latestKey == null) {
      return null;
    }
    List<CandleBar> day = byDay.getOrDefault(latestKey, List.of());
    if (day.isEmpty()) {
      return null;
    }
    return new DailyCandleData(
      latestKey,
      day.get(0).o,
      day.stream().mapToDouble(CandleBar::h).max().orElseThrow(),
      day.stream().mapToDouble(CandleBar::l).min().orElseThrow(),
      day.get(day.size() - 1).c
    );
  }

  private DailyLiquidityData computeDailyLiquidity(List<CandleBar> candles) {
    Map<String, List<CandleBar>> byDay = groupByDay(candles);
    List<String> keys = new ArrayList<>(byDay.keySet());
    keys.sort(String::compareTo);
    String latestKey = keys.isEmpty() ? null : keys.get(keys.size() - 1);
    String prevKey = keys.size() >= 2 ? keys.get(keys.size() - 2) : null;
    List<CandleBar> prevDay = prevKey != null ? byDay.getOrDefault(prevKey, List.of()) : List.of();
    Double pdh = prevDay.isEmpty() ? null : prevDay.stream().mapToDouble(CandleBar::h).max().orElseThrow();
    Double pdl = prevDay.isEmpty() ? null : prevDay.stream().mapToDouble(CandleBar::l).min().orElseThrow();
    List<String> historyKeys = keys.stream().filter(key -> !Objects.equals(key, latestKey)).skip(Math.max(0, keys.size() - 4L)).toList();
    List<DailyLevelData> last3Highs = new ArrayList<>();
    List<DailyLevelData> last3Lows = new ArrayList<>();
    for (String key : historyKeys) {
      List<CandleBar> day = byDay.getOrDefault(key, List.of());
      if (day.isEmpty()) {
        continue;
      }
      last3Highs.add(new DailyLevelData(day.stream().mapToDouble(CandleBar::h).max().orElseThrow(), key));
      last3Lows.add(new DailyLevelData(day.stream().mapToDouble(CandleBar::l).min().orElseThrow(), key));
    }
    Double midnightOpen = latestKey != null && !byDay.getOrDefault(latestKey, List.of()).isEmpty()
      ? byDay.get(latestKey).get(0).o
      : null;
    return new DailyLiquidityData(pdh, pdl, tail(last3Highs, 3), tail(last3Lows, 3), midnightOpen);
  }

  private List<Model2022SignalData> detectModel2022Signals(List<CandleBar> candles) {
    if (candles.size() < 10) {
      return List.of();
    }
    Long frameMs = inferTimeframeMs(candles);
    if (frameMs == null || frameMs > (15L * 60 * 1000) * 1.1) {
      return List.of();
    }

    List<CandleBar> m15 = aggregateCandles(candles, 15L * 60 * 1000);
    if (m15.size() < 20) {
      return List.of();
    }

    List<SwingPoint> swings15 = detectSwings(m15, 2);
    List<StructureShiftPoint> shifts15 = detectStructureShifts(m15, swings15, 0d);
    List<GapZone> gaps15 = detectFvg(m15);
    List<LiquiditySweepPoint> sweeps15 = detectLiquiditySweeps(m15, 0.0005, 3);
    double[] atr15 = computeAtr(m15, 14);
    List<Model2022SignalData> signals = new ArrayList<>();

    for (GapZone gap : gaps15) {
      boolean bullish = "bullish".equals(gap.type);
      LiquiditySweepPoint sweep = findLast(sweeps15, item ->
        item.time <= gap.startTime && Objects.equals(item.direction, bullish ? "down" : "up")
      );
      if (sweep == null) {
        continue;
      }
      StructureShiftPoint shift = findLast(shifts15, item -> item.time <= gap.endTime);
      if (shift == null || !Objects.equals(shift.direction, bullish ? "bullish" : "bearish")) {
        continue;
      }
      int index = -1;
      for (int i = 0; i < m15.size(); i++) {
        if (m15.get(i).t >= gap.startTime) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        continue;
      }
      CandleBar candle = m15.get(index);
      double atrValue = atr15[index];
      double body = Math.abs(candle.c - candle.o);
      if (atrValue > 0 && body < atrValue * 0.7) {
        continue;
      }
      Integer nyHour = getHourInTz(candle.t, "America/New_York");
      boolean withinKill = nyHour != null && nyHour >= 7 && nyHour < 10;
      double entry = bullish ? Math.min(gap.top, gap.bottom) : Math.max(gap.top, gap.bottom);
      double stop = bullish ? Math.max(gap.top, gap.bottom) : Math.min(gap.top, gap.bottom);
      List<String> basis = new ArrayList<>();
      basis.add(bullish ? "Liquidity grab of lows" : "Liquidity grab of highs");
      basis.add(shift.label + " with displacement");
      basis.add("15m FVG formed");
      if (withinKill) {
        basis.add("NY Kill Zone 07:00-10:00");
      }
      signals.add(new Model2022SignalData(
        gap.startTime,
        bullish ? "buy" : "sell",
        bullish ? "BUY SETUP" : "SELL SETUP",
        gap,
        entry,
        stop,
        basis
      ));
    }

    return tail(signals, 8);
  }

  private Long inferTimeframeMs(List<CandleBar> candles) {
    if (candles.size() < 2) {
      return null;
    }
    List<Long> diffs = new ArrayList<>();
    for (int i = candles.size() - 1; i > 0 && diffs.size() < 80; i--) {
      long delta = candles.get(i).t - candles.get(i - 1).t;
      if (delta > 0) {
        diffs.add(delta);
      }
    }
    if (diffs.isEmpty()) {
      return null;
    }
    long sum = 0;
    for (Long diff : diffs) {
      sum += diff;
    }
    return Math.round((double) sum / diffs.size());
  }

  private List<CandleBar> aggregateCandles(List<CandleBar> candles, long intervalMs) {
    if (candles.isEmpty()) {
      return List.of();
    }
    Map<Long, CandleBar> buckets = new LinkedHashMap<>();
    for (CandleBar candle : candles) {
      long bucketKey = (candle.t / intervalMs) * intervalMs;
      CandleBar bucket = buckets.get(bucketKey);
      if (bucket == null) {
        buckets.put(bucketKey, new CandleBar(bucketKey, candle.o, candle.h, candle.l, candle.c, candle.v));
      } else {
        buckets.put(bucketKey, new CandleBar(
          bucket.t,
          bucket.o,
          Math.max(bucket.h, candle.h),
          Math.min(bucket.l, candle.l),
          candle.c,
          bucket.v + candle.v
        ));
      }
    }
    return buckets.values().stream().sorted(Comparator.comparingLong(CandleBar::t)).toList();
  }

  private Integer getHourInTz(long epochMs, String timeZone) {
    try {
      return Instant.ofEpochMilli(epochMs).atZone(ZoneId.of(timeZone)).getHour();
    } catch (Exception ignored) {
      return null;
    }
  }

  private boolean isWithinNewYorkSilverBulletWindow(long epochMs, SessionZone session) {
    if (session == null || !session.label.contains("New York")) {
      return false;
    }
    return SignalSetupRules.isWithinNewYorkSilverBulletWindow(getHourInTz(epochMs, "America/New_York"));
  }

  private List<GeneratedSignal> detectSignals(
    List<CandleBar> candles,
    BiasState baseBias,
    List<GapZone> gaps,
    List<OrderBlockZone> orderBlocks,
    List<SwingPoint> swings,
    List<StructureShiftPoint> structureShifts,
    List<LiquiditySweepPoint> sweeps,
    HtfLevelsData htfLevels,
    Map<String, TradePerformanceSetupResponse> optimizationWeights,
    Integer signalLimit
  ) {
    List<GeneratedSignal> signals = new ArrayList<>();
    if (candles.size() < 2) {
      return signals;
    }

    final double minRMultiple = 1.25;
    final int setupCooldown = 5;
    final int pullbackReentryCooldown = 10;
    final int globalCooldown = 2;
    final int maxSignalsPerBar = 1;
    final int maxTradesPerDay = 12;
    final int recentShiftContextBars = 3;
    final int recentChochContextBars = 2;
    final int recentSweepContextBars = 4;

    double[] atrValues = computeAtr(candles, 14);
    double[] closes = candles.stream().mapToDouble(CandleBar::c).toArray();
    Double[] emaFast = computeEma(closes, 34);
    Double[] emaSlow = computeEma(closes, 89);
    Map<String, List<CandleBar>> byDay = groupByDay(candles);
    List<String> dayKeys = new ArrayList<>(byDay.keySet());
    dayKeys.sort(String::compareTo);
    Map<String, Integer> dayIndexMap = new HashMap<>();
    for (int i = 0; i < dayKeys.size(); i++) {
      dayIndexMap.put(dayKeys.get(i), i);
    }

    Map<String, Integer> lastSignalIndex = new HashMap<>();
    Map<Integer, Integer> signalsPerBar = new HashMap<>();
    Map<String, Integer> signalsPerDay = new HashMap<>();
    int lastSignalBar = Integer.MIN_VALUE;
    AsiaRangeState asiaRange = null;
    PremiumDiscountRangeData weeklyPdRange = getWeeklyPdRange(htfLevels);

    for (int i = 1; i < candles.size(); i++) {
      CandleBar candle = candles.get(i);
      CandleBar prev = candles.get(i - 1);
      ZonedDateTime candleTime = utc(candle.t);
      String dayKey = DAY_KEY_FORMATTER.format(candleTime);
      SessionZone session = classifySession(candleTime).orElseGet(() -> fallbackSession(candleTime));
      if (session == null) {
        continue;
      }

      String candleDirection = candle.c >= candle.o ? "bullish" : "bearish";
      boolean bullishConfirm = "bullish".equals(candleDirection) && candle.c > candle.o && candle.c >= (candle.h + candle.l) / 2;
      boolean bearishConfirm = "bearish".equals(candleDirection) && candle.c < candle.o && candle.c <= (candle.h + candle.l) / 2;
      boolean isLondonOrNy = session.label.contains("London") || session.label.contains("New York");
      boolean killZone = isWithinKillZone(candleTime, session);
      boolean sessionWindowAllowed = candleTime.getHour() >= Math.max(0, session.startHour - 1) && candleTime.getHour() < Math.min(24, session.endHour + 1);
      boolean sessionAllowed = !isLondonOrNy || killZone || sessionWindowAllowed;

      if ("Asia".equals(session.label)) {
        if (asiaRange == null || !Objects.equals(asiaRange.dayKey, dayKey)) {
          asiaRange = new AsiaRangeState(dayKey, candle.h, candle.l);
        } else {
          asiaRange.high = Math.max(asiaRange.high, candle.h);
          asiaRange.low = Math.min(asiaRange.low, candle.l);
        }
      } else if (asiaRange != null && Objects.equals(asiaRange.dayKey, dayKey)) {
        asiaRange.active = true;
      }

      double currentAtr = atrValues[i];
      double proximity = Math.max(currentAtr, Math.abs(candle.c) * 0.0005);
      PremiumDiscountRangeData rollingPdRange = computePremiumDiscountRange(candles.subList(Math.max(0, i - 80), i + 1));
      boolean nearPrevDayLow = nearLevel(candle.c, htfLevels.prevDayLow, proximity);
      boolean nearPrevDayHigh = nearLevel(candle.c, htfLevels.prevDayHigh, proximity);
      boolean nearPrevWeekLow = nearLevel(candle.c, htfLevels.prevWeekLow, proximity);
      boolean nearPrevWeekHigh = nearLevel(candle.c, htfLevels.prevWeekHigh, proximity);
      boolean nearPdLow = rollingPdRange != null && Math.abs(candle.c - rollingPdRange.low) <= proximity;
      boolean nearPdHigh = rollingPdRange != null && Math.abs(candle.c - rollingPdRange.high) <= proximity;
      boolean nearWeeklyLow = weeklyPdRange != null && Math.abs(candle.c - weeklyPdRange.low) <= proximity * 1.5;
      boolean nearWeeklyHigh = weeklyPdRange != null && Math.abs(candle.c - weeklyPdRange.high) <= proximity * 1.5;
      boolean discount = rollingPdRange != null && candle.c <= rollingPdRange.equilibrium && candle.c >= rollingPdRange.low;
      boolean premium = rollingPdRange != null && candle.c >= rollingPdRange.equilibrium && candle.c <= rollingPdRange.high;
      boolean weeklyDiscount = weeklyPdRange != null && candle.c >= weeklyPdRange.low && candle.c <= weeklyPdRange.equilibrium;
      boolean weeklyPremium = weeklyPdRange != null && candle.c <= weeklyPdRange.high && candle.c >= weeklyPdRange.equilibrium;
      boolean discountContext = discount || weeklyDiscount;
      boolean premiumContext = premium || weeklyPremium;

      boolean institutionalBuyZone =
        discountContext ||
        (htfLevels.prevDayLow != null && candle.l <= htfLevels.prevDayLow * 1.0005) ||
        (htfLevels.prevWeekLow != null && candle.l <= htfLevels.prevWeekLow * 1.0005);
      boolean institutionalSellZone =
        premiumContext ||
        (htfLevels.prevDayHigh != null && candle.h >= htfLevels.prevDayHigh * 0.9995) ||
        (htfLevels.prevWeekHigh != null && candle.h >= htfLevels.prevWeekHigh * 0.9995);
      boolean htfBuyZone =
        discountContext ||
        nearPrevDayLow ||
        nearPrevWeekLow ||
        nearPdLow ||
        nearWeeklyLow ||
        (htfLevels.prevDayLow == null && htfLevels.prevWeekLow == null && rollingPdRange == null && weeklyPdRange == null);
      boolean htfSellZone =
        premiumContext ||
        nearPrevDayHigh ||
        nearPrevWeekHigh ||
        nearPdHigh ||
        nearWeeklyHigh ||
        (htfLevels.prevDayHigh == null && htfLevels.prevWeekHigh == null && rollingPdRange == null && weeklyPdRange == null);

      String biasLabel = baseBias.label;
      String momentumBias = computeMomentumBias(emaFast[i], emaSlow[i]);
      if ("Neutral".equals(biasLabel)) {
        biasLabel = momentumBias;
      }
      if ("Neutral".equals(biasLabel)) {
        if (institutionalBuyZone && !institutionalSellZone) {
          biasLabel = "Bullish";
        } else if (institutionalSellZone && !institutionalBuyZone) {
          biasLabel = "Bearish";
        }
      }

      StructureShiftPoint shiftNow = findLastStructureShift(structureShifts, candle.t);
      LiquiditySweepPoint lastSweep = findLastSweep(sweeps, candle.t);
      int shiftAgeBars = shiftNow != null ? barsSinceTime(candles, i, shiftNow.time) : Integer.MAX_VALUE;
      int sweepAgeBars = lastSweep != null ? barsSinceTime(candles, i, lastSweep.time) : Integer.MAX_VALUE;
      boolean shiftFollowsSweep = shiftNow != null && lastSweep != null && shiftNow.time >= lastSweep.time;
      boolean freshShiftContext = shiftNow != null && shiftAgeBars <= recentShiftContextBars;
      boolean freshChochContext =
        shiftNow != null && "CHoCH".equals(shiftNow.label) && shiftAgeBars <= recentChochContextBars;
      boolean freshSweepContext = lastSweep != null && sweepAgeBars <= recentSweepContextBars;
      boolean freshShiftAfterSweepContext = freshShiftContext && freshSweepContext && shiftFollowsSweep;
      boolean killZoneContext = killZone && isLondonOrNy;

      OrderBlockZone tappedBullBlock = findTappedOrderBlock(orderBlocks, candle, "bullish");
      OrderBlockZone tappedBearBlock = findTappedOrderBlock(orderBlocks, candle, "bearish");
      GapZone tappedBullGap = findTappedGap(gaps, candle, "bullish");
      GapZone tappedBearGap = findTappedGap(gaps, candle, "bearish");

      GeneratedSignal biasOrderBlockSignal = freshShiftContext
        ? buildBiasOrderBlockSessionSignal(
            candle,
            prev,
            swings,
            gaps,
            sessionAllowed,
            biasLabel,
            bullishConfirm,
            bearishConfirm,
            htfBuyZone,
            htfSellZone,
            session,
            shiftNow,
            tappedBullBlock,
            tappedBearBlock,
            tappedBullGap,
            tappedBearGap,
            proximity
          )
        : null;
      if (biasOrderBlockSignal != null) {
        pushSignal(
          signals,
          biasOrderBlockSignal,
          i,
          currentAtr,
          optimizationWeights,
          lastSignalIndex,
          signalsPerBar,
          signalsPerDay,
          dayKey,
          lastSignalBar,
          setupCooldown,
          globalCooldown,
          maxSignalsPerBar,
          maxTradesPerDay,
          minRMultiple
        );
        lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
      }

      if (sessionAllowed && freshChochContext) {
        PremiumDiscountRangeData oteRange = computePremiumDiscountRange(candles.subList(Math.max(0, i - 50), i + 1));
        if (oteRange != null) {
          double oteHigh = oteRange.high - (oteRange.high - oteRange.low) * 0.62;
          double oteLow = oteRange.high - (oteRange.high - oteRange.low) * 0.705;
          boolean inOte = betweenInclusive(candle.c, oteHigh, oteLow);
          SignalSetupRules.SignalSpec chochFvgOteSignal = SignalSetupRules.buildChochFvgOteSignal(
            new SignalSetupRules.ChochFvgOteInput(
              toCandleSnapshot(candle),
              sessionAllowed,
              biasLabel,
              bullishConfirm,
              bearishConfirm,
              htfBuyZone,
              htfSellZone,
              session.label,
              toShiftSnapshot(shiftNow),
              toGapSnapshot(tappedBullGap),
              toGapSnapshot(tappedBearGap),
              inOte,
              Optional.ofNullable(findRecentSwing(swings, "low", candle.t)).orElse(prev.l),
              Optional.ofNullable(findRecentSwing(swings, "high", candle.t)).orElse(prev.h)
            )
          );
          if (chochFvgOteSignal != null) {
            pushSignal(
              signals,
              toGeneratedSignal(chochFvgOteSignal),
              i,
              currentAtr,
              optimizationWeights,
              lastSignalIndex,
              signalsPerBar,
              signalsPerDay,
              dayKey,
              lastSignalBar,
              setupCooldown,
              globalCooldown,
              maxSignalsPerBar,
              maxTradesPerDay,
              minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
      }

      if (sessionAllowed && freshShiftAfterSweepContext && killZoneContext) {
        if (
          discountContext &&
          "Bullish".equals(biasLabel) &&
          "bullish".equals(shiftNow.direction) &&
          "down".equals(lastSweep.direction) &&
          bullishConfirm &&
          htfBuyZone &&
          hasClearPath(candle.c, candle.c + proximity * 2.5, "buy", gaps)
        ) {
          double stop = Math.min(Optional.ofNullable(findRecentSwing(swings, "low", candle.t)).orElse(candle.l), candle.l);
          double risk = candle.c - stop;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "buy", "PD Array (Discount)",
                String.join(" • ", discount ? "Discount array" : "Weekly discount array", "BOS/CHoCH up", "Session " + session.label)
              ).withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel),
              i,
              currentAtr,
              optimizationWeights,
              lastSignalIndex,
              signalsPerBar,
              signalsPerDay,
              dayKey,
              lastSignalBar,
              setupCooldown,
              globalCooldown,
              maxSignalsPerBar,
              maxTradesPerDay,
              minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
        if (
          premiumContext &&
          "Bearish".equals(biasLabel) &&
          "bearish".equals(shiftNow.direction) &&
          "up".equals(lastSweep.direction) &&
          bearishConfirm &&
          htfSellZone &&
          hasClearPath(candle.c, candle.c - proximity * 2.5, "sell", gaps)
        ) {
          double stop = Math.max(Optional.ofNullable(findRecentSwing(swings, "high", candle.t)).orElse(candle.h), candle.h);
          double risk = stop - candle.c;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "sell", "PD Array (Premium)",
                String.join(" • ", premium ? "Premium array" : "Weekly premium array", "BOS/CHoCH down", "Session " + session.label)
              ).withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel),
              i,
              currentAtr,
              optimizationWeights,
              lastSignalIndex,
              signalsPerBar,
              signalsPerDay,
              dayKey,
              lastSignalBar,
              setupCooldown,
              globalCooldown,
              maxSignalsPerBar,
              maxTradesPerDay,
              minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
      }

      if (sessionAllowed && freshSweepContext && killZoneContext) {
        SignalSetupRules.SignalSpec sweepShiftSignal = SignalSetupRules.buildSweepShiftSignal(
          new SignalSetupRules.SweepShiftInput(
            toCandleSnapshot(candle),
            sessionAllowed,
            killZoneContext,
            biasLabel,
            bullishConfirm,
            bearishConfirm,
            htfBuyZone,
            htfSellZone,
            session.label,
            toShiftSnapshot(shiftNow),
            toSweepSnapshot(lastSweep),
            shiftAgeBars,
            sweepAgeBars,
            shiftFollowsSweep
          )
        );
        if (sweepShiftSignal != null) {
          pushSignal(
            signals,
            toGeneratedSignal(sweepShiftSignal),
            i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
            lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
          );
          lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
        }
      }

      double trendSeparation =
        emaFast[i] != null && emaSlow[i] != null && Math.abs(emaSlow[i]) > 0
          ? Math.abs(emaFast[i] - emaSlow[i]) / Math.max(Math.abs(emaSlow[i]), 1e-6)
          : 0;
      boolean hasTrendStrength = trendSeparation >= 0.001;
      if (sessionAllowed && freshShiftContext && killZoneContext) {
        if (
          emaFast[i] != null &&
          emaSlow[i] != null &&
          emaFast[i] > emaSlow[i] &&
          "Bullish".equals(biasLabel) &&
          hasTrendStrength &&
          candle.c >= emaFast[i] &&
          candle.l <= emaFast[i] * 1.0005 &&
          bullishConfirm &&
          "bullish".equals(shiftNow.direction)
        ) {
          double stop = Math.min(Math.min(emaFast[i], candle.l), prev.l);
          double risk = candle.c - stop;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "buy", "Trend Pullback", "EMA stack up • Pullback to EMA")
                .withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
        if (
          emaFast[i] != null &&
          emaSlow[i] != null &&
          emaFast[i] < emaSlow[i] &&
          "Bearish".equals(biasLabel) &&
          hasTrendStrength &&
          candle.c <= emaFast[i] &&
          candle.h >= emaFast[i] * 0.9995 &&
          bearishConfirm &&
          "bearish".equals(shiftNow.direction)
        ) {
          double stop = Math.max(Math.max(emaFast[i], candle.h), prev.h);
          double risk = stop - candle.c;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "sell", "Trend Pullback", "EMA stack down • Pullback to EMA")
                .withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
      }

      if (sessionAllowed && isLondonOrNy && freshShiftContext && killZoneContext) {
        if (
          institutionalBuyZone &&
          bullishConfirm &&
          "Bullish".equals(biasLabel) &&
          htfBuyZone &&
          "bullish".equals(shiftNow.direction) &&
          hasClearPath(candle.c, candle.c + proximity * 3, "buy", gaps)
        ) {
          double stop = Math.min(
            Math.min(asiaRange != null ? asiaRange.low : candle.l, Optional.ofNullable(findRecentSwing(swings, "low", candle.t)).orElse(candle.l)),
            candle.l
          );
          double risk = candle.c - stop;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "buy", "Kill Zone Liquidity Entry",
                "Institutional discount • Session " + session.label
              ).withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
        if (
          institutionalSellZone &&
          bearishConfirm &&
          "Bearish".equals(biasLabel) &&
          htfSellZone &&
          "bearish".equals(shiftNow.direction) &&
          hasClearPath(candle.c, candle.c - proximity * 3, "sell", gaps)
        ) {
          double stop = Math.max(
            Math.max(asiaRange != null ? asiaRange.high : candle.h, Optional.ofNullable(findRecentSwing(swings, "high", candle.t)).orElse(candle.h)),
            candle.h
          );
          double risk = stop - candle.c;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "sell", "Kill Zone Liquidity Entry",
                "Institutional premium • Session " + session.label
              ).withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
      }

      if (sessionAllowed && isLondonOrNy && killZone && asiaRange != null && asiaRange.active) {
        double sweepTolerance = 0.0002;
        boolean sweptAsiaHigh = candle.h >= asiaRange.high * (1 + sweepTolerance) && candle.c < asiaRange.high && bearishConfirm && htfSellZone;
        if (sweptAsiaHigh && (asiaRange.lastTriggerBar == null || i - asiaRange.lastTriggerBar > 8)) {
          double stop = Math.max(candle.h, asiaRange.high);
          double risk = stop - candle.c;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "sell", "Asia Sweep Reversal",
                "London/NY sweep of Asia high • Kill zone rejection"
              ).withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
            asiaRange.lastTriggerBar = i;
          }
        }
        boolean sweptAsiaLow = candle.l <= asiaRange.low * (1 - sweepTolerance) && candle.c > asiaRange.low && bullishConfirm && htfBuyZone;
        if (sweptAsiaLow && (asiaRange.lastTriggerBar == null || i - asiaRange.lastTriggerBar > 8)) {
          double stop = Math.min(candle.l, asiaRange.low);
          double risk = candle.c - stop;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "buy", "Asia Sweep Reversal",
                "London/NY sweep of Asia low • Kill zone rejection"
              ).withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
            asiaRange.lastTriggerBar = i;
          }
        }
      }

      GapZone recentGap = findLastGap(gaps, candle.t);
      boolean silverBulletWindow = isWithinNewYorkSilverBulletWindow(candle.t, session);
      if (silverBulletWindow && freshSweepContext) {
        SignalSetupRules.SignalSpec silverBulletSignal = SignalSetupRules.buildSilverBulletSignal(
          new SignalSetupRules.SilverBulletInput(
            toCandleSnapshot(candle),
            sessionAllowed,
            session.label,
            biasLabel,
            bullishConfirm,
            bearishConfirm,
            htfBuyZone,
            htfSellZone,
            toSweepSnapshot(lastSweep),
            toGapSnapshot(recentGap)
          )
        );
        if (silverBulletSignal != null) {
          pushSignal(
            signals,
            toGeneratedSignal(silverBulletSignal),
            i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
            lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
          );
          lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
        }
      }

      int dayIndex = dayIndexMap.getOrDefault(dayKey, -1);
      Double turtleHigh = null;
      Double turtleLow = null;
      if (dayIndex > 0) {
        List<String> lookbackKeys = dayKeys.subList(Math.max(0, dayIndex - 20), dayIndex);
        List<CandleBar> lookbackCandles = new ArrayList<>();
        for (String key : lookbackKeys) {
          lookbackCandles.addAll(byDay.getOrDefault(key, List.of()));
        }
        if (lookbackCandles.size() >= 10) {
          turtleHigh = lookbackCandles.stream().mapToDouble(CandleBar::h).max().orElseThrow();
          turtleLow = lookbackCandles.stream().mapToDouble(CandleBar::l).min().orElseThrow();
        }
      }
      if (sessionAllowed && turtleHigh != null && turtleLow != null) {
        double avgAtr = average(Arrays.copyOfRange(atrValues, Math.max(0, i - 120), i));
        boolean strongTrend = emaFast[i] != null && emaSlow[i] != null && Math.abs(emaFast[i] - emaSlow[i]) > Math.abs(emaSlow[i]) * 0.0025;
        SignalSetupRules.SignalSpec turtleSoupSignal = SignalSetupRules.buildTurtleSoupSignal(
          new SignalSetupRules.TurtleSoupInput(
            toCandleSnapshot(candle),
            sessionAllowed,
            killZoneContext,
            session.label,
            biasLabel,
            bullishConfirm,
            bearishConfirm,
            htfBuyZone,
            htfSellZone,
            turtleHigh,
            turtleLow,
            avgAtr,
            strongTrend
          )
        );
        if (turtleSoupSignal != null) {
          pushSignal(
            signals,
            toGeneratedSignal(turtleSoupSignal),
            i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
            lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
          );
          lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
        }
      }

      boolean bullEngulf =
        "bullish".equals(candleDirection) &&
        candle.o <= prev.c &&
        candle.c >= prev.h &&
        candle.c - candle.o > Math.abs(prev.c - prev.o);
      boolean bearEngulf =
        "bearish".equals(candleDirection) &&
        candle.o >= prev.c &&
        candle.c <= prev.l &&
        candle.o - candle.c > Math.abs(prev.c - prev.o);
      if (sessionAllowed && killZoneContext && freshShiftContext) {
        if (bullEngulf && "Bullish".equals(biasLabel) && "bullish".equals(shiftNow.direction) && hasClearPath(candle.c, candle.c + proximity * 2, "buy", gaps)) {
          double stop = Math.min(prev.l, candle.l);
          double risk = candle.c - stop;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "buy", "Engulfing Shift",
                "Bullish engulfing • Session " + session.label
              ).withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
        if (bearEngulf && "Bearish".equals(biasLabel) && "bearish".equals(shiftNow.direction) && hasClearPath(candle.c, candle.c - proximity * 2, "sell", gaps)) {
          double stop = Math.max(prev.h, candle.h);
          double risk = stop - candle.c;
          if (risk > 0) {
            pushSignal(
              signals,
              new GeneratedSignal(candle.t, candle.c, "sell", "Engulfing Shift",
                "Bearish engulfing • Session " + session.label
              ).withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel),
              i, currentAtr, optimizationWeights, lastSignalIndex, signalsPerBar, signalsPerDay, dayKey,
              lastSignalBar, setupCooldown, globalCooldown, maxSignalsPerBar, maxTradesPerDay, minRMultiple
            );
            lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
          }
        }
      }

      GeneratedSignal pullbackReentrySignal = buildPullbackReentrySignal(
        candle,
        prev,
        sessionAllowed,
        biasLabel,
        bullishConfirm,
        bearishConfirm,
        session
      );
      if (pullbackReentrySignal != null) {
        pushSignal(
          signals,
          pullbackReentrySignal,
          i,
          currentAtr,
          optimizationWeights,
          lastSignalIndex,
          signalsPerBar,
          signalsPerDay,
          dayKey,
          lastSignalBar,
          pullbackReentryCooldown,
          globalCooldown,
          maxSignalsPerBar,
          maxTradesPerDay,
          minRMultiple
        );
        lastSignalBar = updatedLastSignalBar(lastSignalBar, signals, i);
      }
    }

    if (signalLimit != null && signalLimit > 0 && signals.size() > signalLimit) {
      return signals.subList(signals.size() - signalLimit, signals.size());
    }
    return signals;
  }

  private GeneratedSignal buildBiasOrderBlockSessionSignal(
    CandleBar candle,
    CandleBar prev,
    List<SwingPoint> swings,
    List<GapZone> gaps,
    boolean sessionAllowed,
    String biasLabel,
    boolean bullishConfirm,
    boolean bearishConfirm,
    boolean htfBuyZone,
    boolean htfSellZone,
    SessionZone session,
    StructureShiftPoint shiftNow,
    OrderBlockZone tappedBullBlock,
    OrderBlockZone tappedBearBlock,
    GapZone tappedBullGap,
    GapZone tappedBearGap,
    double proximity
  ) {
    if (shiftNow == null || !sessionAllowed) {
      return null;
    }

    if (
      "Bullish".equals(biasLabel) &&
      bullishConfirm &&
      htfBuyZone &&
      "bullish".equals(shiftNow.direction) &&
      hasClearPath(candle.c, candle.c + proximity * 3, "buy", gaps) &&
      (tappedBullBlock != null || tappedBullGap != null) &&
      prev.c >= prev.o
    ) {
      double stop = Optional.ofNullable(findRecentSwing(swings, "low", candle.t)).orElse(prev.l);
      double risk = candle.c - stop;
      if (risk > 0) {
        return new GeneratedSignal(candle.t, candle.c, "buy", "Bias + OB/FVG + Session",
          String.join(
            " • ",
            "Bias bullish",
            tappedBullBlock != null ? "Tapped Bullish OB" : "Tapped Bullish FVG",
            "Session " + session.label
          )
        ).withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel);
      }
    }

    if (
      "Bearish".equals(biasLabel) &&
      bearishConfirm &&
      htfSellZone &&
      "bearish".equals(shiftNow.direction) &&
      hasClearPath(candle.c, candle.c - proximity * 3, "sell", gaps) &&
      (tappedBearBlock != null || tappedBearGap != null) &&
      prev.c <= prev.o
    ) {
      double stop = Optional.ofNullable(findRecentSwing(swings, "high", candle.t)).orElse(prev.h);
      double risk = stop - candle.c;
      if (risk > 0) {
        return new GeneratedSignal(candle.t, candle.c, "sell", "Bias + OB/FVG + Session",
          String.join(
            " • ",
            "Bias bearish",
            tappedBearBlock != null ? "Tapped Bearish OB" : "Tapped Bearish FVG",
            "Session " + session.label
          )
        ).withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel);
      }
    }

    return null;
  }

  private GeneratedSignal buildPullbackReentrySignal(
    CandleBar candle,
    CandleBar prev,
    boolean sessionAllowed,
    String biasLabel,
    boolean bullishConfirm,
    boolean bearishConfirm,
    SessionZone session
  ) {
    if (!sessionAllowed) {
      return null;
    }

    double candleRange = Math.max(candle.h - candle.l, 1e-6);
    double candleBody = Math.abs(candle.c - candle.o);
    double lowerWick = Math.max(0, Math.min(candle.o, candle.c) - candle.l);
    double upperWick = Math.max(0, candle.h - Math.max(candle.o, candle.c));
    boolean decisiveBody = candleBody >= candleRange * 0.35;

    if (
      "Bullish".equals(biasLabel) &&
      prev.c < prev.o &&
      candle.l < prev.l &&
      bullishConfirm &&
      candle.c >= prev.o &&
      decisiveBody &&
      lowerWick >= candleBody * 0.5
    ) {
      double stop = Math.min(candle.l, prev.l);
      double risk = candle.c - stop;
      if (risk > 0) {
        return new GeneratedSignal(candle.t, candle.c, "buy", "Pullback Reentry",
          "Bias bullish • Sweep of pullback low • Body reclaim"
        ).withStop(stop).withTargets(candle.c + risk, candle.c + risk * 2).withContext(session.label, biasLabel);
      }
    }

    if (
      "Bearish".equals(biasLabel) &&
      prev.c > prev.o &&
      candle.h > prev.h &&
      bearishConfirm &&
      candle.c <= prev.o &&
      decisiveBody &&
      upperWick >= candleBody * 0.5
    ) {
      double stop = Math.max(candle.h, prev.h);
      double risk = stop - candle.c;
      if (risk > 0) {
        return new GeneratedSignal(candle.t, candle.c, "sell", "Pullback Reentry",
          "Bias bearish • Sweep of pullback high • Body reclaim"
        ).withStop(stop).withTargets(candle.c - risk, candle.c - risk * 2).withContext(session.label, biasLabel);
      }
    }

    return null;
  }

  private SignalSetupRules.CandleSnapshot toCandleSnapshot(CandleBar candle) {
    return new SignalSetupRules.CandleSnapshot(candle.t, candle.o, candle.h, candle.l, candle.c);
  }

  private SignalSetupRules.GapSnapshot toGapSnapshot(GapZone gap) {
    if (gap == null) {
      return null;
    }
    return new SignalSetupRules.GapSnapshot(gap.type, gap.top, gap.bottom);
  }

  private SignalSetupRules.ShiftSnapshot toShiftSnapshot(StructureShiftPoint shift) {
    if (shift == null) {
      return null;
    }
    return new SignalSetupRules.ShiftSnapshot(shift.time, shift.direction, shift.label);
  }

  private SignalSetupRules.SweepSnapshot toSweepSnapshot(LiquiditySweepPoint sweep) {
    if (sweep == null) {
      return null;
    }
    return new SignalSetupRules.SweepSnapshot(sweep.time, sweep.direction, sweep.price);
  }

  private GeneratedSignal toGeneratedSignal(SignalSetupRules.SignalSpec signal) {
    return new GeneratedSignal(signal.time(), signal.price(), signal.direction(), signal.setup(), signal.basis())
      .withStop(signal.stop())
      .withTargets(signal.tp1(), signal.tp2())
      .withContext(signal.session(), signal.bias());
  }

  private int updatedLastSignalBar(int lastSignalBar, List<GeneratedSignal> signals, int currentBar) {
    return signals.isEmpty() ? lastSignalBar : currentBar;
  }

  private void pushSignal(
    List<GeneratedSignal> signals,
    GeneratedSignal signal,
    int barIndex,
    double atr,
    Map<String, TradePerformanceSetupResponse> optimizationWeights,
    Map<String, Integer> lastSignalIndex,
    Map<Integer, Integer> signalsPerBar,
    Map<String, Integer> signalsPerDay,
    String dayKey,
    int lastSignalBar,
    int setupCooldown,
    int globalCooldown,
    int maxSignalsPerBar,
    int maxTradesPerDay,
    double minRMultiple
  ) {
    TradePerformanceSetupResponse stats = optimizationWeights.get(signal.setup);
    if (stats != null && !stats.allowed()) {
      return;
    }
    if (isWithinBarSpacing(barIndex, lastSignalBar, globalCooldown)) {
      return;
    }
    if (signalsPerBar.getOrDefault(barIndex, 0) >= maxSignalsPerBar) {
      return;
    }
    if (signal.setup != null) {
      int lastSetupBar = lastSignalIndex.getOrDefault(signal.setup, Integer.MIN_VALUE);
      if (isWithinBarSpacing(barIndex, lastSetupBar, setupCooldown)) {
        return;
      }
    }
    if (signalsPerDay.getOrDefault(dayKey, 0) >= maxTradesPerDay) {
      return;
    }

    double risk = signal.stop == null
      ? Double.NaN
      : ("buy".equals(signal.direction) ? signal.price - signal.stop : signal.stop - signal.price);
    if (!(risk > 0)) {
      return;
    }

    if (signal.tp1 == null) {
      signal.tp1 = "buy".equals(signal.direction) ? signal.price + risk * 1.5 : signal.price - risk * 1.5;
    }
    if (signal.tp2 == null) {
      signal.tp2 = "buy".equals(signal.direction) ? signal.price + risk * 3 : signal.price - risk * 3;
    }
    if (signal.tp3 == null) {
      signal.tp3 = "buy".equals(signal.direction) ? signal.price + risk * 4.5 : signal.price - risk * 4.5;
    }
    if (signal.tp4 == null) {
      signal.tp4 = "buy".equals(signal.direction) ? signal.price + risk * 6 : signal.price - risk * 6;
    }

    double rr = signal.tp1 != null && risk > 0 ? Math.abs(signal.tp1 - signal.price) / risk : minRMultiple;
    if (rr < minRMultiple) {
      double adjusted = risk * minRMultiple;
      signal.tp1 = "buy".equals(signal.direction) ? signal.price + adjusted : signal.price - adjusted;
      signal.tp2 = "buy".equals(signal.direction) ? signal.price + adjusted * 2 : signal.price - adjusted * 2;
      signal.tp3 = "buy".equals(signal.direction) ? signal.price + adjusted * 3 : signal.price - adjusted * 3;
      signal.tp4 = "buy".equals(signal.direction) ? signal.price + adjusted * 4 : signal.price - adjusted * 4;
    }

    double sizeBaseline = Math.max(Math.abs(signal.price) * 0.0008, 1e-6);
    double baseSize = atr > 0 ? clamp(atr / sizeBaseline, 0.5, isTierOne(signal.setup) ? 1.5 : 2.5) : 1;
    double userMultiplier = stats != null ? stats.sizeMultiplier() : 1.0;
    signal.sizeMultiplier = baseSize * userMultiplier;

    signals.add(signal);
    lastSignalIndex.put(signal.setup, barIndex);
    signalsPerBar.put(barIndex, signalsPerBar.getOrDefault(barIndex, 0) + 1);
    signalsPerDay.put(dayKey, signalsPerDay.getOrDefault(dayKey, 0) + 1);
  }

  private boolean isWithinBarSpacing(int currentBar, int previousBar, int spacingBars) {
    return previousBar != Integer.MIN_VALUE && currentBar - previousBar < spacingBars;
  }

  private boolean hasRequiredBarSpacing(int currentBar, int previousBar, int spacingBars) {
    return previousBar == Integer.MIN_VALUE || currentBar - previousBar >= spacingBars;
  }

  private boolean isTierOne(String setup) {
    return "Bias + OB/FVG + Session".equals(setup)
      || "CHoCH + FVG + OTE".equals(setup)
      || "Silver Bullet".equals(setup)
      || "Turtle Soup".equals(setup);
  }

  private Map<String, List<CandleBar>> groupByDay(List<CandleBar> candles) {
    Map<String, List<CandleBar>> grouped = new LinkedHashMap<>();
    for (CandleBar candle : candles) {
      grouped.computeIfAbsent(dayKey(candle.t), ignored -> new ArrayList<>()).add(candle);
    }
    return grouped;
  }

  private DayStats dayStats(List<CandleBar> dayCandles) {
    return new DayStats(
      dayCandles.stream().mapToDouble(CandleBar::h).max().orElseThrow(),
      dayCandles.stream().mapToDouble(CandleBar::l).min().orElseThrow(),
      dayCandles.get(dayCandles.size() - 1).c
    );
  }

  private boolean nearLevel(double price, Double level, double tolerance) {
    return level != null && Math.abs(price - level) <= tolerance;
  }

  private String computeMomentumBias(Double emaFast, Double emaSlow) {
    if (emaFast == null || emaSlow == null) {
      return "Neutral";
    }
    if (emaFast > emaSlow * 1.0005) {
      return "Bullish";
    }
    if (emaFast < emaSlow * 0.9995) {
      return "Bearish";
    }
    return "Neutral";
  }

  private OrderBlockZone findTappedOrderBlock(List<OrderBlockZone> blocks, CandleBar candle, String type) {
    return findLast(blocks, block ->
      type.equals(block.type) &&
      block.endTime <= candle.t &&
      candle.l <= block.high &&
      candle.h >= block.low
    );
  }

  private GapZone findTappedGap(List<GapZone> gaps, CandleBar candle, String type) {
    return findLast(gaps, gap -> {
      if (!type.equals(gap.type) || gap.endTime > candle.t) {
        return false;
      }
      if ("bullish".equals(type)) {
        return candle.l <= gap.top && candle.h >= gap.bottom;
      }
      return candle.h >= gap.bottom && candle.l <= gap.top;
    });
  }

  private GapZone findLastGap(List<GapZone> gaps, long time) {
    return findLast(gaps, gap -> gap.endTime <= time);
  }

  private StructureShiftPoint findLastStructureShift(List<StructureShiftPoint> shifts, long time) {
    return findLast(shifts, shift -> shift.time <= time);
  }

  private LiquiditySweepPoint findLastSweep(List<LiquiditySweepPoint> sweeps, long time) {
    return findLast(sweeps, sweep -> sweep.time <= time);
  }

  private int barsSinceTime(List<CandleBar> candles, int currentIndex, long eventTime) {
    for (int i = currentIndex; i >= 0; i--) {
      if (candles.get(i).t <= eventTime) {
        return currentIndex - i;
      }
    }
    return Integer.MAX_VALUE;
  }

  private <T> T findLast(List<T> items, java.util.function.Predicate<T> predicate) {
    for (int i = items.size() - 1; i >= 0; i--) {
      T item = items.get(i);
      if (predicate.test(item)) {
        return item;
      }
    }
    return null;
  }

  private PremiumDiscountRangeData computePremiumDiscountRange(List<CandleBar> candles) {
    if (candles.size() < 2) {
      return null;
    }
    double high = candles.stream().mapToDouble(CandleBar::h).max().orElseThrow();
    double low = candles.stream().mapToDouble(CandleBar::l).min().orElseThrow();
    return new PremiumDiscountRangeData(high, low, (high + low) / 2);
  }

  private PremiumDiscountRangeData getWeeklyPdRange(HtfLevelsData htfLevels) {
    if (
      htfLevels.prevWeekHigh != null &&
      htfLevels.prevWeekLow != null &&
      htfLevels.prevWeekHigh > htfLevels.prevWeekLow
    ) {
      return new PremiumDiscountRangeData(
        htfLevels.prevWeekHigh,
        htfLevels.prevWeekLow,
        (htfLevels.prevWeekHigh + htfLevels.prevWeekLow) / 2
      );
    }
    return null;
  }

  private Double findRecentSwing(List<SwingPoint> swings, String kind, long beforeTime) {
    for (int i = swings.size() - 1; i >= 0; i--) {
      SwingPoint swing = swings.get(i);
      if (kind.equals(swing.type) && swing.time <= beforeTime) {
        return swing.price;
      }
    }
    return null;
  }

  private Optional<SessionZone> classifySession(ZonedDateTime dateTime) {
    int hour = dateTime.getHour();
    return SESSION_ZONES.stream().filter(session -> hour >= session.startHour && hour < session.endHour).findFirst();
  }

  private SessionZone fallbackSession(ZonedDateTime dateTime) {
    int hour = dateTime.getHour();
    if (hour >= 0 && hour < 6) {
      return new SessionZone("Asia", 0, 6, 0, 6);
    }
    if (hour >= 6 && hour < 12) {
      return new SessionZone("London", 6, 12, 7, 10);
    }
    if (hour >= 12 && hour < 20) {
      return new SessionZone("New York", 12, 20, 12, 15);
    }
    return null;
  }

  private boolean isWithinKillZone(ZonedDateTime dateTime, SessionZone session) {
    return session.killStartHour == null || session.killEndHour == null
      || (dateTime.getHour() >= session.killStartHour && dateTime.getHour() < session.killEndHour);
  }

  private List<OrderBlockZone> dedupeBlocks(List<OrderBlockZone> blocks) {
    List<OrderBlockZone> unique = new ArrayList<>();
    for (OrderBlockZone block : blocks) {
      boolean exists = unique.stream().anyMatch(existing ->
        existing.type.equals(block.type) &&
          Math.abs(existing.startTime - block.startTime) < 1000 &&
          Math.abs(existing.high - block.high) < 1e-8 &&
          Math.abs(existing.low - block.low) < 1e-8
      );
      if (!exists) {
        unique.add(block);
      }
    }
    return unique;
  }

  private boolean hasClearPath(double currentPrice, double targetPrice, String direction, List<GapZone> gaps) {
    if (!Double.isFinite(currentPrice) || !Double.isFinite(targetPrice)) {
      return true;
    }
    if ("buy".equals(direction) && targetPrice <= currentPrice) {
      return true;
    }
    if ("sell".equals(direction) && targetPrice >= currentPrice) {
      return true;
    }
    for (GapZone gap : gaps) {
      if ("buy".equals(direction)) {
        if ("bearish".equals(gap.type) && gap.bottom > currentPrice && gap.bottom < targetPrice) {
          return false;
        }
      } else if ("bullish".equals(gap.type) && gap.top < currentPrice && gap.top > targetPrice) {
        return false;
      }
    }
    return true;
  }

  private double[] computeAtr(List<CandleBar> candles, int period) {
    double[] atr = new double[candles.size()];
    for (int i = 1; i < candles.size(); i++) {
      CandleBar current = candles.get(i);
      CandleBar previous = candles.get(i - 1);
      double tr = Math.max(
        current.h - current.l,
        Math.max(Math.abs(current.h - previous.c), Math.abs(current.l - previous.c))
      );
      if (i == 1) {
        atr[i] = tr;
      } else {
        atr[i] = ((atr[i - 1] * (period - 1)) + tr) / period;
      }
    }
    return atr;
  }

  private Double[] computeEma(double[] values, int length) {
    Double[] ema = new Double[values.length];
    if (length <= 1) {
      for (int i = 0; i < values.length; i++) {
        ema[i] = values[i];
      }
      return ema;
    }

    double k = 2d / (length + 1);
    Double previous = null;
    for (int i = 0; i < values.length; i++) {
      double price = values[i];
      if (!Double.isFinite(price)) {
        continue;
      }
      if (i < length - 1) {
        continue;
      }
      if (previous == null) {
        double[] window = Arrays.copyOfRange(values, i - length + 1, i + 1);
        double seed = average(window);
        ema[i] = seed;
        previous = seed;
        continue;
      }
      previous = price * k + previous * (1 - k);
      ema[i] = previous;
    }
    return ema;
  }

  private double average(double[] values) {
    if (values.length == 0) {
      return 0;
    }
    double sum = 0;
    int count = 0;
    for (double value : values) {
      if (!Double.isFinite(value)) {
        continue;
      }
      sum += value;
      count++;
    }
    return count == 0 ? 0 : sum / count;
  }

  private boolean betweenInclusive(double value, double a, double b) {
    return value >= Math.min(a, b) && value <= Math.max(a, b);
  }

  private <T> List<T> tail(List<T> items, int limit) {
    if (items.size() <= limit) {
      return items;
    }
    return items.subList(items.size() - limit, items.size());
  }

  private double clamp(double value, double min, double max) {
    return Math.max(min, Math.min(max, value));
  }

  private String dayKey(long epochMs) {
    return DAY_KEY_FORMATTER.format(utc(epochMs));
  }

  private String weekKey(long epochMs) {
    ZonedDateTime dateTime = utc(epochMs);
    int week = dateTime.get(WeekFields.ISO.weekOfWeekBasedYear());
    int year = dateTime.get(WeekFields.ISO.weekBasedYear());
    return year + "-W" + week;
  }

  private ZonedDateTime utc(long epochMs) {
    return Instant.ofEpochMilli(epochMs).atZone(ZoneOffset.UTC);
  }

  private record CandleBar(long t, double o, double h, double l, double c, double v) {
  }

  private record BiasState(String label, String reason) {
  }

  private record DayStats(double high, double low, double close) {
  }

  private record SwingPoint(int index, long time, double price, String type) {
  }

  private record GapZone(long startTime, long endTime, double top, double bottom, String type) {
  }

  private record OrderBlockZone(long startTime, long endTime, double high, double low, String type) {
  }

  private record StructureShiftPoint(long time, double price, String direction, String label) {
  }

  private record LiquiditySweepPoint(long time, double price, String type, String direction) {
  }

  private record EqualLiquidityLevelData(double price, List<Long> times, String kind) {
  }

  private record BreakerBlockData(
    long startTime,
    long endTime,
    double high,
    double low,
    String type,
    String sourceObType,
    String grade
  ) {
  }

  private record PremiumDiscountRangeData(double high, double low, double equilibrium) {
  }

  private record HtfLevelsData(
    Double prevDayHigh,
    Double prevDayLow,
    Double prevWeekHigh,
    Double prevWeekLow,
    Double weekOpen,
    Double monthOpen
  ) {
  }

  private record SessionZone(
    String label,
    int startHour,
    int endHour,
    Integer killStartHour,
    Integer killEndHour
  ) {
  }

  private record LevelPoint(double price, long time) {
  }

  private record StrongWeakSwingData(
    int index,
    long time,
    double price,
    String type,
    String strength
  ) {
  }

  private record DailyCandleData(
    String date,
    double open,
    double high,
    double low,
    double close
  ) {
  }

  private record DailyLevelData(double price, String date) {
  }

  private record DailyLiquidityData(
    Double pdh,
    Double pdl,
    List<DailyLevelData> last3Highs,
    List<DailyLevelData> last3Lows,
    Double midnightOpen
  ) {
  }

  private record Model2022SignalData(
    long time,
    String direction,
    String label,
    GapZone fvg,
    double entry,
    Double stop,
    List<String> basis
  ) {
  }

  private record Model2022Data(
    List<StrongWeakSwingData> strongSwings,
    List<OrderBlockZone> obWithDisplacement,
    DailyCandleData dailyCandle,
    DailyLiquidityData dailyLiquidity,
    List<Model2022SignalData> m15Signals
  ) {
  }

  private static final class AsiaRangeState {
    private final String dayKey;
    private double high;
    private double low;
    private boolean active;
    private Integer lastTriggerBar;

    private AsiaRangeState(String dayKey, double high, double low) {
      this.dayKey = dayKey;
      this.high = high;
      this.low = low;
    }
  }

  private static final class GeneratedSignal {
    private final long time;
    private final double price;
    private final String direction;
    private final String setup;
    private final String basis;
    private Double stop;
    private Double tp1;
    private Double tp2;
    private Double tp3;
    private Double tp4;
    private Double sizeMultiplier;
    private String session;
    private String bias;

    private GeneratedSignal(long time, double price, String direction, String setup, String basis) {
      this.time = time;
      this.price = price;
      this.direction = direction;
      this.setup = setup;
      this.basis = basis;
    }

    private GeneratedSignal withStop(double stop) {
      this.stop = stop;
      return this;
    }

    private GeneratedSignal withTargets(double tp1, double tp2) {
      this.tp1 = tp1;
      this.tp2 = tp2;
      return this;
    }

    private GeneratedSignal withContext(String session, String bias) {
      this.session = session;
      this.bias = bias;
      return this;
    }
  }
}
