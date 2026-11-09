-- Keep article media admission and media tombstoning mutually exclusive.
CREATE TRIGGER IF NOT EXISTS media_objects_block_live_article_tombstone
BEFORE UPDATE OF deleted_at ON media_objects
WHEN OLD.deleted_at IS NULL
  AND NEW.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM baiviet
    WHERE anh_url IN (
      NEW.object_key,
      '/api/media/' || NEW.object_key,
      'https://media.quangtu.vn/' || NEW.object_key
    ) OR pdf_url IN (
      NEW.object_key,
      '/api/media/' || NEW.object_key,
      'https://media.quangtu.vn/' || NEW.object_key
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'live_article_media_reference');
END;

CREATE TRIGGER IF NOT EXISTS baiviet_validate_active_media_insert
BEFORE INSERT ON baiviet
WHEN (
  (NEW.anh_url GLOB 'covers/*' OR NEW.anh_url GLOB 'content/*' OR NEW.anh_url GLOB 'pdfs/*'
    OR NEW.anh_url GLOB '/api/media/*' OR NEW.anh_url GLOB 'https://media.quangtu.vn/*')
  AND NOT EXISTS (
    SELECT 1 FROM media_objects
    WHERE deleted_at IS NULL
      AND NEW.anh_url IN (object_key, '/api/media/' || object_key, 'https://media.quangtu.vn/' || object_key)
  )
) OR (
  (NEW.pdf_url GLOB 'covers/*' OR NEW.pdf_url GLOB 'content/*' OR NEW.pdf_url GLOB 'pdfs/*'
    OR NEW.pdf_url GLOB '/api/media/*' OR NEW.pdf_url GLOB 'https://media.quangtu.vn/*')
  AND NOT EXISTS (
    SELECT 1 FROM media_objects
    WHERE deleted_at IS NULL
      AND NEW.pdf_url IN (object_key, '/api/media/' || object_key, 'https://media.quangtu.vn/' || object_key)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'inactive_article_media_reference');
END;

CREATE TRIGGER IF NOT EXISTS baiviet_validate_active_media_update
BEFORE UPDATE OF anh_url, pdf_url ON baiviet
WHEN (
  (NEW.anh_url GLOB 'covers/*' OR NEW.anh_url GLOB 'content/*' OR NEW.anh_url GLOB 'pdfs/*'
    OR NEW.anh_url GLOB '/api/media/*' OR NEW.anh_url GLOB 'https://media.quangtu.vn/*')
  AND NOT EXISTS (
    SELECT 1 FROM media_objects
    WHERE deleted_at IS NULL
      AND NEW.anh_url IN (object_key, '/api/media/' || object_key, 'https://media.quangtu.vn/' || object_key)
  )
) OR (
  (NEW.pdf_url GLOB 'covers/*' OR NEW.pdf_url GLOB 'content/*' OR NEW.pdf_url GLOB 'pdfs/*'
    OR NEW.pdf_url GLOB '/api/media/*' OR NEW.pdf_url GLOB 'https://media.quangtu.vn/*')
  AND NOT EXISTS (
    SELECT 1 FROM media_objects
    WHERE deleted_at IS NULL
      AND NEW.pdf_url IN (object_key, '/api/media/' || object_key, 'https://media.quangtu.vn/' || object_key)
  )
)
BEGIN
  SELECT RAISE(ABORT, 'inactive_article_media_reference');
END;
