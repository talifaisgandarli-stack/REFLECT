-- Forecast narrative column — REQ-FIN-08.
-- MIRAI "Maliyyə Analitiki" persona writes a short narrative summary
-- alongside each cash_forecast row so the Finance UI can surface it.
alter table cash_forecasts
  add column if not exists narrative text;
