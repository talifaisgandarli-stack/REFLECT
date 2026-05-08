-- Seed: 5 awards (PRD §10 / REQ-PROJ-05)
insert into system_awards (name, organizer, deadline_month, url, criteria) values
  ('Azerbaijan Architecture Award', 'Architects Union of Azerbaijan', 11, NULL, 'Built work, AZ-located'),
  ('Tamayouz Excellence Award', 'Tamayouz', 9, NULL, 'MENA architecture'),
  ('WAF (World Architecture Festival)', 'WAF', 5, NULL, 'Built + future projects'),
  ('Architizer A+ Award', 'Architizer', 1, NULL, 'Global, all typologies'),
  ('Dezeen Awards', 'Dezeen', 6, NULL, 'Design + interiors')
on conflict do nothing;
