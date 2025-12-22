export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'tutor' | 'admin';
  createdAt: Date;
}

export type CreateUserDTO = Omit<User, 'id' | 'createdAt'>;