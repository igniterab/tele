-- CreateIndex
CREATE INDEX "kb_articles_searchVector_idx" ON "kb_articles" USING GIN ("searchVector");
