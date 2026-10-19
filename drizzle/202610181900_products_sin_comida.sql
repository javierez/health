-- 18-oct-2026, «please don't mix it»: «Piel» keeps the creams and «Comida»
-- the supplements; what he eats or drinks is a meal, not a product. A food or
-- drink saved as a product is retired: the days he took it still count in
-- «Lo que te hace bien y mal».
update products set retired_at = now() where area in ('comida', 'bebida') and retired_at is null;
