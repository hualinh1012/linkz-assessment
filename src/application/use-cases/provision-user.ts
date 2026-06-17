import type { User } from "@/domain/user";
import type { UserRepository } from "@/application/ports/user-repository";

export interface ProvisionUserInput {
  keycloakId: string;
  email: string;
}

/** Lazily provisions the local user on first authenticated request (TSD/1.5 §3.6). */
export class ProvisionUserUseCase {
  constructor(private readonly users: UserRepository) {}

  execute(input: ProvisionUserInput): Promise<User> {
    return this.users.upsertByKeycloakId(input.keycloakId, input.email);
  }
}
