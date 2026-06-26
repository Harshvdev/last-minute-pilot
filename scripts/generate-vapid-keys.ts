#!/usr/bin/env bun
// Generate VAPID keys for Web Push notifications.
// Run this once and add the output to your .env file:
//   bun run generate-vapid-keys

import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();

console.log('=== VAPID Keys for Web Push ===');
console.log('');
console.log('Add these to your .env file:');
console.log('');
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log('VAPID_SUBJECT="mailto:you@example.com"');
console.log('');
console.log('Also add the public key as a client-side env var:');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log('');
console.log('⚠️  Keep the private key secret — never commit it to git.');
