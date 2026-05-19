package com.ictcrakr.backend.analysis.api;

public record SignalAnalysisSignalResponse(
  long time,
  double price,
  String direction,
  String basis,
  String setup,
  Double stop,
  Double tp1,
  Double tp2,
  Double tp3,
  Double tp4,
  Double sizeMultiplier,
  String session,
  String bias
) {
}
