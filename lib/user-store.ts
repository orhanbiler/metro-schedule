// In-memory user storage (for demo purposes)
// In production, this would be replaced with a database

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'user';
  createdAt: string;
}

// Mock users for demo
const mockUsers: User[] = [
  {
    id: 'admin-1',
    email: 'admin@cheverlypd.gov',
    password: 'admin123',
    name: 'Admin User',
    role: 'admin',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-1',
    email: 'officer@cheverlypd.gov',
    password: 'officer123',
    name: 'Officer Smith',
    role: 'user',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user-2',
    email: 'officer2@cheverlypd.gov',
    password: 'officer123',
    name: 'Officer Johnson',
    role: 'user',
    createdAt: new Date().toISOString(),
  },
];

// Storage for newly registered users
let registeredUsers: User[] = [];
let userIdCounter = 3;

export function getAllUsers(): User[] {
  return [...mockUsers, ...registeredUsers];
}

export function findUserByEmail(email: string): User | undefined {
  return getAllUsers().find(user => user.email === email);
}

export function createUser(userData: {
  email: string;
  name: string;
  password: string;
}): User {
  const newUser: User = {
    id: `user-${userIdCounter++}`,
    email: userData.email,
    name: userData.name,
    password: userData.password,
    role: 'user',
    createdAt: new Date().toISOString(),
  };

  registeredUsers.push(newUser);
  return newUser;
}

export function getUserById(id: string): User | undefined {
  return getAllUsers().find(user => user.id === id);
}