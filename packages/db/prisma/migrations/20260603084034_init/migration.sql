-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SALESPERSON', 'SUPERVISOR', 'BACKOFFICE');

-- CreateEnum
CREATE TYPE "ARStatus" AS ENUM ('CLEAR', 'WARNING', 'OVERDUE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PENDING_APPROVAL', 'APPROVED', 'QUEUED_SYNC', 'SYNCED', 'SYNC_FAILED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('DISCOUNT', 'ORDER_EDIT');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "VisitFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "telegram_username" TEXT,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "supervisor_id" TEXT,
    "acumatica_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_assignments" (
    "id" TEXT NOT NULL,
    "customer_acumatica_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_address" TEXT,
    "customer_phone" TEXT,
    "gps_lat" DECIMAL(10,8),
    "gps_lng" DECIMAL(11,8),
    "salesperson_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "salesperson_id" TEXT NOT NULL,
    "customer_assignment_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "visit_sequence" INTEGER NOT NULL,
    "visit_frequency" "VisitFrequency" NOT NULL DEFAULT 'WEEKLY',

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "sku_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricelist_cache" (
    "id" TEXT NOT NULL,
    "customer_acumatica_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "sku_name" TEXT NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'KARTON',
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricelist_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_cache" (
    "id" TEXT NOT NULL,
    "customer_acumatica_id" TEXT NOT NULL,
    "total_outstanding" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_overdue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "oldest_due_date" TIMESTAMP(3),
    "invoice_count" INTEGER NOT NULL DEFAULT 0,
    "ar_status" "ARStatus" NOT NULL DEFAULT 'CLEAR',
    "synced_at" TIMESTAMP(3) NOT NULL,
    "sync_job_id" TEXT,

    CONSTRAINT "ar_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_invoice_cache" (
    "id" TEXT NOT NULL,
    "customer_acumatica_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "amount_paid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(15,2) NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ar_invoice_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "salesperson_id" TEXT NOT NULL,
    "customer_acumatica_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "checkin_at" TIMESTAMP(3) NOT NULL,
    "checkout_at" TIMESTAMP(3),
    "gps_lat" DECIMAL(10,8),
    "gps_lng" DECIMAL(11,8),
    "out_of_route" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "acumatica_so_number" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sku_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(15,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discount_approved_by" TEXT,
    "discount_approved_at" TIMESTAMP(3),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "assigned_to" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "response_note" TEXT,
    "telegram_msg_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_edit_history" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "edited_by" TEXT NOT NULL,
    "field_path" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL,
    "total_records" INTEGER,
    "success_count" INTEGER,
    "fail_count" INTEGER,
    "error_summary" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_assignments_customer_acumatica_id_salesperson_id_key" ON "customer_assignments"("customer_acumatica_id", "salesperson_id");

-- CreateIndex
CREATE UNIQUE INDEX "routes_salesperson_id_customer_assignment_id_day_of_week_key" ON "routes"("salesperson_id", "customer_assignment_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_id_key" ON "products"("sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "pricelist_cache_customer_acumatica_id_sku_id_key" ON "pricelist_cache"("customer_acumatica_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "ar_cache_customer_acumatica_id_key" ON "ar_cache"("customer_acumatica_id");

-- CreateIndex
CREATE UNIQUE INDEX "ar_invoice_cache_customer_acumatica_id_invoice_number_key" ON "ar_invoice_cache"("customer_acumatica_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_order_id_key" ON "approval_requests"("order_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_assignments" ADD CONSTRAINT "customer_assignments_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_customer_assignment_id_fkey" FOREIGN KEY ("customer_assignment_id") REFERENCES "customer_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricelist_cache" ADD CONSTRAINT "pricelist_cache_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "products"("sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_cache" ADD CONSTRAINT "ar_invoice_cache_customer_acumatica_id_fkey" FOREIGN KEY ("customer_acumatica_id") REFERENCES "ar_cache"("customer_acumatica_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_salesperson_id_fkey" FOREIGN KEY ("salesperson_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "products"("sku_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_edit_history" ADD CONSTRAINT "order_edit_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_edit_history" ADD CONSTRAINT "order_edit_history_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
