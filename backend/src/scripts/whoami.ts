import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.user.findMany({ select: { email: true, createdAt: true }, orderBy: { createdAt: "desc" } })
  .then(r => { console.table(r); return p.$disconnect(); });
