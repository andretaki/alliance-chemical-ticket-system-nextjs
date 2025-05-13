#!/usr/bin/env node

// ESM wrapper script for the webhook setup
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Starting webhook setup script...');

// Run ts-node directly with the ESM loader
const tsNodeProcess = spawn('node', [
  '--loader', 'ts-node/esm',
  '--experimental-specifier-resolution=node',
  resolve(__dirname, 'setupWebhook.ts')
], {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

tsNodeProcess.on('close', (code) => {
  console.log(`Webhook setup script exited with code ${code}`);
  process.exit(code);
}); 