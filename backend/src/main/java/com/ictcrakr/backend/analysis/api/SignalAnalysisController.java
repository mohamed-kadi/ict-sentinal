package com.ictcrakr.backend.analysis.api;

import com.ictcrakr.backend.analysis.service.SignalAnalysisService;
import jakarta.validation.Valid;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/analysis")
public class SignalAnalysisController {

  private final SignalAnalysisService signalAnalysisService;

  public SignalAnalysisController(SignalAnalysisService signalAnalysisService) {
    this.signalAnalysisService = signalAnalysisService;
  }

  @PostMapping("/signals")
  public SignalAnalysisResponse analyzeSignals(@Valid @RequestBody SignalAnalysisRequest request) {
    return signalAnalysisService.analyze(request);
  }
}
