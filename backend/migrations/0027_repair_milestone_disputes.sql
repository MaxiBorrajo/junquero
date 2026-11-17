-- Un reclamo resuelto sobre un hito dejaba el trabajo como cerrado aunque seguía en curso. Se vuelve a "acordado" a los que no se cerraron de verdad.
UPDATE changas SET status = 'agreed'
WHERE status = 'settled'
  AND order_id IS NOT NULL
  AND json_type(spec, '$.milestones') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.order_id = changas.order_id AND e.name IN ('OrderSettled', 'OrderTerminated', 'OrderCancelled'));
