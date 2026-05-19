package com.ictcrakr.backend.analysis.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record SignalAnalysisRequest(
  @NotBlank String symbol,
  @NotBlank String timeframe,
  @NotEmpty List<@Valid SignalAnalysisCandleRequest> candles,
  Integer signalLimit,
  Boolean optimizerEnabled
) {
}
