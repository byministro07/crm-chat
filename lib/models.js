// lib/models.js
// Pick the exact OpenRouter slugs you have access to.
// If a slug differs in your account, open the OpenRouter model picker and copy their slug.
export const MODEL_BY_TIER = {
  light:  'google/gemini-2.0-flash-001',  // cheapest
  medium: 'google/gemini-2.5-flash',  // mid tier (keep or change as you like)
  high:   'anthropic/claude-sonnet-4' // instead of Opus; adjust to your available slug
};