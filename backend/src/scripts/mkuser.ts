import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.user.upsert({
  where: { email: "PUT_YOUR_GOOGLE_EMAIL_HERE" },
  update: {},
  create: { email: "PUT_YOUR_GOOGLE_EMAIL_HERE", name: "Vikrant" },
}).then(u => { console.log("user:", u.id); return p.$disconnect(); });
