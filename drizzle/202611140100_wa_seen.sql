-- 14-nov-2026: what a photo in a followed chat shows, in words. The day's
-- reading and the agent's search see "[foto: dos cafés en una terraza]"
-- instead of a bare "[foto]". Only the chats in WHATSAPP_FOLLOW get one.
alter table wa_messages add column if not exists seen text;
