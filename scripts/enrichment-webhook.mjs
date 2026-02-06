#!/usr/bin/env node
/**
 * Enrichment Webhook Server
 * 
 * Listens for webhook calls and triggers the plugin agent for enrichment.
 * Run with: node enrichment-webhook.mjs
 * 
 * Endpoints:
 *   POST /enrich - Trigger enrichment for a plugin
 *     Body: { pluginSlug: string, jobId?: string, apiKey: string }
 */

import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.ENRICHMENT_PORT || 3847;
const API_KEY = process.env.ENRICHMENT_API_KEY || 'pluginradar-enrich-2026';

// Track running jobs to prevent duplicates
const runningJobs = new Set();

function runAgent(pluginSlug, jobId) {
  return new Promise((resolve, reject) => {
    const agentPath = path.join(__dirname, 'plugin-agent.mjs');
    
    console.log(`[${new Date().toISOString()}] Starting enrichment for: ${pluginSlug}`);
    
    const args = ['--enrich', pluginSlug];
    if (jobId) {
      args.push('--job-id', jobId);
    }
    
    const child = spawn('node', [agentPath, ...args], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      console.log(`[${new Date().toISOString()}] Agent finished with code: ${code}`);
      runningJobs.delete(pluginSlug);
      
      if (code === 0) {
        resolve({ success: true, output: stdout });
      } else {
        reject(new Error(`Agent exited with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (err) => {
      runningJobs.delete(pluginSlug);
      reject(err);
    });
    
    // Don't wait for the child process - return immediately
    child.unref();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', running: Array.from(runningJobs) }));
    return;
  }
  
  // Enrich endpoint
  if (req.method === 'POST' && req.url === '/enrich') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        // Verify API key
        if (data.apiKey !== API_KEY) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid API key' }));
          return;
        }
        
        const { pluginSlug, jobId } = data;
        
        if (!pluginSlug) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing pluginSlug' }));
          return;
        }
        
        // Check if already running
        if (runningJobs.has(pluginSlug)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Enrichment already in progress',
            pluginSlug 
          }));
          return;
        }
        
        // Mark as running
        runningJobs.add(pluginSlug);
        
        // Start agent (don't await - return immediately)
        runAgent(pluginSlug, jobId).catch(err => {
          console.error(`[${new Date().toISOString()}] Agent error:`, err.message);
        });
        
        // Return immediately
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Enrichment started for ${pluginSlug}`,
          pluginSlug,
          jobId,
        }));
        
      } catch (err) {
        console.error('Request error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    
    return;
  }
  
  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Enrichment webhook server running on port ${PORT}`);
  console.log(`   POST /enrich - Trigger plugin enrichment`);
  console.log(`   GET /health  - Health check`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
