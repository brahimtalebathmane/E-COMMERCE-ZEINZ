-- Ensure each object in products.form_fields includes explicit "required" (default false).
-- Application code also normalizes at read time; this keeps stored JSON consistent.

UPDATE products AS p
SET form_fields = agg.new_fields
FROM (
  SELECT
    p2.id,
    (
      SELECT jsonb_agg(
        CASE
          WHEN elem ? 'required' THEN elem
          ELSE elem || '{"required": false}'::jsonb
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(p2.form_fields) WITH ORDINALITY AS t(elem, ord)
    ) AS new_fields
  FROM products p2
  WHERE jsonb_array_length(p2.form_fields) > 0
) AS agg
WHERE p.id = agg.id;
