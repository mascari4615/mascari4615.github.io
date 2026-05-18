#!/usr/bin/env node
/**
 * CF Domain Validation — TASK-KAR-032
 *
 * Validates Cloudflare API token and zone access for mascari4615.com
 *
 * Usage:
 *   node scripts/cf-domain-validate.mjs
 *
 * Returns:
 *   - token valid + zone found: exit 0, print zone_id
 *   - token missing: exit 1, print setup instructions
 *   - token invalid: exit 2, print error
 */

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = path.join('..', '..', '.cf-token'); // umbrella root: C:\...\karmoddrine\.cf-token
const DOMAIN = 'mascari4615.com';

async function validateToken() {
  // 1. Check token file exists
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('❌ CF_TOKEN file not found:', path.resolve(TOKEN_FILE));
    console.error('\n📝 Setup:');
    console.error('1. Cloudflare Dashboard → Profile → API Tokens');
    console.error('2. Create Token with:');
    console.error('   - Zone: DNS (Edit)');
    console.error('   - Zone: Email Routing Rules (Edit)');
    console.error('   - Account: Email Routing Addresses (Edit)');
    console.error('   - Zone: Zone (Read)');
    console.error('3. Save to:', path.resolve(TOKEN_FILE));
    process.exit(1);
  }

  const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();

  if (!token) {
    console.error('❌ CF_TOKEN file empty');
    process.exit(1);
  }

  // 2. Validate token with Cloudflare API
  try {
    const resp = await fetch('https://api.cloudflare.com/client/v4/zones?name=' + DOMAIN, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();

    if (!data.success) {
      console.error('❌ CF API error:', data.errors[0]?.message || 'Unknown error');
      process.exit(2);
    }

    if (data.result.length === 0) {
      console.error(`❌ Zone "${DOMAIN}" not found or token lacks access`);
      process.exit(2);
    }

    const zone = data.result[0];
    console.log(`✓ Token valid`);
    console.log(`✓ Zone ID: ${zone.id}`);
    console.log(`✓ Zone: ${zone.name}`);
    console.log(`✓ Plan: ${zone.plan.name}`);

    // 3. Check email routing support (optional, only on paid plans + addon)
    if (zone.plan.name === 'Free') {
      console.warn('⚠ Email Routing may not be available on Free plan (requires addon)');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Validation failed:', err.message);
    process.exit(2);
  }
}

validateToken();
