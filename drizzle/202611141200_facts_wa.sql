-- 14-nov-2026: what he told someone on WhatsApp about his body (a meal, a run,
-- a headache), in a chat he follows (WHATSAPP_FOLLOW). The message it came in,
-- as the recordings and the chat have theirs.
alter table facts add column if not exists wa_message_id text;
