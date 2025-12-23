import { Router } from 'express'
import Stripe from 'stripe'
import { requireAuth } from '@clerk/express'
import { getUserId } from '../middleware/auth.js'
import { getRecords, createRecord, updateRecord } from '../services/smartsuite.js'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia'
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

// Get subscription status for current user
router.get('/subscription', requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req)
    
    const data = await getRecords('subscriptions')
    const subscription = (data.items || []).find(
      (s: Record<string, unknown>) => s.sf8a3b2c1d === userId
    )
    
    if (!subscription) {
      return res.json({
        plan: 'free',
        status: 'active',
        limits: PLAN_LIMITS.free,
        usage: { modules: 0, verifications: 0 }
      })
    }
    
    const plan = (subscription.s1a2b3c4d5 as string) || 'free'
    
    res.json({
      plan,
      status: subscription.s2b3c4d5e6 || 'active',
      stripeCustomerId: subscription.s3c4d5e6f7,
      currentPeriodEnd: subscription.s5e6f7g8h9,
      limits: PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free,
      usage: {
        modules: subscription.s6f7g8h9i0 || 0,
        verifications: subscription.s7g8h9i0j1 || 0
      }
    })
  } catch (error) {
    console.error('Get subscription error:', error)
    res.status(500).json({ error: 'Failed to get subscription' })
  }
})

// Create checkout session
router.post('/checkout', requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req)
    const { plan, email } = req.body
    
    if (!plan || !PRICES[plan as keyof typeof PRICES]) {
      return res.status(400).json({ error: 'Invalid plan' })
    }
    
    // Check for existing customer
    const data = await getRecords('subscriptions')
    const existing = (data.items || []).find(
      (s: Record<string, unknown>) => s.sf8a3b2c1d === userId
    )
    
    let customerId = existing?.s3c4d5e6f7 as string | undefined
    
    // Create new customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId }
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
      success_url: `https://clearproof.co.uk/dashboard?checkout=success`,
      cancel_url: `https://clearproof.co.uk/pricing?checkout=cancelled`,
      metadata: { userId, plan }
    })
    
    res.json({ url: session.url })
  } catch (error) {
    console.error('Checkout error:', error)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// Customer portal for managing subscription
router.post('/portal', requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req)
    
    const data = await getRecords('subscriptions')
    const subscription = (data.items || []).find(
      (s: Record<string, unknown>) => s.sf8a3b2c1d === userId
    )
    
    if (!subscription?.s3c4d5e6f7) {
      return res.status(400).json({ error: 'No subscription found' })
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.s3c4d5e6f7 as string,
      return_url: 'https://clearproof.co.uk/dashboard'
    })
    
    res.json({ url: session.url })
  } catch (error) {
    console.error('Portal error:', error)
    res.status(500).json({ error: 'Failed to create portal session' })
  }
})

// Stripe webhook
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  
  let event: Stripe.Event
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
  } catch (error) {
    console.error('Webhook signature error:', error)
    return res.status(400).send('Webhook signature verification failed')
  }
  
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const plan = session.metadata?.plan
        
        if (userId && plan) {
          // Check if subscription record exists
          const data = await getRecords('subscriptions')
          const existing = (data.items || []).find(
            (s: Record<string, unknown>) => s.sf8a3b2c1d === userId
          )
          
          const subscriptionData = {
            title: `${plan} - ${userId}`,
            sf8a3b2c1d: userId,
            s1a2b3c4d5: plan,
            s2b3c4d5e6: 'active',
            s3c4d5e6f7: session.customer as string,
            s4d5e6f7g8: session.subscription as string,
            s6f7g8h9i0: 0,
            s7g8h9i0j1: 0
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
        
        // Find subscription by customer ID
        const data = await getRecords('subscriptions')
        const existing = (data.items || []).find(
          (s: Record<string, unknown>) => s.s3c4d5e6f7 === customerId
        )
        
        if (existing) {
          // Determine plan from price
          const priceId = subscription.items.data[0]?.price.id
          let plan = 'free'
          if (priceId === PRICES.starter) plan = 'starter'
          else if (priceId === PRICES.professional) plan = 'professional'
          else if (priceId === PRICES.enterprise) plan = 'enterprise'
          
          await updateRecord('subscriptions', existing.id as string, {
            s1a2b3c4d5: plan,
            s2b3c4d5e6: subscription.status,
            s5e6f7g8h9: new Date(subscription.current_period_end * 1000).toISOString()
          })
        }
        break
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string
        
        const data = await getRecords('subscriptions')
        const existing = (data.items || []).find(
          (s: Record<string, unknown>) => s.s3c4d5e6f7 === customerId
        )
        
        if (existing) {
          await updateRecord('subscriptions', existing.id as string, {
            s1a2b3c4d5: 'free',
            s2b3c4d5e6: 'cancelled'
          })
        }
        break
      }
    }
    
    res.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

export default router
