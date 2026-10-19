-- How each spoken conversation went and what it was about, the same two lists
-- as a WhatsApp chat (wa_days.chats): buena/neutra/tensa/mala and
-- Clientes/Socio/Equipo/... So the two sources add up in «Conversaciones».
alter table episodes add column if not exists tone text;
alter table episodes add column if not exists theme text;
alter table episodes add column if not exists effect text;
-- TONES_VERSION of the last pass over the recording. Null = not read yet.
alter table recordings add column if not exists tones_version text;
