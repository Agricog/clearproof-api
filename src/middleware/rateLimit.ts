import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import { requireAuth } from '@clerk/express'
import { getUserId } from '../middleware/auth.js'
import { getRecords, createRecord, updateRecord } from '../services/smartsuite.js'
import { checkoutLimiter } from '../middleware/rateLimit.js'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16'
})

const PRICES = {
  starter: 'price_1ShTskAToqHpaZGxCCLQqbWJ',
  professional: 'price_1ShTt6AToqHpaZGx3nEnkI4P',
  enterprise: 'price_1ShTtRAToqHpaZGxmdw4cpbv'
}

const PLAN_LIMITS = {
  free: { modules: 1, verifications: 10 },
  starter: { modules: 5, verifications: 100 },
  professional: { modules: 20, verifications: 500 },
  enterprise: { modules: 50, verifications: 2000 }
}

const FIELDS = {
  userId: 's17078d555',
  plan: 's437c90810',
  status: 'se5cd99576',
  stripeCustomerId: 's78d71e88c',
  stripeSubscriptionId: 's27c292537',
  currentPeriodEnd: 's57461e7d7',
  modulesUsed: 's70770f153',
  verificationsUsed: 's1072aea3a',
  titles: 's6334d9c07'
}

// Email validation regex (OWASP compliant)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254
}

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254)
}

router.get('/subscription', requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req)
    
    const data = await getRecords('subscriptions')
    const subscription = (data.items || []).find(
      (s: Record<string, unknown>) => s[FIELDS.userId] === userId
    )
    
    if (!subscription) {
      return res.json({
        plan: 'free',
        status: 'active',
        limits: PLAN_LIMITS.free,
        usage: { modules: 0, verifications: 0 }
      })
    }
    
    const plan = (subscription[FIELDS.plan] as string) || 'free'
    
    res.json({
      plan,
      status: subscription[FIELDS.status] || 'active',
      currentPeriodEnd: subscription[FIELDS.currentPeriodEnd],
      limits: PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free,
      usage: {
        modules: subscription[FIELDS.modulesUsed] || 0,
        verifications: subscription[FIELDS.verificationsUsed] || 0
      }
    })
  } catch (error) {
    console.error('Get subscription error')
    res.status(500).json({ error: 'Failed to get subscription' })
  }
})

router.post('/checkout', requireAuth(), checkoutLimiter, async (req, res) => {
  try {
    const userId = getUserId(req)
    const { plan, email } = req.body
    
    // Validate plan
    if (!plan || !PRICES[plan as keyof typeof PRICES]) {
      return res.status(400).json({ error: 'Invalid plan' })
    }
    
    // Validate and sanitize email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' })
    }
    
    const sanitizedEmail = sanitizeEmail(email)
    if (!isValidEmail(sanitizedEmail)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }
    
    const data = await getRecords('subscriptions')
    const existing = (data.items || []).find(
      (s: Record<string, unknown>) => s[FIELDS.userId] === userId
    )
    
    let customerId = existing?.[FIELDS.stripeCustomerId] as string | undefined
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: sanitizedEmail,
        metadata: { clerkId: userId ? userId.slice(0, 8) : 'unknown' }
      })
      customerId = customer.id
    }
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: PRICES[plan as keyof typeof PRICES],
        quantity: 1
      }],
      mode: 'subscription',
      success_url: 'https://clearproof.co.uk/dashboard?checkout=success',
      cancel_url: 'https://clearproof.co.uk/pricing?checkout=cancelled',
      metadata: { clerkId: userId ? userId.slice(0, 8) : 'unknown', plan }
    })
    
    res.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error')
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

router.post('/portal', requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req)
    
    const data = await getRecords('subscriptions')
    const subscription = (data.items || []).find(
      (s: Record<string, unknown>) => s[FIELDS.userId] === userId
    )
    
    if (!subscription?.[FIELDS.stripeCustomerId]) {
      return res.status(400).json({ error: 'No subscription found' })
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription[FIELDS.stripeCustomerId] as string,
      return_url: 'https://clearproof.co.uk/dashboard'
    })
    
    res.json({ url: session.url })
  } catch (error) {
    console.error('Portal error')
    res.status(500).json({ error: 'Failed to create portal session' })
  }
})

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  
  let event: Stripe.Event
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (error) {
    console.error('Webhook signature verification failed')
    return res.status(400).send('Webhook signature verification failed')
  }
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const clerkId = session.metadata?.clerkId
        const plan = session.metadata?.plan
        
        if (clerkId && plan) {
          // Find full userId by partial match
          const data = await getRecords('subscriptions')
          let userId = clerkId
          
          // Try to find existing subscription to get full userId
          const customer = await stripe.customers.retrieve(session.customer as string)
          if ((customer as Stripe.Customer).metadata?.userId) {
            userId = (customer as Stripe.Customer).metadata.userId
          }
          
          const existing = (data.items || []).find(
            (s: Record<string, unknown>) => {
              const subUserId = s[FIELDS.userId] as string
              return subUserId && subUserId.startsWith(clerkId)
            }
          )
          
          const subscriptionData = {
            title: `${plan} - ${clerkId}`,
            [FIELDS.titles]: `${plan} subscription`,
            [FIELDS.userId]: existing ? existing[FIELDS.userId] : userId,
            [FIELDS.plan]: plan,
            [FIELDS.status]: 'active',
            [FIELDS.stripeCustomerId]: session.customer as string,
            [FIELDS.stripeSubscriptionId]: session.subscription as string,
            [FIELDS.modulesUsed]: 0,
            [FIELDS.verificationsUsed]: 0
          }
          
          if (existing) {
            await updateRecord('subscriptions', existing.id as string, subscriptionData)
          } else {
            await createRecord('subscriptions', subscriptionData)
          }
        }
        break
      }
      
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        const customer = await stripe.customers.retrieve(customerId)
        const clerkId = (customer as Stripe.Customer).metadata?.clerkId
        
        if (clerkId) {
          const priceId = subscription.items.data[0]?.price.id
          let plan = 'free'
          if (priceId === PRICES.starter) plan = 'starter'
          else if (priceId === PRICES.professional) plan = 'professional'
          else if (priceId === PRICES.enterprise) plan = 'enterprise'
          
          const data = await getRecords('subscriptions')
          const existing = (data.items || []).find(
            (s: Record<string, unknown>) => {
              const subUserId = s[FIELDS.userId] as string
              return subUserId && subUserId.startsWith(clerkId)
            }
          )
          
          const subscriptionData = {
            title: `${plan} - ${clerkId}`,
            [FIELDS.titles]: `${plan} subscription`,
            [FIELDS.userId]: existing ? existing[FIELDS.userId] : clerkId,
            [FIELDS.plan]: plan,
            [FIELDS.status]: subscription.status,
            [FIELDS.stripeCustomerId]: customerId,
            [FIELDS.stripeSubscriptionId]: subscription.id,
            [FIELDS.currentPeriodEnd]: subscription.current_period_end 
              ? new Date(subscription.current_period_end * 1000).toISOString() 
              : null,
            [FIELDS.modulesUsed]: 0,
            [FIELDS.verificationsUsed]: 0
          }
          
          if (existing) {
            await updateRecord('subscriptions', existing.id as string, subscriptionData)
          } else {
            await createRecord('subscriptions', subscriptionData)
          }
        }
        break
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        const data = await getRecords('subscriptions')
        const existing = (data.items || []).find(
          (s: Record<string, unknown>) => s[FIELDS.stripeCustomerId] === customerId
        )
        
        if (existing) {
          const priceId = subscription.items.data[0]?.price.id
          let plan = 'free'
          if (priceId === PRICES.starter) plan = 'starter'
          else if (priceId === PRICES.professional) plan = 'professional'
          else if (priceId === PRICES.enterprise) plan = 'enterprise'
          
          await updateRecord('subscriptions', existing.id as string, {
            [FIELDS.plan]: plan,
            [FIELDS.status]: subscription.status,
            [FIELDS.currentPeriodEnd]: subscription.current_period_end 
              ? new Date(subscription.current_period_end * 1000).toISOString() 
              : null
          })
        }
        break
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        const data = await getRecords('subscriptions')
        const existing = (data.items || []).find(
          (s: Record<string, unknown>) => s[FIELDS.stripeCustomerId] === customerId
        )
        
        if (existing) {
          await updateRecord('subscriptions', existing.id as string, {
            [FIELDS.plan]: 'free',
            [FIELDS.status]: 'cancelled'
          })
        }
        break
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        
        const data = await getRecords('subscriptions')
        const existing = (data.items || []).find(
          (s: Record<string, unknown>) => s[FIELDS.stripeCustomerId] === customerId
        )
        
        if (existing) {
          await updateRecord('subscriptions', existing.id as string, {
            [FIELDS.status]: 'past_due'
          })
        }
        break
      }
    }
    
    res.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error')
    res.status(500).json({ error: 'Webhook processing failed' })
  }
}

export default router
