import { NextRequest } from 'next/server';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (consider Redis for production)
const rateLimitStore: RateLimitStore = {};

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}, 5 * 60 * 1000);

export interface RateLimitOptions {
  windowMs?: number;  // Time window in milliseconds
  maxRequests?: number;  // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string;  // Function to generate key
}

export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes by default
    maxRequests = 100, // 100 requests per window by default
    keyGenerator = (req) => {
      // Use IP address as key by default
      const ip = req.headers.get('x-forwarded-for') || 
                 req.headers.get('x-real-ip') || 
                 'unknown';
      return ip;
    }
  } = options;
  
  return async function rateLimitMiddleware(request: NextRequest) {
    const key = keyGenerator(request);
    const now = Date.now();
    const resetTime = now + windowMs;
    
    // Initialize or get existing record
    if (!rateLimitStore[key] || rateLimitStore[key].resetTime < now) {
      rateLimitStore[key] = {
        count: 1,
        resetTime: resetTime
      };
      return { success: true, remaining: maxRequests - 1, resetTime };
    }
    
    // Check if limit exceeded
    if (rateLimitStore[key].count >= maxRequests) {
      const retryAfter = Math.ceil((rateLimitStore[key].resetTime - now) / 1000);
      return { 
        success: false, 
        remaining: 0, 
        resetTime: rateLimitStore[key].resetTime,
        retryAfter 
      };
    }
    
    // Increment counter
    rateLimitStore[key].count++;
    
    return { 
      success: true, 
      remaining: maxRequests - rateLimitStore[key].count,
      resetTime: rateLimitStore[key].resetTime
    };
  };
}

// Pre-configured rate limiters for different endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per window for auth
});

export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute for general API
});