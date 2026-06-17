import type { User } from "@/domain/user";

export interface UserRepository {
  /** Lazily provisions the local user on first authenticated request (TSD/1.5 §3.6). */
  upsertByKeycloakId(keycloakId: string, email: string): Promise<User>;
}
