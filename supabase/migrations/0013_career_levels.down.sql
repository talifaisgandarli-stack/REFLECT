-- Down: 0013. Column + table renamed (PRD §10.2 — never drop user data).
alter table profiles
  rename column career_level_id to _deprecated_career_level_id;
alter table if exists career_levels rename to _archived_career_levels_2026;
