-- Reverse of 0003_seed_awards.sql. Idempotent.
delete from system_awards where name in (
  'Azerbaijan Architecture Award',
  'Tamayouz Excellence Award',
  'WAF (World Architecture Festival)',
  'Architizer A+ Award',
  'Dezeen Awards'
);
