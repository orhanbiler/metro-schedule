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

// Production Note: In production, use Firebase Authentication
// These demo accounts are disabled for security
const mockUsers: User[] = [
  // Demo accounts disabled for production security
  // Use Firebase Authentication for user management
];

// Storage for newly registered users
const registeredUsers: User[] = [];
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