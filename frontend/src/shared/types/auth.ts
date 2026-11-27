export type Role = "student" | "rider" | "shop" | "admin";

export interface User {
  id: string;
  full_name?: string | null;
  mobile: string;
  email?: string | null;
  role: Role;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  user: User;
}

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  rider: "Delivery Partner",
  shop: "Printing Shop",
  admin: "Admin",
};
