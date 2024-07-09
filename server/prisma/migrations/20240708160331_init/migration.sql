-- CreateTable
CREATE TABLE "closure" (
    "name" VARCHAR(100) NOT NULL,
    "direction" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "distance" INTEGER NOT NULL,
    "diaName" TEXT,

    CONSTRAINT "closure_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "closure_direction_order_idx" ON "closure"("direction", "order");

-- CreateIndex
CREATE INDEX "closure_diaName_idx" ON "closure" USING HASH ("diaName");
