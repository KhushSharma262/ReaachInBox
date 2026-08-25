import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.scheduledEmail.deleteMany({}).then(() => p.campaign.deleteMany({})).then(() => { console.log("cleared"); return p.$disconnect(); });
