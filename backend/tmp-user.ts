import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.user.create({ data: { email: "test@local.dev", name: "Test User", avatarUrl: "https://i.pravatar.cc/100" } })
  .then(u => { console.log("USER ID:", u.id); return p.$disconnect(); });
