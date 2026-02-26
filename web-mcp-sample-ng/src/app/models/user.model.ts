export type UserStatus = 'active' | 'pending' | 'inactive';

export interface User {
  readonly id: string;
  name: string;
  email: string;
  role: string;
  status: UserStatus;
  avatar: string;
  lastLogin: string;
}
