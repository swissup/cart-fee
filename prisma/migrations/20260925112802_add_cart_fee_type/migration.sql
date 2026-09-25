/*
  Warnings:

  - The primary key for the `CartFeeSettings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `CartFeeSettings` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CartFeeSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL DEFAULT 'Handling fee',
    "type" TEXT NOT NULL DEFAULT 'percentage',
    "value" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CartFeeSettings" ("createdAt", "enabled", "id", "shop", "title", "updatedAt", "value") SELECT "createdAt", "enabled", "id", "shop", "title", "updatedAt", "value" FROM "CartFeeSettings";
DROP TABLE "CartFeeSettings";
ALTER TABLE "new_CartFeeSettings" RENAME TO "CartFeeSettings";
CREATE UNIQUE INDEX "CartFeeSettings_shop_key" ON "CartFeeSettings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
