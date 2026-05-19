create table trade_journal_entries (
  id uuid primary key,
  symbol varchar(32) not null,
  timeframe varchar(16) not null,
  setup_name varchar(128) not null,
  session_name varchar(64),
  market_bias varchar(32),
  direction varchar(8) not null,
  result varchar(8) not null,
  r_multiple numeric(10, 4) not null,
  entry_price numeric(18, 8),
  exit_price numeric(18, 8),
  stop_price numeric(18, 8),
  take_profit_price numeric(18, 8),
  executed_at timestamp with time zone not null,
  closed_at timestamp with time zone not null,
  created_at timestamp with time zone not null
);

create index idx_trade_journal_symbol_timeframe
  on trade_journal_entries (symbol, timeframe);

create index idx_trade_journal_closed_at
  on trade_journal_entries (closed_at desc);

create index idx_trade_journal_setup_name
  on trade_journal_entries (setup_name);
