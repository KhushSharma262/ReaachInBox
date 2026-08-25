import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { scheduleEmailJob } from "../lib/queue";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirstOrThrow({ orderBy: { createdAt: "desc" } })

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject: "ReachInbox scheduler smoke test",
      body: "If you are reading this in Ethereal, the pipeline works end to end.",
      scheduledStartAt: new Date(),
      minDelayMs: 2000,
      maxPerHour: 3,
      totalRecipients: 5,
      status: "ACTIVE",
    },
  });

  const recipients = ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com"];

  for (let i = 0; i < recipients.length; i++) {
    const row = await prisma.scheduledEmail.create({
      data: {
        campaignId: campaign.id,
        recipientEmail: recipients[i],
        scheduledAt: new Date(Date.now() + i * 2000),
        status: "SCHEDULED",
      },
    });

    await scheduleEmailJob(
      {
        scheduledEmailId: row.id,
        campaignId: campaign.id,
        userId: user.id,
        recipientEmail: recipients[i],
        subject: campaign.subject,
        body: campaign.body,
        maxPerHour: campaign.maxPerHour,
      },
      i * 2000,
    );
  }

  console.log("Enqueued 5 emails. maxPerHour=3 -> expect 3 SENT, 2 RESCHEDULED.");
  await prisma.$disconnect();
  process.exit(0);
}

main();
