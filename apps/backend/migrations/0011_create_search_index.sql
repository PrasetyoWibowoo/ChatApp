-- Add full-text search index for messages
CREATE INDEX IF NOT EXISTS messages_search_idx ON messages USING gin(to_tsvector('english', content));
