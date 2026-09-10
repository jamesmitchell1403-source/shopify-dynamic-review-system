import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

const prisma = global.prismaGlobal || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

let initPromise: Promise<void> | null = null;

export async function ensureTablesExist() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS Session (
            id TEXT PRIMARY KEY,
            shop TEXT NOT NULL,
            state TEXT NOT NULL,
            isOnline INTEGER NOT NULL DEFAULT 0,
            scope TEXT,
            expires DATETIME,
            accessToken TEXT NOT NULL,
            userId BIGINT,
            firstName TEXT,
            lastName TEXT,
            email TEXT,
            accountOwner INTEGER NOT NULL DEFAULT 0,
            locale TEXT,
            collaborator INTEGER DEFAULT 0,
            emailVerified INTEGER DEFAULT 0,
            refreshToken TEXT,
            refreshTokenExpires DATETIME
          );
        `);

        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS ShopSettings (
            id TEXT PRIMARY KEY,
            shop TEXT UNIQUE NOT NULL,
            defaultAiProvider TEXT DEFAULT 'claude',
            anthropicApiKey TEXT,
            geminiApiKey TEXT,
            widgetPosition TEXT DEFAULT 'bottom-left',
            widgetLayoutStyle TEXT DEFAULT 'layout-1',
            widgetDelaySeconds INTEGER DEFAULT 4,
            widgetDisplayDuration INTEGER DEFAULT 7,
            widgetRotationInterval INTEGER DEFAULT 12,
            widgetMaxPerSession INTEGER DEFAULT 10,
            widgetEnabled INTEGER DEFAULT 1,
            autoApproveImported INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS Review (
            id TEXT PRIMARY KEY,
            shop TEXT NOT NULL,
            productId TEXT NOT NULL,
            productHandle TEXT,
            reviewerName TEXT DEFAULT 'Verified Customer',
            rating INTEGER DEFAULT 5,
            bodyShort TEXT NOT NULL,
            bodyFull TEXT,
            source TEXT DEFAULT 'MANUAL',
            externalUrl TEXT,
            isAiGenerated INTEGER DEFAULT 0,
            isPublished INTEGER DEFAULT 0,
            isVerifiedPurchase INTEGER DEFAULT 0,
            language TEXT DEFAULT 'en',
            tags TEXT DEFAULT '[]',
            orderId TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS ImportBatch (
            id TEXT PRIMARY KEY,
            shop TEXT NOT NULL,
            sourceType TEXT NOT NULL,
            fileName TEXT NOT NULL,
            status TEXT DEFAULT 'processing',
            totalRows INTEGER DEFAULT 0,
            successRows INTEGER DEFAULT 0,
            failedRows INTEGER DEFAULT 0,
            unmatched TEXT DEFAULT '[]',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS QrCodeRecord (
            id TEXT PRIMARY KEY,
            shop TEXT NOT NULL,
            type TEXT NOT NULL,
            productId TEXT,
            orderId TEXT,
            targetUrl TEXT NOT NULL,
            imageUrl TEXT NOT NULL,
            scans INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS AiGenerationJob (
            id TEXT PRIMARY KEY,
            shop TEXT NOT NULL,
            productId TEXT,
            inputImageUrl TEXT,
            inputDescription TEXT,
            inputNotes TEXT,
            language TEXT DEFAULT 'en',
            provider TEXT DEFAULT 'claude',
            modelUsed TEXT,
            status TEXT DEFAULT 'completed',
            resultCount INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS CustomerPreference (
            id TEXT PRIMARY KEY,
            shop TEXT NOT NULL,
            customerId TEXT,
            quizAnswers TEXT DEFAULT '{}',
            derivedTags TEXT DEFAULT '[]',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Automatically purge all sessions on startup to guarantee fresh App Bridge token exchange with latest scopes
        await prisma.$executeRawUnsafe(`DELETE FROM Session;`);
      } catch (err) {
        console.error("Auto table init warning:", err);
      }
    })();
  }
  return initPromise;
}

ensureTablesExist();

export default prisma;
