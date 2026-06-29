#!/usr/bin/env bun
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  console.log('Initializing user goal counts...');
  const users = await db.user.findMany({
    include: {
      _count: {
        select: { goals: true }
      }
    }
  });

  console.log(`Found ${users.length} users. Updating counts...`);

  for (const user of users) {
    const goalCount = user._count.goals;
    await db.user.update({
      where: { id: user.id },
      data: { goalCount }
    });
    console.log(`Updated user ${user.email}: goalCount = ${goalCount}`);
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
