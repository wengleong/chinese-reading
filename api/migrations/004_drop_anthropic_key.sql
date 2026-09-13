-- AI now runs on the server's own ANTHROPIC_API_KEY (Railway variable), so a
-- per-family key is neither read nor settable. Dropping the column also removes
-- any Anthropic credential still sitting in the database.
ALTER TABLE families DROP COLUMN IF EXISTS anthropic_key;
