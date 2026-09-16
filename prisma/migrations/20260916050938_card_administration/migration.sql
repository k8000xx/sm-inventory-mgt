-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registeredNo" TEXT,
    "country" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Issuer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "region" TEXT,
    "vesselImo" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "clientId" TEXT,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "countIntervalDays" INTEGER NOT NULL DEFAULT 90,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "bin" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardType_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cardholder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "rank" TEXT,
    "nationality" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "locationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cardholder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Cardholder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serial" TEXT NOT NULL,
    "maskedPan" TEXT,
    "proxy" TEXT,
    "cardTypeId" TEXT NOT NULL,
    "clientId" TEXT,
    "locationId" TEXT,
    "cardholderId" TEXT,
    "orderLineId" TEXT,
    "status" TEXT NOT NULL,
    "batchRef" TEXT,
    "expiryDate" DATETIME,
    "issuedTo" TEXT,
    "issuedAt" DATETIME,
    "registeredAt" DATETIME,
    "deliveredAt" DATETIME,
    "disposedAt" DATETIME,
    "disposalReason" TEXT,
    "lastVerifiedAt" DATETIME,
    "lastVerifiedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_cardTypeId_fkey" FOREIGN KEY ("cardTypeId") REFERENCES "CardType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Card_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Card_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Card_cardholderId_fkey" FOREIGN KEY ("cardholderId") REFERENCES "Cardholder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Card_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CardOrderLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reference" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "notes" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importBatchId" TEXT,
    "stockCountId" TEXT,
    "cardOrderId" TEXT,
    "deliveryId" TEXT,
    "disposalId" TEXT,
    "registrationBatchId" TEXT,
    CONSTRAINT "Movement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Movement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_cardOrderId_fkey" FOREIGN KEY ("cardOrderId") REFERENCES "CardOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "Disposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movement_registrationBatchId_fkey" FOREIGN KEY ("registrationBatchId") REFERENCES "RegistrationBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "deliverToLocationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orderedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "placedBy" TEXT NOT NULL DEFAULT 'HQ',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardOrder_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Issuer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardOrder_deliverToLocationId_fkey" FOREIGN KEY ("deliverToLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "cardTypeId" TEXT NOT NULL,
    "serialStart" TEXT NOT NULL,
    "serialEnd" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "batchRef" TEXT,
    "expiryDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CardOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardOrderLine_cardTypeId_fkey" FOREIGN KEY ("cardTypeId") REFERENCES "CardType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dispatchedAt" DATETIME,
    "dispatchedBy" TEXT,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "receivedBy" TEXT,
    "carrier" TEXT,
    "trackingRef" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Delivery_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Delivery_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "received" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    CONSTRAINT "DeliveryLine_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryLine_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Disposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "disposedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disposedBy" TEXT NOT NULL,
    "witnessedBy" TEXT,
    "certificateRef" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Disposal_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisposalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disposalId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    CONSTRAINT "DisposalLine_disposalId_fkey" FOREIGN KEY ("disposalId") REFERENCES "Disposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DisposalLine_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegistrationBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PASTE',
    "registeredOn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "notes" TEXT,
    "linesTotal" INTEGER NOT NULL DEFAULT 0,
    "linesRegistered" INTEGER NOT NULL DEFAULT 0,
    "linesSkipped" INTEGER NOT NULL DEFAULT 0,
    "linesRejected" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RegistrationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "cardId" TEXT,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "cardholderRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegistrationLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RegistrationBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RegistrationLine_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "sheetName" TEXT,
    "uploadedBy" TEXT NOT NULL DEFAULT 'HQ',
    "status" TEXT NOT NULL DEFAULT 'COMMITTED',
    "mode" TEXT NOT NULL DEFAULT 'UPSERT',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsErrored" INTEGER NOT NULL DEFAULT 0,
    "mappingJson" TEXT NOT NULL DEFAULT '{}',
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mappingJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "countDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "submittedAt" DATETIME,
    "reconciledAt" DATETIME,
    "reconciledBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCountId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "cardId" TEXT,
    "result" TEXT NOT NULL,
    "systemStatus" TEXT,
    "systemLocationId" TEXT,
    "resolution" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockCountLine_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Issuer_code_key" ON "Issuer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_type_idx" ON "Location"("type");

-- CreateIndex
CREATE INDEX "Location_isActive_idx" ON "Location"("isActive");

-- CreateIndex
CREATE INDEX "Location_clientId_idx" ON "Location"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CardType_code_key" ON "CardType"("code");

-- CreateIndex
CREATE INDEX "CardType_issuerId_idx" ON "CardType"("issuerId");

-- CreateIndex
CREATE INDEX "Cardholder_clientId_idx" ON "Cardholder"("clientId");

-- CreateIndex
CREATE INDEX "Cardholder_lastName_idx" ON "Cardholder"("lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Cardholder_clientId_ref_key" ON "Cardholder"("clientId", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "Card_serial_key" ON "Card"("serial");

-- CreateIndex
CREATE INDEX "Card_status_idx" ON "Card"("status");

-- CreateIndex
CREATE INDEX "Card_locationId_idx" ON "Card"("locationId");

-- CreateIndex
CREATE INDEX "Card_cardTypeId_idx" ON "Card"("cardTypeId");

-- CreateIndex
CREATE INDEX "Card_clientId_idx" ON "Card"("clientId");

-- CreateIndex
CREATE INDEX "Card_cardholderId_idx" ON "Card"("cardholderId");

-- CreateIndex
CREATE INDEX "Card_batchRef_idx" ON "Card"("batchRef");

-- CreateIndex
CREATE INDEX "Card_lastVerifiedAt_idx" ON "Card"("lastVerifiedAt");

-- CreateIndex
CREATE INDEX "Movement_cardId_idx" ON "Movement"("cardId");

-- CreateIndex
CREATE INDEX "Movement_occurredAt_idx" ON "Movement"("occurredAt");

-- CreateIndex
CREATE INDEX "Movement_type_idx" ON "Movement"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CardOrder_reference_key" ON "CardOrder"("reference");

-- CreateIndex
CREATE INDEX "CardOrder_clientId_idx" ON "CardOrder"("clientId");

-- CreateIndex
CREATE INDEX "CardOrder_issuerId_idx" ON "CardOrder"("issuerId");

-- CreateIndex
CREATE INDEX "CardOrder_status_idx" ON "CardOrder"("status");

-- CreateIndex
CREATE INDEX "CardOrderLine_orderId_idx" ON "CardOrderLine"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_reference_key" ON "Delivery"("reference");

-- CreateIndex
CREATE INDEX "Delivery_toLocationId_idx" ON "Delivery"("toLocationId");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "DeliveryLine_deliveryId_idx" ON "DeliveryLine"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryLine_deliveryId_cardId_key" ON "DeliveryLine"("deliveryId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "Disposal_reference_key" ON "Disposal"("reference");

-- CreateIndex
CREATE INDEX "Disposal_locationId_idx" ON "Disposal"("locationId");

-- CreateIndex
CREATE INDEX "DisposalLine_disposalId_idx" ON "DisposalLine"("disposalId");

-- CreateIndex
CREATE UNIQUE INDEX "DisposalLine_disposalId_cardId_key" ON "DisposalLine"("disposalId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationBatch_reference_key" ON "RegistrationBatch"("reference");

-- CreateIndex
CREATE INDEX "RegistrationLine_batchId_idx" ON "RegistrationLine"("batchId");

-- CreateIndex
CREATE INDEX "RegistrationLine_result_idx" ON "RegistrationLine"("result");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_name_key" ON "ImportMapping"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_reference_key" ON "StockCount"("reference");

-- CreateIndex
CREATE INDEX "StockCount_locationId_idx" ON "StockCount"("locationId");

-- CreateIndex
CREATE INDEX "StockCount_status_idx" ON "StockCount"("status");

-- CreateIndex
CREATE INDEX "StockCountLine_stockCountId_idx" ON "StockCountLine"("stockCountId");

-- CreateIndex
CREATE INDEX "StockCountLine_result_idx" ON "StockCountLine"("result");
