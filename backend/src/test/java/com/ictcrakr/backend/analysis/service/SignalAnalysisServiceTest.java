package com.ictcrakr.backend.analysis.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ictcrakr.backend.analysis.api.SignalAnalysisCandleRequest;
import com.ictcrakr.backend.analysis.api.SignalAnalysisRequest;
import com.ictcrakr.backend.analysis.api.SignalAnalysisResponse;
import com.ictcrakr.backend.trading.service.TradeJournalService;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class SignalAnalysisServiceTest {

  private SignalAnalysisService service;

  @BeforeEach
  void setUp() {
    service = new SignalAnalysisService(Mockito.mock(TradeJournalService.class));
  }

  @Test
  void detectsClassicBullishFairValueGap() {
    List<SignalAnalysisCandleRequest> candles = List.of(
      candle(1_715_299_200_000L, 100.0, 101.0, 99.0, 100.5),
      candle(1_715_302_800_000L, 101.5, 104.0, 101.2, 103.8),
      candle(1_715_306_400_000L, 104.2, 105.0, 102.5, 104.8)
    );

    SignalAnalysisResponse response = service.analyze(new SignalAnalysisRequest(
      "BTCUSDT",
      "1h",
      candles,
      25,
      false
    ));

    assertThat(response.gaps())
      .singleElement()
      .satisfies((gap) -> {
        assertThat(gap.type()).isEqualTo("bullish");
        assertThat(gap.top()).isEqualTo(101.0);
        assertThat(gap.bottom()).isEqualTo(102.5);
      });
  }

  @Test
  void emitsBullishPullbackReentryDuringSecondDayTrend() {
    List<SignalAnalysisCandleRequest> candles = new ArrayList<>();
    long start = 1_715_299_200_000L; // 2024-05-10T00:00:00Z
    double price = 100.0;

    for (int i = 0; i < 24; i++) {
      double open = price;
      double close = open + 0.45;
      double high = close + 0.20;
      double low = open - 0.15;
      candles.add(candle(start + i * 3_600_000L, open, high, low, close));
      price = close + 0.05;
    }

    for (int i = 24; i < 27; i++) {
      double open = price;
      double close = open + 0.40;
      double high = close + 0.18;
      double low = open - 0.12;
      candles.add(candle(start + i * 3_600_000L, open, high, low, close));
      price = close + 0.04;
    }

    SignalAnalysisCandleRequest previous = candles.get(candles.size() - 1);
    double finalOpen = price + 0.05;
    double finalLow = previous.l() - 0.35;
    double finalClose = finalOpen + 0.55;
    double finalHigh = finalClose + 0.10;
    candles.add(candle(start + 27 * 3_600_000L, finalOpen, finalHigh, finalLow, finalClose));

    SignalAnalysisResponse response = service.analyze(new SignalAnalysisRequest(
      "BTCUSDT",
      "1h",
      candles,
      50,
      false
    ));

    assertThat(response.bias().label()).isEqualTo("Bullish");
    assertThat(response.signals())
      .anySatisfy((signal) -> {
        assertThat(signal.setup()).isEqualTo("Pullback Reentry");
        assertThat(signal.direction()).isEqualTo("buy");
        assertThat(signal.bias()).isEqualTo("Bullish");
      });
  }

  private SignalAnalysisCandleRequest candle(long time, double open, double high, double low, double close) {
    return new SignalAnalysisCandleRequest(time, open, high, low, close, 1_000d);
  }
}
