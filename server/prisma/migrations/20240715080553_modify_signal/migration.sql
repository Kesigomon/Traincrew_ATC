/*
  Warnings:

  - You are about to drop the `_ClosureToRoute` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `closure` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `closure_distance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `closure_on_routes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `route` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('ONE', 'TWO_A', 'TWO_B', 'THREE_A', 'THREE_B', 'FOUR_A', 'FOUR_B', 'FIVE');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('ROUTE_CLOSED', 'ROUTE_OPENED', 'ROUTE_ENTERING', 'ROUTE_ENTERED');

-- DropForeignKey
ALTER TABLE "_ClosureToRoute" DROP CONSTRAINT "_ClosureToRoute_A_fkey";

-- DropForeignKey
ALTER TABLE "_ClosureToRoute" DROP CONSTRAINT "_ClosureToRoute_B_fkey";

-- DropTable
DROP TABLE "_ClosureToRoute";

-- DropTable
DROP TABLE "closure";

-- DropTable
DROP TABLE "closure_distance";

-- DropTable
DROP TABLE "closure_on_routes";

-- DropTable
DROP TABLE "route";

-- CreateTable
CREATE TABLE "Signal" (
    "name" VARCHAR(100) NOT NULL,
    "order" INTEGER NOT NULL,
    "direction" "Direction" NOT NULL,
    "type" "SignalType" NOT NULL,
    "isClosure" BOOLEAN NOT NULL,
    "diaName" VARCHAR(100),
    "stationStatus" "StationStatus" NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "NextSignal" (
    "id" SERIAL NOT NULL,
    "signalName" VARCHAR(100) NOT NULL,
    "nextSignalName" VARCHAR(100) NOT NULL,

    CONSTRAINT "NextSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NextEnterSignal" (
    "id" SERIAL NOT NULL,
    "signalName" VARCHAR(100) NOT NULL,
    "nextSignalName" VARCHAR(100) NOT NULL,

    CONSTRAINT "NextEnterSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Signal_direction_order_idx" ON "Signal"("direction", "order");

-- CreateIndex
CREATE INDEX "NextSignal_signalName_idx" ON "NextSignal" USING HASH ("signalName");

-- CreateIndex
CREATE UNIQUE INDEX "NextSignal_signalName_nextSignalName_key" ON "NextSignal"("signalName", "nextSignalName");

-- CreateIndex
CREATE INDEX "NextEnterSignal_signalName_idx" ON "NextEnterSignal" USING HASH ("signalName");

-- CreateIndex
CREATE UNIQUE INDEX "NextEnterSignal_signalName_nextSignalName_key" ON "NextEnterSignal"("signalName", "nextSignalName");

-- AddForeignKey
ALTER TABLE "NextSignal" ADD CONSTRAINT "NextSignal_signalName_fkey" FOREIGN KEY ("signalName") REFERENCES "Signal"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextSignal" ADD CONSTRAINT "NextSignal_nextSignalName_fkey" FOREIGN KEY ("nextSignalName") REFERENCES "Signal"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextEnterSignal" ADD CONSTRAINT "NextEnterSignal_signalName_fkey" FOREIGN KEY ("signalName") REFERENCES "Signal"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NextEnterSignal" ADD CONSTRAINT "NextEnterSignal_nextSignalName_fkey" FOREIGN KEY ("nextSignalName") REFERENCES "Signal"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
