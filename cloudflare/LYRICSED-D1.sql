-- Execute in Cloudflare D1 database ankino-license-hub (Production).
-- Idempotent: only adds the LYRICSED application, does NOT modify ZAITRKO/COUTIFLOW.
INSERT INTO apps (app_code, app_name, demo_days, status, created_at)
SELECT 'LYRICSED', 'LyriCSED - Chorale Sedera', 0, 'ACTIVE', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM apps WHERE app_code = 'LYRICSED');

SELECT app_code, app_name, demo_days, status FROM apps WHERE app_code='LYRICSED';
