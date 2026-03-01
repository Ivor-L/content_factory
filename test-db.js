import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({});
async function main() {
    try {
        const count = await prisma.product.count();
        console.log('Product count:', count);
    }
    catch (error) {
        console.error('Error connecting to DB:', error);
    }
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
