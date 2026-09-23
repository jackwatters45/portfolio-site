CREATE TABLE "public_profile_route" (
  "handle" TEXT PRIMARY KEY COLLATE NOCASE,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE "public_board_route" (
  "publicId" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "boardId" TEXT NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  UNIQUE ("userId", "boardId")
);

CREATE INDEX "public_board_route_userId_idx"
ON "public_board_route" ("userId");
