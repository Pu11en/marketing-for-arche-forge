const express = require('express');
const { body, validationResult } = require('express-validator');
const { query: dbQuery, transaction } = require('../database/connection');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// Rate limiting for subscription operations
const subscriptionRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each user to 5 subscription operations per hour
  message: 'Too many subscription operations, please try again later.'
});

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    price: 0,
    credits: 10,
    features: [
      '10 credits per month',
      'Basic video templates',
      '720p video export',
      'Community support'
    ],
    stripePriceId: null
  },
  basic: {
    name: 'Basic',
    price: 9.99,
    credits: 100,
    features: [
      '100 credits per month',
      'Premium templates',
      '1080p video export',
      'Email support',
      'No watermarks'
    ],
    stripePriceId: process.env.STRIPE_BASIC_PRICE_ID
  },
  pro: {
    name: 'Pro',
    price: 29.99,
    credits: 500,
    features: [
      '500 credits per month',
      'All templates',
      '4K video export',
      'Priority support',
      'Custom branding',
      'Advanced AI features'
    ],
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID
  },
  enterprise: {
    name: 'Enterprise',
    price: 99.99,
    credits: 2000,
    features: [
      '2000 credits per month',
      'Unlimited everything',
      'API access',
      'Dedicated support',
      'Custom integrations',
      'Team collaboration'
    ],
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID
  }
};

// Get available subscription plans
router.get('/plans', catchAsync(async (req, res) => {
  // Try to get from cache first
  const cacheKey = 'subscription_plans';
  let plans = await cache.get(cacheKey);

  if (!plans) {
    plans = SUBSCRIPTION_PLANS;
    
    // Cache for 1 hour
    await cache.set(cacheKey, plans, 3600);
  }

  res.json({
    status: 'success',
    data: {
      plans
    }
  });
}));

// Get current user subscription
router.get('/current', catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Try to get from cache first
  const cacheKey = `user_subscription:${userId}`;
  let subscription = await cache.get(cacheKey);

  if (!subscription) {
    // Get user subscription with user info
    const result = await dbQuery(`
      SELECT 
        s.id, s.user_id, s.tier, s.stripe_subscription_id, s.status,
        s.current_period_start, s.current_period_end, s.cancel_at_period_end,
        s.created_at, s.updated_at,
        u.credits_remaining
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      // Create free subscription if none exists
      await dbQuery(`
        INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end)
        VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 year')
      `, [userId]);

      subscription = {
        tier: 'free',
        status: 'active',
        credits_remaining: 10,
        plan: SUBSCRIPTION_PLANS.free
      };
    } else {
      const sub = result.rows[0];
      subscription = {
        ...sub,
        plan: SUBSCRIPTION_PLANS[sub.tier]
      };
    }

    // Cache for 5 minutes
    await cache.set(cacheKey, subscription, 300);
  }

  res.json({
    status: 'success',
    data: {
      subscription
    }
  });
}));

// Create or update subscription
router.post('/create', subscriptionRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { tier, paymentMethodId } = req.body;

  if (!tier || !SUBSCRIPTION_PLANS[tier]) {
    throw new ValidationError('Invalid subscription tier');
  }

  if (tier === 'free') {
    throw new ValidationError('Cannot create free subscription through this endpoint');
  }

  if (!paymentMethodId) {
    throw new ValidationError('Payment method ID is required');
  }

  const plan = SUBSCRIPTION_PLANS[tier];

  // Get current subscription
  const currentSubResult = await dbQuery(
    'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  let stripeSubscription;
  const currentSub = currentSubResult.rows[0];

  try {
    if (currentSub && currentSub.stripe_subscription_id) {
      // Update existing subscription
      stripeSubscription = await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
        items: [{
          id: plan.stripePriceId,
          price: plan.stripePriceId,
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'],
        },
        expand: ['latest_invoice.payment_intent'],
      });
    } else {
      // Create new subscription
      const customer = await stripe.customers.create({
        payment_method: paymentMethodId,
        email: req.user.email,
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      stripeSubscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: plan.stripePriceId,
        }],
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'],
        },
        expand: ['latest_invoice.payment_intent'],
      });
    }

    // Update database
    await transaction(async (client) => {
      // Update or create subscription record
      await client.query(`
        INSERT INTO subscriptions (
          user_id, tier, stripe_subscription_id, status, 
          current_period_start, current_period_end
        )
        VALUES ($1, $2, $3, 'incomplete', NOW(), NOW() + INTERVAL '1 month')
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          tier = $2,
          stripe_subscription_id = $3,
          status = 'incomplete',
          current_period_start = NOW(),
          current_period_end = NOW() + INTERVAL '1 month',
          updated_at = CURRENT_TIMESTAMP
      `, [userId, tier, stripeSubscription.id]);

      // Add credits based on plan
      await client.query(
        'UPDATE users SET credits_remaining = credits_remaining + $1 WHERE id = $2',
        [plan.credits, userId]
      );

      // Log usage
      await client.query(`
        INSERT INTO usage_logs (user_id, resource_type, resource_amount, metadata)
        VALUES ($1, 'subscription', $2, $3)
      `, [userId, plan.credits, JSON.stringify({ tier, action: 'subscription_created' })]);
    });

    // Clear cache
    await cache.del(`user_subscription:${userId}`);

    // Log subscription creation
    logger.logUserActivity(userId, 'subscription_created', {
      tier,
      stripeSubscriptionId: stripeSubscription.id,
      ip: req.ip
    });

    res.status(201).json({
      status: 'success',
      message: 'Subscription created successfully',
      data: {
        subscriptionId: stripeSubscription.id,
        clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret,
        tier,
        plan
      }
    });

  } catch (error) {
    logger.error('Stripe subscription error:', error);
    throw new ValidationError('Failed to create subscription');
  }
}));

// Cancel subscription
router.post('/cancel', subscriptionRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { immediate = false } = req.body;

  // Get current subscription
  const result = await dbQuery(
    'SELECT stripe_subscription_id, tier FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Subscription');
  }

  const subscription = result.rows[0];

  if (subscription.tier === 'free') {
    throw new ValidationError('Cannot cancel free subscription');
  }

  if (!subscription.stripe_subscription_id) {
    throw new ValidationError('No active subscription to cancel');
  }

  try {
    if (immediate) {
      // Cancel immediately
      await stripe.subscriptions.del(subscription.stripe_subscription_id);
      
      // Update database
      await dbQuery(`
        UPDATE subscriptions 
        SET status = 'canceled', current_period_end = NOW(), updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `, [userId]);
    } else {
      // Cancel at period end
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });

      // Update database
      await dbQuery(`
        UPDATE subscriptions 
        SET cancel_at_period_end = true, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
      `, [userId]);
    }

    // Clear cache
    await cache.del(`user_subscription:${userId}`);

    // Log subscription cancellation
    logger.logUserActivity(userId, 'subscription_canceled', {
      stripeSubscriptionId: subscription.stripe_subscription_id,
      immediate,
      ip: req.ip
    });

    res.json({
      status: 'success',
      message: `Subscription ${immediate ? 'canceled immediately' : 'canceled at period end'}`,
      data: {
        immediate
      }
    });

  } catch (error) {
    logger.error('Stripe cancellation error:', error);
    throw new ValidationError('Failed to cancel subscription');
  }
}));

// Reactivate subscription
router.post('/reactivate', subscriptionRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;

  // Get current subscription
  const result = await dbQuery(
    'SELECT stripe_subscription_id, tier FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Subscription');
  }

  const subscription = result.rows[0];

  if (subscription.tier === 'free') {
    throw new ValidationError('Cannot reactivate free subscription');
  }

  if (!subscription.stripe_subscription_id) {
    throw new ValidationError('No subscription to reactivate');
  }

  try {
    // Reactivate subscription
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    // Update database
    await dbQuery(`
      UPDATE subscriptions 
      SET status = 'active', cancel_at_period_end = false, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId]);

    // Clear cache
    await cache.del(`user_subscription:${userId}`);

    // Log subscription reactivation
    logger.logUserActivity(userId, 'subscription_reactivated', {
      stripeSubscriptionId: subscription.stripe_subscription_id,
      ip: req.ip
    });

    res.json({
      status: 'success',
      message: 'Subscription reactivated successfully'
    });

  } catch (error) {
    logger.error('Stripe reactivation error:', error);
    throw new ValidationError('Failed to reactivate subscription');
  }
}));

// Add credits (one-time purchase)
router.post('/add-credits', subscriptionRateLimit, catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { amount, paymentMethodId } = req.body;

  if (!amount || amount < 10 || amount > 10000) {
    throw new ValidationError('Credit amount must be between 10 and 10000');
  }

  if (!paymentMethodId) {
    throw new ValidationError('Payment method ID is required');
  }

  try {
    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      metadata: {
        user_id: userId,
        credit_amount: amount
      }
    });

    if (paymentIntent.status === 'succeeded') {
      // Add credits to user account
      await transaction(async (client) => {
        await client.query(
          'UPDATE users SET credits_remaining = credits_remaining + $1 WHERE id = $2',
          [amount, userId]
        );

        // Log usage
        await client.query(`
          INSERT INTO usage_logs (user_id, resource_type, resource_amount, metadata)
          VALUES ($1, 'credits_purchase', $2, $3)
        `, [userId, amount, JSON.stringify({ paymentIntentId: paymentIntent.id })]);
      });

      // Clear cache
      await cache.del(`user_subscription:${userId}`);

      // Log credit purchase
      logger.logUserActivity(userId, 'credits_purchased', {
        amount,
        paymentIntentId: paymentIntent.id,
        ip: req.ip
      });

      res.json({
        status: 'success',
        message: 'Credits added successfully',
        data: {
          amount,
          paymentIntentId: paymentIntent.id
        }
      });
    } else {
      throw new ValidationError('Payment failed');
    }

  } catch (error) {
    logger.error('Credit purchase error:', error);
    throw new ValidationError('Failed to add credits');
  }
}));

// Get payment methods
router.get('/payment-methods', catchAsync(async (req, res) => {
  const userId = req.user.id;

  try {
    // Get customer ID from subscription
    const result = await dbQuery(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].stripe_subscription_id) {
      return res.json({
        status: 'success',
        data: {
          paymentMethods: []
        }
      });
    }

    const subscription = await stripe.subscriptions.retrieve(result.rows[0].stripe_subscription_id);
    const customer = await stripe.customers.retrieve(subscription.customer);

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: 'card',
    });

    res.json({
      status: 'success',
      data: {
        paymentMethods: paymentMethods.data
      }
    });

  } catch (error) {
    logger.error('Get payment methods error:', error);
    throw new ValidationError('Failed to retrieve payment methods');
  }
}));

// Webhook handler for Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    return res.status(400).send('Webhook signature verification failed');
  }

  // Handle the event
  switch (event.type) {
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    default:
      logger.info(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
}));

// Helper functions for webhook handlers
async function handleInvoicePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  const customerId = invoice.customer;

  // Get user ID from subscription
  const result = await dbQuery(
    'SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [subscriptionId]
  );

  if (result.rows.length > 0) {
    const userId = result.rows[0].user_id;
    const tier = await getSubscriptionTier(subscriptionId);
    const plan = SUBSCRIPTION_PLANS[tier];

    // Add credits for new billing period
    await dbQuery(
      'UPDATE users SET credits_remaining = credits_remaining + $1 WHERE id = $2',
      [plan.credits, userId]
    );

    // Update subscription period
    await dbQuery(`
      UPDATE subscriptions 
      SET status = 'active', current_period_start = NOW(), current_period_end = NOW() + INTERVAL '1 month'
      WHERE stripe_subscription_id = $1
    `, [subscriptionId]);

    // Clear cache
    await cache.del(`user_subscription:${userId}`);

    logger.info('Invoice payment succeeded', {
      subscriptionId,
      userId,
      creditsAdded: plan.credits
    });
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;

  // Update subscription status
  await dbQuery(
    'UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2',
    ['past_due', subscriptionId]
  );

  logger.warn('Invoice payment failed', {
    subscriptionId,
    invoiceId: invoice.id
  });
}

async function handleSubscriptionDeleted(subscription) {
  // Update subscription status
  await dbQuery(`
    UPDATE subscriptions 
    SET status = 'canceled', current_period_end = NOW()
    WHERE stripe_subscription_id = $1
  `, [subscription.id]);

  logger.info('Subscription deleted', {
    subscriptionId: subscription.id
  });
}

async function handleSubscriptionUpdated(subscription) {
  const tier = await getSubscriptionTier(subscription.id);

  // Update subscription tier
  await dbQuery(`
    UPDATE subscriptions 
    SET tier = $1, status = $2, cancel_at_period_end = $3
    WHERE stripe_subscription_id = $4
  `, [tier, subscription.status, subscription.cancel_at_period_end, subscription.id]);

  logger.info('Subscription updated', {
    subscriptionId: subscription.id,
    tier,
    status: subscription.status
  });
}

async function getSubscriptionTier(stripeSubscriptionId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const priceId = subscription.items.data[0].price.id;

    // Find which plan this price belongs to
    for (const [tier, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
      if (plan.stripePriceId === priceId) {
        return tier;
      }
    }

    return 'free';
  } catch (error) {
    logger.error('Error getting subscription tier:', error);
    return 'free';
  }
}

module.exports = router;