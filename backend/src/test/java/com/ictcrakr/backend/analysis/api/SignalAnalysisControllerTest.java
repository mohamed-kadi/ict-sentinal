package com.ictcrakr.backend.analysis.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SignalAnalysisControllerTest {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void analyzesCandlesWithServerEngine() throws Exception {
    SignalAnalysisRequest request = new SignalAnalysisRequest(
      "BTCUSDT",
      "1h",
      buildTrendingCandles(),
      25,
      true
    );

    mockMvc.perform(
        post("/api/v1/analysis/signals")
          .contentType("application/json")
          .content(objectMapper.writeValueAsString(request))
      )
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.engineVersion").value("spring-ict-v1"))
      .andExpect(jsonPath("$.bias.label").value("Bullish"))
      .andExpect(jsonPath("$.signals").isArray())
      .andExpect(jsonPath("$.swings").isArray())
      .andExpect(jsonPath("$.gaps").isArray())
      .andExpect(jsonPath("$.orderBlocks").isArray())
      .andExpect(jsonPath("$.structureShifts").isArray())
      .andExpect(jsonPath("$.sweeps").isArray())
      .andExpect(jsonPath("$.equalHighsLows").isArray())
      .andExpect(jsonPath("$.breakerBlocks").isArray())
      .andExpect(jsonPath("$.model2022.strongSwings").isArray())
      .andExpect(jsonPath("$.model2022.obWithDisplacement").isArray())
      .andExpect(jsonPath("$.model2022.dailyLiquidity.last3Highs").isArray())
      .andExpect(jsonPath("$.model2022.m15Signals").isArray())
      .andExpect(jsonPath("$.supportedSetups").isArray());
  }

  private List<SignalAnalysisCandleRequest> buildTrendingCandles() {
    List<SignalAnalysisCandleRequest> candles = new ArrayList<>();
    long start = 1_715_577_600_000L; // 2024-05-10T00:00:00Z
    double price = 100;

    for (int i = 0; i < 72; i++) {
      boolean nyKillZone = i % 24 == 13;
      double open = price;
      double low = nyKillZone ? open - 0.8 : open - 0.2;
      double close = open + 0.55 + (i % 5) * 0.03;
      double high = close + 0.25;
      candles.add(new SignalAnalysisCandleRequest(
        start + i * 3_600_000L,
        open,
        high,
        low,
        close,
        1_000d + i
      ));
      price = close + 0.12;
    }

    return candles;
  }
}
