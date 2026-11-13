-- 25-oct-2026, «litros de agua que tomo»: the water commitment was a tick
-- with a target of 2 that one tick (worth 1) could never meet, read as litres
-- one day and glasses the next. Now it is litres a day, added up from what he
-- says he drank (`waterMl` on his meals), and never ticked.
update commitments set activities = '{water}', metric = 'liters', proof = 'auto'
where active and lower(title) = 'agua' and metric = 'sessions' and activities = '{}';
