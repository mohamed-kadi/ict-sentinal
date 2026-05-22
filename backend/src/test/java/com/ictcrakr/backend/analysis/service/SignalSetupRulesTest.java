package com.ictcrakr.backend.analysis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class SignalSetupRulesTest {

  @Test
  void emitsBullishChochFvgOteSignalOnlyForChochShift() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildChochFvgOteSignal(
      new SignalSetupRules.ChochFvgOteInput(
        candle(1_715_400_000_000L, 102.0),
        true,
        "Bullish",
        true,
        false,
        true,
        false,
        "New York AM",
        new SignalSetupRules.ShiftSnapshot(1_715_400_000_000L, "bullish", "CHoCH"),
        new SignalSetupRules.GapSnapshot("bullish", 101.4, 100.9),
        null,
        true,
        100.8,
        103.1
      )
    );

    assertThat(signal).isNotNull();
    assertThat(signal.direction()).isEqualTo("buy");
    assertThat(signal.setup()).isEqualTo("CHoCH + FVG + OTE");
    assertThat(signal.stop()).isEqualTo(100.8);
    assertThat(signal.tp1()).isEqualTo(103.2);
    assertThat(signal.tp2()).isEqualTo(104.4);
  }

  @Test
  void rejectsBullishChochFvgOteSignalWhenShiftIsBos() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildChochFvgOteSignal(
      new SignalSetupRules.ChochFvgOteInput(
        candle(1_715_400_000_000L, 102.0),
        true,
        "Bullish",
        true,
        false,
        true,
        false,
        "New York AM",
        new SignalSetupRules.ShiftSnapshot(1_715_400_000_000L, "bullish", "BOS"),
        new SignalSetupRules.GapSnapshot("bullish", 101.4, 100.9),
        null,
        true,
        100.8,
        103.1
      )
    );

    assertThat(signal).isNull();
  }

  @Test
  void emitsBearishSweepShiftSignalOnlyWhenShiftAligns() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildSweepShiftSignal(
      new SignalSetupRules.SweepShiftInput(
        candle(1_715_500_000_000L, 99.0),
        true,
        true,
        "Bearish",
        false,
        true,
        false,
        true,
        "London",
        new SignalSetupRules.ShiftSnapshot(1_715_500_000_000L, "bearish", "CHoCH"),
        new SignalSetupRules.SweepSnapshot(1_715_499_940_000L, "up", 100.0),
        0,
        1,
        true
      )
    );

    assertThat(signal).isNotNull();
    assertThat(signal.direction()).isEqualTo("sell");
    assertThat(signal.setup()).isEqualTo("Sweep + Shift");
    assertThat(signal.stop()).isCloseTo(100.02, within(1e-9));
    assertThat(signal.tp1()).isCloseTo(97.98, within(1e-9));
    assertThat(signal.tp2()).isCloseTo(96.96, within(1e-9));
  }

  @Test
  void rejectsSweepShiftSignalWithoutMatchingShift() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildSweepShiftSignal(
      new SignalSetupRules.SweepShiftInput(
        candle(1_715_500_000_000L, 99.0),
        true,
        true,
        "Bearish",
        false,
        true,
        false,
        true,
        "London",
        null,
        new SignalSetupRules.SweepSnapshot(1_715_499_940_000L, "up", 100.0),
        Integer.MAX_VALUE,
        1,
        false
      )
    );

    assertThat(signal).isNull();
  }

  @Test
  void rejectsSweepShiftSignalWhenSweepContextIsStale() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildSweepShiftSignal(
      new SignalSetupRules.SweepShiftInput(
        candle(1_715_500_000_000L, 99.0),
        true,
        true,
        "Bearish",
        false,
        true,
        false,
        true,
        "London",
        new SignalSetupRules.ShiftSnapshot(1_715_499_940_000L, "bearish", "CHoCH"),
        new SignalSetupRules.SweepSnapshot(1_715_499_700_000L, "up", 100.0),
        1,
        5,
        true
      )
    );

    assertThat(signal).isNull();
  }

  @Test
  void recognizesClassicNewYorkSilverBulletHours() {
    assertThat(SignalSetupRules.isWithinNewYorkSilverBulletWindow(10)).isTrue();
    assertThat(SignalSetupRules.isWithinNewYorkSilverBulletWindow(14)).isTrue();
    assertThat(SignalSetupRules.isWithinNewYorkSilverBulletWindow(9)).isFalse();
    assertThat(SignalSetupRules.isWithinNewYorkSilverBulletWindow(11)).isFalse();
    assertThat(SignalSetupRules.isWithinNewYorkSilverBulletWindow(15)).isFalse();
    assertThat(SignalSetupRules.isWithinNewYorkSilverBulletWindow(null)).isFalse();
  }

  @Test
  void emitsBullishSilverBulletSignalOnLowSweepAndBullishGapReturn() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildSilverBulletSignal(
      new SignalSetupRules.SilverBulletInput(
        new SignalSetupRules.CandleSnapshot(1_715_600_000_000L, 101.6, 102.6, 101.0, 102.1),
        true,
        "New York",
        "Bullish",
        true,
        false,
        true,
        false,
        new SignalSetupRules.SweepSnapshot(1_715_599_940_000L, "down", 100.9),
        new SignalSetupRules.GapSnapshot("bullish", 101.8, 101.2)
      )
    );

    assertThat(signal).isNotNull();
    assertThat(signal.direction()).isEqualTo("buy");
    assertThat(signal.setup()).isEqualTo("Silver Bullet");
    assertThat(signal.stop()).isCloseTo(100.9, within(1e-9));
    assertThat(signal.tp1()).isCloseTo(103.3, within(1e-9));
    assertThat(signal.tp2()).isCloseTo(104.5, within(1e-9));
  }

  @Test
  void rejectsSilverBulletSignalOutsideGap() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildSilverBulletSignal(
      new SignalSetupRules.SilverBulletInput(
        new SignalSetupRules.CandleSnapshot(1_715_600_000_000L, 102.3, 102.6, 102.1, 102.4),
        true,
        "New York",
        "Bullish",
        true,
        false,
        true,
        false,
        new SignalSetupRules.SweepSnapshot(1_715_599_940_000L, "down", 100.9),
        new SignalSetupRules.GapSnapshot("bullish", 101.8, 101.2)
      )
    );

    assertThat(signal).isNull();
  }

  @Test
  void emitsBearishTurtleSoupSignalAfterHighSweepRejection() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildTurtleSoupSignal(
      new SignalSetupRules.TurtleSoupInput(
        new SignalSetupRules.CandleSnapshot(1_715_700_000_000L, 104.1, 105.4, 103.8, 104.2),
        true,
        true,
        "New York",
        "Bearish",
        false,
        true,
        false,
        true,
        105.0,
        96.0,
        2.0,
        false
      )
    );

    assertThat(signal).isNotNull();
    assertThat(signal.direction()).isEqualTo("sell");
    assertThat(signal.setup()).isEqualTo("Turtle Soup");
    assertThat(signal.price()).isCloseTo(104.2, within(1e-9));
    assertThat(signal.stop()).isCloseTo(105.4, within(1e-9));
    assertThat(signal.tp1()).isCloseTo(103.0, within(1e-9));
    assertThat(signal.tp2()).isCloseTo(101.8, within(1e-9));
  }

  @Test
  void rejectsTurtleSoupSignalOutsideKillZoneContext() {
    SignalSetupRules.SignalSpec signal = SignalSetupRules.buildTurtleSoupSignal(
      new SignalSetupRules.TurtleSoupInput(
        new SignalSetupRules.CandleSnapshot(1_715_700_000_000L, 104.1, 105.4, 103.8, 104.2),
        true,
        false,
        "New York",
        "Bearish",
        false,
        true,
        false,
        true,
        105.0,
        96.0,
        2.0,
        false
      )
    );

    assertThat(signal).isNull();
  }

  private SignalSetupRules.CandleSnapshot candle(long time, double close) {
    return new SignalSetupRules.CandleSnapshot(time, close - 0.3, close + 0.4, close - 0.6, close);
  }
}
