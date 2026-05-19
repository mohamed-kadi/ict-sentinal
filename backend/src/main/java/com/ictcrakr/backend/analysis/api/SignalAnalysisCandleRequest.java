package com.ictcrakr.backend.analysis.api;

import jakarta.validation.constraints.NotNull;

public record SignalAnalysisCandleRequest(
  @NotNull Long t,
  @NotNull Double o,
  @NotNull Double h,
  @NotNull Double l,
  @NotNull Double c,
  @NotNull Double v
) {
}
