import type { PrismaClient } from "@prisma/client";
import type { User } from "@/domain/user";
import type { UserRepository } from "@/application/ports/user-repository";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertByKeycloakId(keycloakId: string, email: string): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      // If a stale record with the same email but a different id exists (e.g. left
      // over from before the keycloak-sub-as-pk migration) and has no reservations,
      // remove it so the upsert below doesn't hit the email unique constraint.
      await tx.user.deleteMany({
        where: { email, NOT: { id: keycloakId } },
      });
      const r = await tx.user.upsert({
        where: { id: keycloakId },
        update: { email },
        create: { id: keycloakId, email },
      });
      return { id: r.id, email: r.email };
    });
  }
}
