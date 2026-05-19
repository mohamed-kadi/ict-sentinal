package com.ictcrakr.backend;

import com.ictcrakr.backend.trading.config.TradeAnalysisProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(TradeAnalysisProperties.class)
public class IctCrakrBackendApplication {

  public static void main(String[] args) {
    SpringApplication.run(IctCrakrBackendApplication.class, args);
  }
}
