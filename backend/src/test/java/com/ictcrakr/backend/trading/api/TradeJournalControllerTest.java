package com.ictcrakr.backend.trading.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ictcrakr.backend.trading.domain.TradeDirection;
import com.ictcrakr.backend.trading.domain.TradeResult;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class TradeJournalControllerTest {

  @Autowired
  private MockMvc mockMvc;

  @Autowired
  private ObjectMapper objectMapper;

  @Test
  void recordsTradesAndAggregatesSetupPerformance() throws Exception {
    var firstTrade = new CreateTradeRequest(
      "BTCUSDT",
      "15m",
      "Bias + OB/FVG + Session",
      "New York",
      "Bullish",
      TradeDirection.BUY,
      TradeResult.WIN,
      new BigDecimal("2.25"),
      new BigDecimal("104325.10"),
      new BigDecimal("104980.25"),
      new BigDecimal("104050.00"),
      new BigDecimal("104875.00"),
      Instant.parse("2026-05-19T13:30:00Z"),
      Instant.parse("2026-05-19T15:00:00Z")
    );

    var secondTrade = new CreateTradeRequest(
      "BTCUSDT",
      "15m",
      "Bias + OB/FVG + Session",
      "London",
      "Bullish",
      TradeDirection.BUY,
      TradeResult.LOSS,
      new BigDecimal("-1.00"),
      new BigDecimal("104500.00"),
      new BigDecimal("104250.00"),
      new BigDecimal("104650.00"),
      new BigDecimal("104900.00"),
      Instant.parse("2026-05-20T07:30:00Z"),
      Instant.parse("2026-05-20T08:15:00Z")
    );

    mockMvc.perform(
        post("/api/v1/trades")
          .contentType("application/json")
          .content(objectMapper.writeValueAsString(firstTrade))
      )
      .andExpect(status().isCreated());

    mockMvc.perform(
        post("/api/v1/trades")
          .contentType("application/json")
          .content(objectMapper.writeValueAsString(secondTrade))
      )
      .andExpect(status().isCreated());

    mockMvc.perform(
        get("/api/v1/trades/performance")
          .param("symbol", "btcusdt")
          .param("timeframe", "15m")
      )
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.totalTrades").value(2))
      .andExpect(jsonPath("$.wins").value(1))
      .andExpect(jsonPath("$.losses").value(1))
      .andExpect(jsonPath("$.winRate").value(0.5))
      .andExpect(jsonPath("$.setups['Bias + OB/FVG + Session'].totalTrades").value(2))
      .andExpect(jsonPath("$.setups['Bias + OB/FVG + Session'].wins").value(1))
      .andExpect(jsonPath("$.setups['Bias + OB/FVG + Session'].losses").value(1))
      .andExpect(jsonPath("$.setups['Bias + OB/FVG + Session'].allowed").value(true))
      .andExpect(jsonPath("$.setups['Bias + OB/FVG + Session'].sizeMultiplier").value(1.0));

    mockMvc.perform(
        get("/api/v1/trades")
          .param("symbol", "btcusdt")
          .param("timeframe", "15m")
          .param("limit", "1")
      )
      .andExpect(status().isOk())
      .andExpect(jsonPath("$.totalEntries").value(2))
      .andExpect(jsonPath("$.entries.length()").value(1))
      .andExpect(jsonPath("$.entries[0].symbol").value("BTCUSDT"))
      .andExpect(jsonPath("$.entries[0].timeframe").value("15M"))
      .andExpect(jsonPath("$.entries[0].session").value("London"))
      .andExpect(jsonPath("$.entries[0].result").value("LOSS"))
      .andExpect(jsonPath("$.entries[0].rMultiple").value(-1.00));
  }
}
