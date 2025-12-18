import { clerkMiddleware, getAuth, requireAuth } from '@clerk/express'
import { Request, Response, NextFunction } from 'express'

export const clerkAuth = clerkMiddleware()

export const requireUser = requireAuth()

export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req)
  if (auth?.userId) {
    res.locals.userId = auth.userId
  }
  next()
}

export const getUserId = (req: Request): string | null => {
  const auth = getAuth(req)
  return auth?.userId || null
}
