import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/enums';

// Dev-only defaults, mirroring the JWT_SECRET fallback pattern already used
// in src/auth/auth.module.ts. Override via ADMIN_EMAIL/ADMIN_PASSWORD/ADMIN_NAME
// env vars for anything beyond local development.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@dressshare.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!dev';
const ADMIN_NAME = process.env.ADMIN_NAME || 'DressShare Admin';

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  const admin = existing
    ? await prisma.user.update({
        where: { email: ADMIN_EMAIL },
        data: {
          role: UserRole.ADMIN,
          passwordHash,
        },
      })
    : await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          name: ADMIN_NAME,
          passwordHash,
          role: UserRole.ADMIN,
        },
      });

  console.log(`Admin user ready: ${admin.email} (id ${admin.id})`);
  console.log(`Dev login -> email: ${ADMIN_EMAIL}  password: ${ADMIN_PASSWORD}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
