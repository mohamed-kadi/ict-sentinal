package com.ictcrakr.backend.analysis.service;

final class SignalSetupRules {

  private SignalSetupRules() {
  }

  static SignalSpec buildChochFvgOteSignal(ChochFvgOteInput input) {
    if (input.shift() == null || !input.sessionAllowed() || !input.inOte()) {
      return null;
    }
    if (!"CHoCH".equals(input.shift().label())) {
      return null;
    }

    CandleSnapshot candle = input.candle();

    if (
      "Bullish".equals(input.biasLabel()) &&
      input.bullishConfirm() &&
      input.htfBuyZone() &&
      "bullish".equals(input.shift().direction()) &&
      input.bullishGapTap() != null
    ) {
      double stop = input.bullishStop();
      double risk = candle.close() - stop;
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          candle.close(),
          "buy",
          "CHoCH + FVG + OTE",
          "CHoCH up • FVG tap • Within OTE zone",
          stop,
          candle.close() + risk,
          candle.close() + risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    if (
      "Bearish".equals(input.biasLabel()) &&
      input.bearishConfirm() &&
      input.htfSellZone() &&
      "bearish".equals(input.shift().direction()) &&
      input.bearishGapTap() != null
    ) {
      double stop = input.bearishStop();
      double risk = stop - candle.close();
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          candle.close(),
          "sell",
          "CHoCH + FVG + OTE",
          "CHoCH down • FVG tap • Within OTE zone",
          stop,
          candle.close() - risk,
          candle.close() - risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    return null;
  }

  static SignalSpec buildSweepShiftSignal(SweepShiftInput input) {
    if (!input.sessionAllowed() || !input.killZoneContext() || input.shift() == null || input.sweep() == null) {
      return null;
    }

    CandleSnapshot candle = input.candle();

    if (
      "up".equals(input.sweep().direction()) &&
      input.bearishConfirm() &&
      "Bearish".equals(input.biasLabel()) &&
      input.htfSellZone() &&
      "bearish".equals(input.shift().direction())
    ) {
      double stop = input.sweep().price() * 1.0002;
      double risk = stop - candle.close();
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          candle.close(),
          "sell",
          "Sweep + Shift",
          "EQH sweep • Looking for shift lower",
          stop,
          candle.close() - risk,
          candle.close() - risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    if (
      "down".equals(input.sweep().direction()) &&
      input.bullishConfirm() &&
      "Bullish".equals(input.biasLabel()) &&
      input.htfBuyZone() &&
      "bullish".equals(input.shift().direction())
    ) {
      double stop = input.sweep().price() * 0.9998;
      double risk = candle.close() - stop;
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          candle.close(),
          "buy",
          "Sweep + Shift",
          "EQL sweep • Looking for shift higher",
          stop,
          candle.close() + risk,
          candle.close() + risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    return null;
  }

  static boolean isWithinNewYorkSilverBulletWindow(Integer nyHour) {
    if (nyHour == null) {
      return false;
    }
    return nyHour == 10 || nyHour == 14;
  }

  static SignalSpec buildSilverBulletSignal(SilverBulletInput input) {
    if (!input.sessionAllowed() || input.sweep() == null || input.gap() == null) {
      return null;
    }

    CandleSnapshot candle = input.candle();
    double gapTop = Math.max(input.gap().top(), input.gap().bottom());
    double gapBottom = Math.min(input.gap().top(), input.gap().bottom());
    boolean inGap = candle.low() <= gapTop && candle.high() >= gapBottom;
    if (!inGap) {
      return null;
    }

    if (
      "down".equals(input.sweep().direction()) &&
      "bullish".equals(input.gap().type()) &&
      input.bullishConfirm() &&
      input.htfBuyZone()
    ) {
      double stop = Math.min(input.sweep().price(), candle.low());
      double risk = candle.close() - stop;
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          candle.close(),
          "buy",
          "Silver Bullet",
          "NY silver window • Sweep of lows • FVG return",
          stop,
          candle.close() + risk,
          candle.close() + risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    if (
      "up".equals(input.sweep().direction()) &&
      "bearish".equals(input.gap().type()) &&
      input.bearishConfirm() &&
      input.htfSellZone()
    ) {
      double stop = Math.max(input.sweep().price(), candle.high());
      double risk = stop - candle.close();
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          candle.close(),
          "sell",
          "Silver Bullet",
          "NY silver window • Sweep of highs • FVG return",
          stop,
          candle.close() - risk,
          candle.close() - risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    return null;
  }

  static SignalSpec buildTurtleSoupSignal(TurtleSoupInput input) {
    if (
      !input.sessionAllowed() ||
      !input.killZoneContext() ||
      input.rangeHigh() == null ||
      input.rangeLow() == null ||
      input.avgAtr() <= 0 ||
      input.strongTrend()
    ) {
      return null;
    }

    double turtleRange = input.rangeHigh() - input.rangeLow();
    if (turtleRange > input.avgAtr() * 8) {
      return null;
    }

    CandleSnapshot candle = input.candle();

    if (
      candle.high() > input.rangeHigh() &&
      candle.close() < input.rangeHigh() &&
      input.bearishCandle() &&
      input.htfSellZone()
    ) {
      double stop = Math.max(candle.high(), input.rangeHigh());
      double entry = Math.min(candle.close(), input.rangeHigh());
      double risk = stop - entry;
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          entry,
          "sell",
          "Turtle Soup",
          "20-day high sweep • Close back below range",
          stop,
          entry - risk,
          entry - risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    if (
      candle.low() < input.rangeLow() &&
      candle.close() > input.rangeLow() &&
      input.bullishCandle() &&
      input.htfBuyZone()
    ) {
      double stop = Math.min(candle.low(), input.rangeLow());
      double entry = Math.max(candle.close(), input.rangeLow());
      double risk = entry - stop;
      if (risk > 0) {
        return new SignalSpec(
          candle.time(),
          entry,
          "buy",
          "Turtle Soup",
          "20-day low sweep • Close back above range",
          stop,
          entry + risk,
          entry + risk * 2,
          input.sessionLabel(),
          input.biasLabel()
        );
      }
    }

    return null;
  }

  record CandleSnapshot(long time, double open, double high, double low, double close) {
  }

  record GapSnapshot(String type, double top, double bottom) {
  }

  record ShiftSnapshot(String direction, String label) {
  }

  record SweepSnapshot(String direction, double price) {
  }

  record ChochFvgOteInput(
    CandleSnapshot candle,
    boolean sessionAllowed,
    String biasLabel,
    boolean bullishConfirm,
    boolean bearishConfirm,
    boolean htfBuyZone,
    boolean htfSellZone,
    String sessionLabel,
    ShiftSnapshot shift,
    GapSnapshot bullishGapTap,
    GapSnapshot bearishGapTap,
    boolean inOte,
    double bullishStop,
    double bearishStop
  ) {
  }

  record SweepShiftInput(
    CandleSnapshot candle,
    boolean sessionAllowed,
    boolean killZoneContext,
    String biasLabel,
    boolean bullishConfirm,
    boolean bearishConfirm,
    boolean htfBuyZone,
    boolean htfSellZone,
    String sessionLabel,
    ShiftSnapshot shift,
    SweepSnapshot sweep
  ) {
  }

  record SilverBulletInput(
    CandleSnapshot candle,
    boolean sessionAllowed,
    String sessionLabel,
    String biasLabel,
    boolean bullishConfirm,
    boolean bearishConfirm,
    boolean htfBuyZone,
    boolean htfSellZone,
    SweepSnapshot sweep,
    GapSnapshot gap
  ) {
  }

  record TurtleSoupInput(
    CandleSnapshot candle,
    boolean sessionAllowed,
    boolean killZoneContext,
    String sessionLabel,
    String biasLabel,
    boolean bullishCandle,
    boolean bearishCandle,
    boolean htfBuyZone,
    boolean htfSellZone,
    Double rangeHigh,
    Double rangeLow,
    double avgAtr,
    boolean strongTrend
  ) {
  }

  record SignalSpec(
    long time,
    double price,
    String direction,
    String setup,
    String basis,
    double stop,
    double tp1,
    double tp2,
    String session,
    String bias
  ) {
  }
}
