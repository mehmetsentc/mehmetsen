-- P18 feed-v2 reactions — additive reaction type on existing article_likes.
ALTER TABLE "article_likes"
  ADD COLUMN IF NOT EXISTS "reaction" varchar(24) NOT NULL DEFAULT 'LIKE';
