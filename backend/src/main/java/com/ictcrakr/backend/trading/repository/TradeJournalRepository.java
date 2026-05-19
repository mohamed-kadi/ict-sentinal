package com.ictcrakr.backend.trading.repository;

import com.ictcrakr.backend.trading.domain.TradeJournalEntry;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface TradeJournalRepository
  extends JpaRepository<TradeJournalEntry, UUID>, JpaSpecificationExecutor<TradeJournalEntry> {
}
