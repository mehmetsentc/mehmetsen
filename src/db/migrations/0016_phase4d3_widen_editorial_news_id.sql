-- Phase 4D.3 hotfix — widen draft id column (additive only)
ALTER TABLE "crawler_ai_jobs"
  ALTER COLUMN "editorial_news_id" TYPE varchar(128);
