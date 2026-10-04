ALTER TABLE "List" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "Task" ALTER COLUMN "position" TYPE TEXT COLLATE "C";

ALTER TABLE "Task"
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
  ) STORED;

CREATE INDEX "Task_searchVector_idx" ON "Task" USING GIN ("searchVector");
