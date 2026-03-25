-- CreateTable
CREATE TABLE "writing_styles" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "extraction_status" TEXT NOT NULL DEFAULT 'IDLE',
    "current_profile_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_style_documents" (
    "id" UUID NOT NULL,
    "style_id" UUID NOT NULL,
    "user_id" UUID,
    "title" TEXT NOT NULL,
    "channel" TEXT,
    "source_type" TEXT,
    "original_path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_style_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_style_chunks" (
    "id" UUID NOT NULL,
    "style_id" UUID NOT NULL,
    "document_id" UUID,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_length" INTEGER NOT NULL DEFAULT 0,
    "card_type" TEXT,
    "risk_level" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_style_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_style_profiles" (
    "id" UUID NOT NULL,
    "style_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "profile_json" JSONB,
    "sample_gaps" TEXT,
    "sample_improvement" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writing_styles_current_profile_id_key" ON "writing_styles"("current_profile_id");

-- CreateIndex
CREATE INDEX "writing_style_documents_style_created_at_idx" ON "writing_style_documents"("style_id", "created_at");

-- CreateIndex
CREATE INDEX "writing_style_chunks_style_created_at_idx" ON "writing_style_chunks"("style_id", "created_at");

-- CreateIndex
CREATE INDEX "writing_style_chunks_document_chunk_index_idx" ON "writing_style_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "writing_style_profiles_style_version_key" ON "writing_style_profiles"("style_id", "version");

-- CreateIndex
CREATE INDEX "writing_style_profiles_style_created_at_idx" ON "writing_style_profiles"("style_id", "created_at");

-- AddForeignKey
ALTER TABLE "writing_style_documents"
ADD CONSTRAINT "writing_style_documents_style_id_fkey"
FOREIGN KEY ("style_id") REFERENCES "writing_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_style_chunks"
ADD CONSTRAINT "writing_style_chunks_style_id_fkey"
FOREIGN KEY ("style_id") REFERENCES "writing_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_style_chunks"
ADD CONSTRAINT "writing_style_chunks_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "writing_style_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_style_profiles"
ADD CONSTRAINT "writing_style_profiles_style_id_fkey"
FOREIGN KEY ("style_id") REFERENCES "writing_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writing_styles"
ADD CONSTRAINT "writing_styles_current_profile_id_fkey"
FOREIGN KEY ("current_profile_id") REFERENCES "writing_style_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
