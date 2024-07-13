/*
  Warnings:

  - You are about to drop the column `direction` on the `closure` table. All the data in the column will be lost.
  - You are about to drop the column `distance` on the `closure` table. All the data in the column will be lost.
  - You are about to drop the column `order` on the `closure` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "closure_direction_order_idx";

-- AlterTable
ALTER TABLE "closure" DROP COLUMN "direction",
DROP COLUMN "distance",
DROP COLUMN "order";

-- CreateTable
CREATE TABLE "closure_distance" (
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "distance" INTEGER NOT NULL,

    CONSTRAINT "closure_distance_pkey" PRIMARY KEY ("from","to")
);

-- CreateTable
CREATE TABLE "route" (
    "diaName" VARCHAR(20) NOT NULL,

    CONSTRAINT "route_pkey" PRIMARY KEY ("diaName")
);

-- CreateTable
CREATE TABLE "closure_on_routes" (
    "closureName" VARCHAR(100) NOT NULL,
    "diaName" VARCHAR(20) NOT NULL,
    "index" BIGINT NOT NULL,

    CONSTRAINT "closure_on_routes_pkey" PRIMARY KEY ("closureName","diaName")
);

-- CreateTable
CREATE TABLE "_ClosureToRoute" (
    "A" VARCHAR(100) NOT NULL,
    "B" VARCHAR(20) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "closure_on_routes_closureName_diaName_index_key" ON "closure_on_routes"("closureName", "diaName", "index");

-- CreateIndex
CREATE UNIQUE INDEX "_ClosureToRoute_AB_unique" ON "_ClosureToRoute"("A", "B");

-- CreateIndex
CREATE INDEX "_ClosureToRoute_B_index" ON "_ClosureToRoute"("B");

-- AddForeignKey
ALTER TABLE "_ClosureToRoute" ADD CONSTRAINT "_ClosureToRoute_A_fkey" FOREIGN KEY ("A") REFERENCES "closure"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClosureToRoute" ADD CONSTRAINT "_ClosureToRoute_B_fkey" FOREIGN KEY ("B") REFERENCES "route"("diaName") ON DELETE CASCADE ON UPDATE CASCADE;
