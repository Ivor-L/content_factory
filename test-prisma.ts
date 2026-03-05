import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Connecting to Prisma...')
    // Simple query to test connection
    const count = await prisma.replication.count()
    console.log('✅ Successfully connected! Replication count:', count)
  } catch (e) {
    console.error('❌ Connection failed:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
