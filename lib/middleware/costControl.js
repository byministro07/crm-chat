// lib/middleware/costControl.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Token limits per tier
const TOKEN_LIMITS = {
  light: 4000,
  medium: 8000,
  high: 12000
};

// Cost per 1M tokens (OpenRouter pricing)
const COST_PER_MILLION = {
  'google/gemini-2.0-flash': 0.15,
  'google/gemini-2.5-flash': 0.30,
  'anthropic/claude-3.7-sonnet': 3.00
};

// Rate limiting configuration
const RATE_LIMITS = {
  ask: { window: 60, max: 30 }, // 30 requests per minute
  ingest: { window: 60, max: 100 }, // 100 ingests per minute
  summary: { window: 3600, max: 50 } // 50 summaries per hour
};

class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  check(key, limit) {
    const now = Date.now();
    const windowMs = limit.window * 1000;
    const requests = this.requests.get(key) || [];
    
    // Clean old requests
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= limit.max) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}

const rateLimiter = new RateLimiter();

// Create usage tracking table (run once in Supabase)
export const USAGE_TRACKING_SQL = `
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id),
  session_id UUID REFERENCES chat_sessions(id),
  model TEXT,
  tier TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost NUMERIC(10, 6),
  response_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_tracking_date ON usage_tracking(created_at);
CREATE INDEX idx_usage_tracking_contact ON usage_tracking(contact_id);
`;

// Token counting approximation (rough estimate)
export function estimateTokens(text) {
  if (!text) return 0;
  // Rough approximation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Trim context to fit token limits
export function trimContext(context, tier = 'medium') {
  const limit = TOKEN_LIMITS[tier];
  let totalTokens = 0;
  const trimmed = {};

  // Priority order: profile > recent orders > recent messages
  if (context.profile) {
    const profileTokens = estimateTokens(JSON.stringify(context.profile));
    if (totalTokens + profileTokens < limit * 0.1) { // Max 10% for profile
      trimmed.profile = context.profile;
      totalTokens += profileTokens;
    }
  }

  if (context.orders) {
    const ordersText = JSON.stringify(context.orders.slice(0, 10)); // Max 10 orders
    const ordersTokens = estimateTokens(ordersText);
    if (totalTokens + ordersTokens < limit * 0.3) { // Max 30% for orders
      trimmed.orders = context.orders.slice(0, 10);
      totalTokens += ordersTokens;
    }
  }

  if (context.messages) {
    const remainingTokens = limit - totalTokens - 500; // Reserve 500 for response
    let messageTokens = 0;
    trimmed.messages = [];

    // Add messages from most recent, working backwards
    for (let i = context.messages.length - 1; i >= 0; i--) {
      const msg = context.messages[i];
      const msgTokens = estimateTokens(JSON.stringify(msg));
      
      if (messageTokens + msgTokens > remainingTokens * 0.7) break;
      
      trimmed.messages.unshift(msg);
      messageTokens += msgTokens;
    }
  }

  return trimmed;
}

// Middleware for rate limiting
export async function rateLimitMiddleware(request, endpoint) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const key = `${endpoint}:${ip}`;
  const limit = RATE_LIMITS[endpoint];

  if (limit && !rateLimiter.check(key, limit)) {
    return NextResponse.json(
      { 
        error: 'Rate limit exceeded',
        retryAfter: limit.window 
      },
      { 
        status: 429,
        headers: {
          'Retry-After': String(limit.window)
        }
      }
    );
  }

  return null; // Continue
}

// Track usage for cost monitoring
export async function trackUsage({
  endpoint,
  contactId,
  sessionId,
  model,
  tier,
  inputTokens,
  outputTokens,
  responseTimeMs,
  error
}) {
  try {
    // Calculate estimated cost
    const totalTokens = (inputTokens || 0) + (outputTokens || 0);
    const costPerToken = (COST_PER_MILLION[model] || 0) / 1000000;
    const estimatedCost = totalTokens * costPerToken;

    await supabaseAdmin
      .from('usage_tracking')
      .insert({
        endpoint,
        contact_id: contactId,
        session_id: sessionId,
        model,
        tier,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: estimatedCost,
        response_time_ms: responseTimeMs,
        error: error?.substring(0, 500)
      });

  } catch (err) {
    console.error('Failed to track usage:', err);
    // Don't throw - this is non-critical
  }
}

// Get usage stats for monitoring
export async function getUsageStats(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabaseAdmin
    .from('usage_tracking')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get usage stats:', error);
    return null;
  }

  // Aggregate stats
  const stats = {
    totalRequests: data.length,
    totalTokens: data.reduce((sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0), 0),
    totalCost: data.reduce((sum, r) => sum + parseFloat(r.estimated_cost || 0), 0),
    avgResponseTime: data.reduce((sum, r) => sum + (r.response_time_ms || 0), 0) / data.length,
    errorRate: data.filter(r => r.error).length / data.length,
    byModel: {},
    byTier: {}
  };

  // Group by model
  data.forEach(record => {
    if (record.model) {
      if (!stats.byModel[record.model]) {
        stats.byModel[record.model] = { count: 0, tokens: 0, cost: 0 };
      }
      stats.byModel[record.model].count++;
      stats.byModel[record.model].tokens += (record.input_tokens || 0) + (record.output_tokens || 0);
      stats.byModel[record.model].cost += parseFloat(record.estimated_cost || 0);
    }

    if (record.tier) {
      if (!stats.byTier[record.tier]) {
        stats.byTier[record.tier] = { count: 0, tokens: 0, cost: 0 };
      }
      stats.byTier[record.tier].count++;
      stats.byTier[record.tier].tokens += (record.input_tokens || 0) + (record.output_tokens || 0);
      stats.byTier[record.tier].cost += parseFloat(record.estimated_cost || 0);
    }
  });

  return stats;
}

// Privacy mode - only use DB tools, no model calls
export function enforcePrivacyMode(request) {
  const privacyHeader = request.headers.get('x-privacy-mode');
  return privacyHeader === 'true';
}