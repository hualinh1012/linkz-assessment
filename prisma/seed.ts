// Seeds the 3 fixed seats (IDs 1, 2, 3).
// The schema is seat-count agnostic — adding seats means adding rows here, not
// migrating schema (see documentation/TSD/1.3. Database Schema.md §1.7).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.seat.createMany({
    data: [
      { id: 1, label: "Seat A", status: "AVAILABLE" },
      { id: 2, label: "Seat B", status: "AVAILABLE" },
      { id: 3, label: "Seat C", status: "AVAILABLE" },
    ],
    skipDuplicates: true,
  });

  const count = await prisma.seat.count();
  console.log(`Seeded seats. Total seats in DB: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
