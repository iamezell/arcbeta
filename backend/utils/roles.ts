export type UserRole = 'Director' | 'Actor' | 'Audience';

export const ROLES: UserRole[] = ['Director', 'Actor', 'Audience'];

export function isValidRole(role: string): role is UserRole {
  return ROLES.includes(role as UserRole);
}

export function validateRole(role: string): UserRole {
  if (!isValidRole(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${ROLES.join(', ')}`);
  }
  return role;
}

export function getCameraHeight(role: UserRole): number {
  return role === 'Director' ? 3.0 : 1.6;
}

export function canActivateLevel(role: UserRole): boolean {
  return role === 'Director';
}

