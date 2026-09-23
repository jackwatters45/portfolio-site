CREATE TABLE "deviceCode" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "deviceCode" TEXT NOT NULL,
  "userCode" TEXT NOT NULL,
  "userId" TEXT REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "lastPolledAt" INTEGER,
  "pollingInterval" INTEGER,
  "clientId" TEXT,
  "scope" TEXT
);

CREATE UNIQUE INDEX "deviceCode_deviceCode_idx" ON "deviceCode" ("deviceCode");
CREATE UNIQUE INDEX "deviceCode_userCode_idx" ON "deviceCode" ("userCode");
CREATE INDEX "deviceCode_expiresAt_idx" ON "deviceCode" ("expiresAt");
