import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.user.deleteMany({ where: { email: { in: ["PUT_YOUR_GOOGLE_EMAIL_HERE", "test@local.dev"] } } })
  .then(r => { console.log("removed:", r.count); return p.$disconnect(); });
