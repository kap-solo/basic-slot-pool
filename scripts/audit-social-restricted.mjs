/**
 * Audit Reflecting Pool social copy for Stake.US restricted phrases.
 * Run: node scripts/audit-social-restricted.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enSocial } from '../node_modules/@kap-solo/suki-engine/client/suki/strings/en.js';
import { ONBOARDING_FRAMES_SOCIAL } from '../js/onboardingScreen.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Restricted phrase → replacement (left column only). */
const RESTRICTED = [
  ['win feature', 'play feature'],
  ['pay out', 'win / won'],
  ['paid out', 'win'],
  ['pays out', 'won'],
  ['total bet', 'total play'],
  ['place your bets', 'come and play / join in the game'],
  ['bonus buy', 'bonus / feature'],
  ['buy bonus', 'get bonus'],
  ['at the cost of', 'for'],
  ['cost of', 'can be played for'],
  ['awarded to your balance', "appear in player's accounts"],
  ["awarded to player's accounts", "appear in player's accounts"],
  ['be awarded to player', "appear in player's accounts"],
  ['betting', 'play / playing'],
  ['purchase', 'play'],
  ['bought', 'instantly triggered'],
  ['gamble', 'play'],
  ['wager', 'play'],
  ['deposit', 'get coins'],
  ['withdraw', 'redeem'],
  ['rebet', 'respin'],
  ['payer', 'winner'],
  ['payout', 'win / won'],
  ['credited', 'coins'],
  ['credit', 'coins'],
  ['currency', 'token'],
  ['money', 'coins'],
  ['cash', 'coins'],
  ['stake', 'play amount'],
];

const WORD_RESTRICTED = [
  ['bet', 'play'],
  ['bets', 'plays'],
  ['buy', 'play'],
  ['pay', 'win'],
  ['pays', 'wins'],
  ['paid', 'won'],
];

/** Allowlist substrings that contain restricted tokens but are approved social labels. */
const ALLOW_SUBSTRINGS = [
  'win table',
  'get bonus',
  'play amount',
  'play feature',
  'play limit',
  'play results',
  'play mode',
  'base play',
  'total play',
  'play cost',
  'play /',
  'playing',
  'display',
  'replay',
  'stake engine',
  'stake.us',
];

function extractPickSocialCopySecondArgs(source) {
  const strings = [];
  const re = /pickSocialCopy\(\s*game,\s*(?:'[^']*'|"[^"]*"|\`[^`]*\`|\[[\s\S]*?\]),\s*((?:'[^']*'|"[^"]*"|\`[\s\S]*?\`|\[[\s\S]*?\]))/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    try {
      strings.push(Function(`"use strict"; return (${m[1]});`)());
    } catch {
      // skip dynamic fragments
    }
  }
  return strings;
}

function flatten(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flatten);
  return [];
}

function collectStrings() {
  const items = [];

  const menuSrc = fs.readFileSync(path.join(root, 'js/menu.js'), 'utf8');
  for (const s of extractPickSocialCopySecondArgs(menuSrc)) {
    for (const line of flatten(s)) items.push({ source: 'js/menu.js pickSocialCopy', text: line });
  }
  if (menuSrc.includes('SOCIAL_GENERAL_DISCLAIMER')) {
    const m = menuSrc.match(/const SOCIAL_GENERAL_DISCLAIMER =\s*\n\s*'([^']+)'/);
    if (m) items.push({ source: 'js/menu.js SOCIAL_GENERAL_DISCLAIMER', text: m[1] });
  }

  for (const frame of ONBOARDING_FRAMES_SOCIAL) {
    items.push({ source: 'js/onboardingScreen.js', text: frame.header });
    items.push({ source: 'js/onboardingScreen.js', text: frame.body });
  }

  const gameSrc = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
  const copyBlock = gameSrc.match(/if \(usesSocialCopy\(\)\) \{([\s\S]*?)\n  \}/);
  if (copyBlock) {
    for (const m of copyBlock[1].matchAll(/return '([^']+)'|`([^`]+)`/g)) {
      items.push({ source: 'js/game.js copyTerm', text: m[1] ?? m[2] });
    }
  }
  items.push({ source: 'js/game.js aria', text: 'Increase play amount' });
  items.push({ source: 'js/game.js aria', text: 'Decrease play amount' });

  items.push({ source: 'js/buyBonusConfirm.js', text: 'GET BONUS' });
  items.push({ source: 'js/buyBonusConfirm.js', text: 'Get 8 Free Spins for $1.00' });
  items.push({ source: 'js/buyBonusConfirm.js', text: '20× play amount' });

  items.push({ source: 'js/featureChrome.js', text: 'Feature Earn' });
  items.push({ source: 'js/featureChrome.js', text: 'Total Earn' });

  for (const [key, text] of Object.entries(enSocial)) {
    if (typeof text === 'string') items.push({ source: `enSocial.${key}`, text });
  }

  const doc = fs.readFileSync(path.join(root, 'docs/how-to-play-social.txt'), 'utf8');
  for (const line of doc.split('\n')) {
    if (line.trim() && !line.startsWith('=') && !line.startsWith('Source:') && !line.startsWith('Excludes:') && !line.startsWith('Real-money')) {
      items.push({ source: 'docs/how-to-play-social.txt', text: line.trim() });
    }
  }

  return items;
}

function isAllowed(text, match) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(match.toLowerCase());
  if (idx < 0) return false;
  for (const allow of ALLOW_SUBSTRINGS) {
    if (lower.includes(allow) && allow.includes(match.toLowerCase())) return true;
  }
  // win table, get bonus already covered
  if (match === 'pay' && /\bdisplay\b/i.test(text)) return true;
  if (match === 'bet' && /\bplay amount\b/i.test(text)) return true;
  return false;
}

function auditText(text, source) {
  const lower = text.toLowerCase();
  const hits = [];

  for (const [phrase, replacement] of RESTRICTED) {
    if (lower.includes(phrase) && !isAllowed(text, phrase)) {
      hits.push({ phrase, replacement, excerpt: text.slice(0, 120) });
    }
  }

  for (const [word, replacement] of WORD_RESTRICTED) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    if (re.test(text) && !isAllowed(text, word)) {
      hits.push({ phrase: word, replacement, excerpt: text.slice(0, 120) });
    }
  }

  return hits.map((h) => ({ ...h, source, text }));
}

function main() {
  const items = collectStrings();
  const violations = [];

  for (const { source, text } of items) {
    violations.push(...auditText(text, source));
  }

  // Deduplicate engine strings we override in game.js copyTerm
  const filtered = violations.filter((v) => {
    if (v.source.startsWith('enSocial.buyConfirm') && v.source !== 'enSocial.buyConfirmCancel') {
      return false;
    }
    if (v.source === 'enSocial.howToPlayIntro') return false;
    return true;
  });

  if (filtered.length === 0) {
    console.log(`OK — ${items.length} social strings checked, no restricted phrases found.`);
    process.exit(0);
  }

  console.error(`FAIL — ${filtered.length} restricted phrase hit(s):\n`);
  for (const v of filtered) {
    console.error(`• [${v.source}] "${v.phrase}" → use "${v.replacement}"`);
    console.error(`  ${v.excerpt}${v.text.length > 120 ? '…' : ''}\n`);
  }
  process.exit(1);
}

main();
