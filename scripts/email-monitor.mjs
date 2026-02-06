#!/usr/bin/env node

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { ConvexHttpClient } from 'convex/browser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load credentials
const credsPath = path.join(process.env.HOME, '.credentials/pluginradar/gmail.json');
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));

// Convex client
const CONVEX_URL = 'https://next-frog-231.convex.cloud';
const convex = new ConvexHttpClient(CONVEX_URL);

// IMAP config
const imapConfig = {
  user: creds.email,
  password: creds.appPassword.replace(/\s/g, ''),
  host: creds.imapHost,
  port: creds.imapPort,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
};

// Parse command line args
const args = process.argv.slice(2);
const command = args[0] || 'check';

async function connectImap() {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    
    imap.once('ready', () => resolve(imap));
    imap.once('error', (err) => reject(err));
    
    imap.connect();
  });
}

async function getUnseenEmails(imap, limit = 20) {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) return reject(err);
      
      imap.search(['UNSEEN'], (err, results) => {
        if (err) return reject(err);
        
        if (!results || results.length === 0) {
          return resolve([]);
        }
        
        // Get most recent emails up to limit
        const toFetch = results.slice(-limit);
        const emails = [];
        
        const fetch = imap.fetch(toFetch, {
          bodies: '',
          markSeen: false
        });
        
        fetch.on('message', (msg, seqno) => {
          let emailData = { seqno };
          
          msg.on('body', (stream) => {
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });
            stream.once('end', () => {
              emailData.raw = buffer;
            });
          });
          
          msg.once('attributes', (attrs) => {
            emailData.uid = attrs.uid;
            emailData.flags = attrs.flags;
          });
          
          msg.once('end', () => {
            emails.push(emailData);
          });
        });
        
        fetch.once('error', reject);
        fetch.once('end', () => resolve(emails));
      });
    });
  });
}

async function parseEmail(rawEmail) {
  const parsed = await simpleParser(rawEmail);
  return {
    messageId: parsed.messageId,
    from: parsed.from?.text || '',
    fromAddress: parsed.from?.value?.[0]?.address || '',
    subject: parsed.subject || '',
    date: parsed.date,
    text: parsed.text || '',
    html: parsed.html || '',
  };
}

// Classify email content using simple heuristics
function classifyEmail(email) {
  const subject = email.subject.toLowerCase();
  const text = email.text.toLowerCase();
  const combined = subject + ' ' + text;
  
  // Sale indicators
  const saleKeywords = ['sale', 'discount', '% off', 'save', 'deal', 'offer', 'promo', 'coupon', 'flash', 'limited time', 'black friday', 'cyber monday'];
  const isSale = saleKeywords.some(kw => combined.includes(kw));
  
  // New release indicators
  const releaseKeywords = ['new release', 'introducing', 'announcing', 'launch', 'now available', 'just released', 'brand new'];
  const isRelease = releaseKeywords.some(kw => combined.includes(kw));
  
  // Update indicators
  const updateKeywords = ['update', 'version', 'v1.', 'v2.', 'v3.', 'patch', 'changelog', 'bug fix', 'new features'];
  const isUpdate = updateKeywords.some(kw => combined.includes(kw));
  
  if (isSale) return 'sale';
  if (isRelease) return 'new_release';
  if (isUpdate) return 'update';
  return 'newsletter';
}

// Extract price from text
function extractPrices(text) {
  const priceRegex = /\$(\d+(?:\.\d{2})?)/g;
  const matches = [...text.matchAll(priceRegex)];
  return matches.map(m => parseFloat(m[1]));
}

// Extract discount percentage
function extractDiscount(text) {
  const discountRegex = /(\d+)%\s*(?:off|discount|save)/gi;
  const match = text.match(discountRegex);
  if (match) {
    const num = match[0].match(/(\d+)/);
    return num ? parseInt(num[1]) : null;
  }
  return null;
}

async function processEmail(email) {
  const classification = classifyEmail(email);
  const prices = extractPrices(email.text);
  const discount = extractDiscount(email.text);
  
  return {
    from: email.from,
    fromAddress: email.fromAddress,
    subject: email.subject,
    receivedAt: email.date?.getTime() || Date.now(),
    messageId: email.messageId,
    classification,
    extractedData: {
      prices,
      discount,
      plugins: [], // Would need NLP/LLM to extract plugin names
      promoCodes: [], // Would need regex patterns for promo codes
    }
  };
}

async function checkEmails(options = {}) {
  const { limit = 20, markSeen = false, verbose = false } = options;
  
  console.log('Connecting to Gmail...');
  const imap = await connectImap();
  
  console.log('Fetching unseen emails...');
  const emails = await getUnseenEmails(imap, limit);
  
  console.log(`Found ${emails.length} unseen emails`);
  
  const results = [];
  
  for (const emailData of emails) {
    try {
      const parsed = await parseEmail(emailData.raw);
      const processed = await processEmail(parsed);
      
      if (verbose) {
        console.log(`\n--- Email ---`);
        console.log(`From: ${processed.from}`);
        console.log(`Subject: ${processed.subject}`);
        console.log(`Classification: ${processed.classification}`);
        if (processed.extractedData.prices.length > 0) {
          console.log(`Prices found: $${processed.extractedData.prices.join(', $')}`);
        }
        if (processed.extractedData.discount) {
          console.log(`Discount: ${processed.extractedData.discount}%`);
        }
      }
      
      results.push(processed);
      
      // Mark as seen if requested
      if (markSeen) {
        // Would mark email as seen here
      }
    } catch (err) {
      console.error(`Error processing email: ${err.message}`);
    }
  }
  
  imap.end();
  
  // Summary
  const sales = results.filter(r => r.classification === 'sale');
  const releases = results.filter(r => r.classification === 'new_release');
  const updates = results.filter(r => r.classification === 'update');
  
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${results.length}`);
  console.log(`Sales: ${sales.length}`);
  console.log(`New Releases: ${releases.length}`);
  console.log(`Updates: ${updates.length}`);
  console.log(`Newsletters: ${results.length - sales.length - releases.length - updates.length}`);
  
  return results;
}

async function testConnection() {
  console.log('Testing IMAP connection...');
  try {
    const imap = await connectImap();
    console.log('✅ Connected successfully!');
    
    // Get mailbox info
    await new Promise((resolve, reject) => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) return reject(err);
        console.log(`📬 Inbox: ${box.messages.total} total, ${box.messages.unseen} unread`);
        resolve();
      });
    });
    
    imap.end();
    return true;
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    return false;
  }
}

// Main
async function main() {
  switch (command) {
    case 'test':
      await testConnection();
      break;
    
    case 'check':
      const verbose = args.includes('--verbose') || args.includes('-v');
      const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 20;
      await checkEmails({ limit, verbose });
      break;
    
    case 'help':
    default:
      console.log(`
PluginRadar Email Monitor

Usage: node email-monitor.mjs <command> [options]

Commands:
  test              Test IMAP connection
  check             Check for new emails (default)
  help              Show this help

Options:
  --verbose, -v     Show detailed email info
  --limit=N         Max emails to fetch (default: 20)
`);
  }
}

main().catch(console.error);
