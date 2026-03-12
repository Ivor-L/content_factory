/**
 * 租户数据初始化脚本
 * 
 * 运行方式: npx tsx scripts/init-tenants.ts
 * 
 * 或直接在 Prisma Studio 中操作:
 * npx prisma studio
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化租户数据...');

  // 创建租户 1: 跨境出海 (crossborder)
  const crossborder = await prisma.tenant.upsert({
    where: { slug: 'crossborder' },
    update: {},
    create: {
      name: 'AtomX',
      slug: 'crossborder',
      logo: null, // TODO: 提供 Logo
      primaryColor: '#007AFF',
    },
  });
  console.log(`创建租户: ${crossborder.name} (${crossborder.slug})`);

  // 创建租户 2: 保险 (insurance)
  const insurance = await prisma.tenant.upsert({
    where: { slug: 'insurance' },
    update: {},
    create: {
      name: '保险助手',
      slug: 'insurance',
      logo: null, // TODO: 提供 Logo
      primaryColor: '#52C41A',
    },
  });
  console.log(`创建租户: ${insurance.name} (${insurance.slug})`);

  // 创建租户 3: 企业版 (enterprise)
  const enterprise = await prisma.tenant.upsert({
    where: { slug: 'enterprise' },
    update: {},
    create: {
      name: '企业版',
      slug: 'enterprise',
      logo: null, // TODO: 提供 Logo
      primaryColor: '#722ED1',
    },
  });
  console.log(`创建租户: ${enterprise.name} (${enterprise.slug})`);

  // 获取所有现有用户
  const users = await prisma.users.findMany({
    select: { id: true },
  });
  console.log(`\n发现 ${users.length} 个现有用户`);

  // 为每个用户关联默认租户 (crossborder)
  for (const user of users) {
    const existing = await prisma.tenant_user.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: crossborder.id,
        },
      },
    });

    if (!existing) {
      await prisma.tenant_user.create({
        data: {
          userId: user.id,
          tenantId: crossborder.id,
          role: 'owner',
        },
      });
      console.log(`用户 ${user.id} 已关联到租户 ${crossborder.name}`);
    }
  }

  console.log('\n✅ 租户初始化完成！');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
