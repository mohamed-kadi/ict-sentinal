package com.ictcrakr.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebCorsConfig implements WebMvcConfigurer {

  @Value("${ictcrakr.frontend-origin:http://localhost:3000}")
  private String frontendOrigin;

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
      .addMapping("/api/v1/**")
      .allowedOrigins(frontendOrigin)
      .allowedMethods("GET", "POST", "OPTIONS")
      .allowedHeaders("*");
  }
}
