package com.ictcrakr.backend.trading.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ictcrakr.analysis")
public class TradeAnalysisProperties {

  private int minSampleSize = 5;
  private double minWinRate = 0.45;
  private double strongWinRate = 0.60;
  private double strongSizeMultiplier = 1.5;
  private double neutralSizeMultiplier = 1.0;

  public int getMinSampleSize() {
    return minSampleSize;
  }

  public void setMinSampleSize(int minSampleSize) {
    this.minSampleSize = minSampleSize;
  }

  public double getMinWinRate() {
    return minWinRate;
  }

  public void setMinWinRate(double minWinRate) {
    this.minWinRate = minWinRate;
  }

  public double getStrongWinRate() {
    return strongWinRate;
  }

  public void setStrongWinRate(double strongWinRate) {
    this.strongWinRate = strongWinRate;
  }

  public double getStrongSizeMultiplier() {
    return strongSizeMultiplier;
  }

  public void setStrongSizeMultiplier(double strongSizeMultiplier) {
    this.strongSizeMultiplier = strongSizeMultiplier;
  }

  public double getNeutralSizeMultiplier() {
    return neutralSizeMultiplier;
  }

  public void setNeutralSizeMultiplier(double neutralSizeMultiplier) {
    this.neutralSizeMultiplier = neutralSizeMultiplier;
  }
}
