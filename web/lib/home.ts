import type { Role } from "./api";

export const HOME: Record<Role, string> = { patient: "/patient", doctor: "/doctor", admin: "/admin" };
