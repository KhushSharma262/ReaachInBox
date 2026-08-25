import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.scheduledEmail.findMany({
  select: { recipientEmail: true, status: true, previewUrl: true, errorMessage: true },
  orderBy: { scheduledAt: "asc" },
}).then(r => { console.table(r); return p.$disconnect(); });
