// Input sanitization utilities for security

export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove any HTML tags and script content
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function sanitizeEmail(email: unknown): string {
  if (typeof email !== 'string') {
    return '';
  }
  
  // Basic email sanitization and validation
  const sanitized = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(sanitized) ? sanitized : '';
}

export function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') {
    return '';
  }
  
  // Allow only letters, spaces, hyphens, and apostrophes
  return name
    .replace(/[^a-zA-Z\s\-']/g, '')
    .trim()
    .substring(0, 100); // Limit length
}

export function sanitizeIdNumber(id: unknown): string {
  if (typeof id !== 'string') {
    return '';
  }
  
  // Allow only alphanumeric characters
  return id
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .substring(0, 20);
}

export function sanitizePassword(password: unknown): string {
  if (typeof password !== 'string') {
    return '';
  }
  
  // Don't modify passwords but ensure they're strings and within reasonable length
  return password.substring(0, 200);
}

export function sanitizeScheduleInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  
  // Sanitize schedule-specific fields
  const sanitized: Record<string, unknown> = {};
  const inputObj = input as Record<string, unknown>;
  
  if (inputObj.month !== undefined) {
    const month = parseInt(String(inputObj.month), 10);
    sanitized.month = (month >= 0 && month <= 11) ? month : null;
  }
  
  if (inputObj.year !== undefined) {
    const year = parseInt(String(inputObj.year), 10);
    sanitized.year = (year >= 2020 && year <= 2100) ? year : null;
  }
  
  if (inputObj.dayId !== undefined) {
    sanitized.dayId = sanitizeString(inputObj.dayId);
  }
  
  if (inputObj.slotType !== undefined) {
    sanitized.slotType = ['morningSlot', 'afternoonSlot'].includes(inputObj.slotType as string) 
      ? inputObj.slotType 
      : null;
  }
  
  if (inputObj.officerName !== undefined) {
    sanitized.officerName = sanitizeName(inputObj.officerName);
  }
  
  if (inputObj.customStartTime !== undefined) {
    sanitized.customStartTime = sanitizeString(inputObj.customStartTime).substring(0, 10);
  }
  
  if (inputObj.customEndTime !== undefined) {
    sanitized.customEndTime = sanitizeString(inputObj.customEndTime).substring(0, 10);
  }
  
  return sanitized;
}

export function sanitizeChangelogInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  
  const sanitized: Record<string, unknown> = {};
  const inputObj = input as Record<string, unknown>;
  
  if (inputObj.title !== undefined) {
    sanitized.title = sanitizeString(inputObj.title).substring(0, 200);
  }
  
  if (inputObj.type !== undefined) {
    const validTypes = ['feature', 'fix', 'improvement', 'security', 'update', 'maintenance', 'performance', 'ui', 'breaking'];
    sanitized.type = validTypes.includes(inputObj.type as string) ? inputObj.type : 'update';
  }
  
  if (inputObj.changes !== undefined && Array.isArray(inputObj.changes)) {
    sanitized.changes = (inputObj.changes as unknown[])
      .slice(0, 20) // Limit to 20 changes
      .map(change => sanitizeString(change).substring(0, 500));
  }
  
  return sanitized;
}

// General purpose input sanitizer
export function sanitizeInput(input: unknown, type: 'string' | 'email' | 'name' | 'number' | 'boolean' = 'string'): unknown {
  switch (type) {
    case 'email':
      return sanitizeEmail(input);
    case 'name':
      return sanitizeName(input);
    case 'number':
      const num = parseInt(String(input), 10);
      return isNaN(num) ? 0 : num;
    case 'boolean':
      return Boolean(input);
    default:
      return sanitizeString(input);
  }
}