import { z } from 'zod'

export const createModuleSchema = z.object({
  title: z.string().min(1).max(200),
  original_content: z.string().min(1),
  file_name: z.string().min(1).max(200),
  status: z.enum(['processing', 'ready', 'error']).optional()
})

export const updateModuleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  processed_content: z.string().optional(),
  questions: z.string().optional(),
  status: z.enum(['processing', 'ready', 'error']).optional()
})

export const createWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  worker_id: z.string().min(1).max(50),
  phone: z.string().max(20).optional(),
  preferred_language: z.string().max(10).optional()
})

export const createVerificationSchema = z.object({
  module_id: z.string().min(1),
  worker_name: z.string().min(1).max(100),
  worker_id: z.string().min(1).max(50),
  language_used: z.string().min(1).max(10),
  answers: z.string().optional(),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  completed_at: z.string()
})

export const translateSchema = z.object({
  content: z.string().min(1),
  language: z.string().min(1).max(50)
})

export const questionsSchema = z.object({
  content: z.string().min(1),
  language: z.string().max(50).optional()
})
