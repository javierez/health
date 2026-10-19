-- The medical file becomes his history: every visit, test and report, grouped
-- by what it is about ("Cuello", "Orina", "Antecedentes"). Kinds gain visit ·
-- test · pending (still text, no enum to alter). Idempotent, like every file here.

alter table medical add column if not exists topic text;
