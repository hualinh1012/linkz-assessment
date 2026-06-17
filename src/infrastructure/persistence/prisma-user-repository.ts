import type { PrismaClient } from "@prisma/client";
import type { User } from "@/domain/user";
import type { UserRepository } from "@/application/ports/user-repository";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertByKeycloakId(keycloakId: string, email: string): Promise<User> {
    const r = await this.prisma.user.upsert({
      where: { keycloakId },
      update: { email },
      create: { keycloakId, email },
    });
    return { id: r.id, keycloakId: r.keycloakId, email: r.email };
  }
}
