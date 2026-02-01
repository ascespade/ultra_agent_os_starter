#!/usr/bin/env node

/**
 * Job Reconciliation Script
 * 
 * Cleans up stuck jobs in planning/processing state
 * Safe to run manually or via cron
 * 
 * Usage:
 *   node scripts/reconcile-jobs.js                    # Dry run (show what would be fixed)
 *   node scripts/reconcile-jobs.js --execute          # Actually fix stuck jobs
 *   node scripts/reconcile-jobs.js --execute --force  # Fix all stuck jobs regardless of age
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const redis = require('redis');

const DRY_RUN = !process.argv.includes('--execute');
const FORCE = process.argv.includes('--force');

// Configuration
const STUCK_TIMEOUT_MINUTES = FORCE ? 0 : 15; // Consider stuck after 15 minutes
const MAX_STUCK_PLANNING = 10;
const MAX_TOTAL_BACKLOG = 100;

async function main() {
  console.log('='.repeat(60));
  console.log('JOB RECONCILIATION SCRIPT');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (will modify database)'}`);
  console.log(`Stuck timeout: ${STUCK_TIMEOUT_MINUTES} minutes`);
  console.log('');

  // Connect to database
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    await db.query('SELECT 1');
    console.log('[✓] Connected to database');
  } catch (error) {
    console.error('[✗] Database connection failed:', error.message);
    process.exit(1);
  }

  // Connect to Redis
  const redisClient = redis.createClient({ url: process.env.REDIS_URL });
  
  try {
    await redisClient.connect();
    await redisClient.ping();
    console.log('[✓] Connected to Redis');
  } catch (error) {
    console.error('[✗] Redis connection failed:', error.message);
    process.exit(1);
  }

  console.log('');
  console.log('-'.repeat(60));
  console.log('ANALYZING JOBS');
  console.log('-'.repeat(60));

  // Get stuck jobs from database
  const cutoffTime = new Date(Date.now() - STUCK_TIMEOUT_MINUTES * 60 * 1000);
  
  const stuckJobs = await db.query(`
    SELECT id, tenant_id, status, type, created_at, updated_at,
           EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_stuck
    FROM jobs
    WHERE status IN ('planning', 'processing')
      AND updated_at < $1
    ORDER BY updated_at ASC
  `, [cutoffTime]);

  console.log(`Found ${stuckJobs.rows.length} stuck jobs`);

  if (stuckJobs.rows.length === 0) {
    console.log('[✓] No stuck jobs found - system is healthy');
    await cleanup(db, redisClient);
    return;
  }

  // Group by status
  const byStatus = {
    planning: stuckJobs.rows.filter(j => j.status === 'planning'),
    processing: stuckJobs.rows.filter(j => j.status === 'processing')
  };

  console.log('');
  console.log('Breakdown by status:');
  console.log(`  - Planning: ${byStatus.planning.length}`);
  console.log(`  - Processing: ${byStatus.processing.length}`);
  console.log('');

  // Show sample of stuck jobs
  console.log('Sample stuck jobs (oldest first):');
  stuckJobs.rows.slice(0, 5).forEach(job => {
    console.log(`  - ${job.id.substring(0, 8)}... (${job.status}) stuck for ${Math.floor(job.minutes_stuck)} minutes`);
  });

  if (stuckJobs.rows.length > 5) {
    console.log(`  ... and ${stuckJobs.rows.length - 5} more`);
  }

  console.log('');

  // Check backlog limits
  const totalBacklog = await db.query(`
    SELECT COUNT(*) as count FROM jobs WHERE status IN ('queued', 'planning', 'processing')
  `);
  const backlogCount = parseInt(totalBacklog.rows[0].count);

  console.log(`Total backlog: ${backlogCount} jobs`);
  
  if (backlogCount > MAX_TOTAL_BACKLOG) {
    console.log(`[!] WARNING: Backlog exceeds limit (${MAX_TOTAL_BACKLOG})`);
  }

  if (byStatus.planning.length > MAX_STUCK_PLANNING) {
    console.log(`[!] WARNING: Stuck planning jobs exceed limit (${MAX_STUCK_PLANNING})`);
  }

  console.log('');

  if (DRY_RUN) {
    console.log('-'.repeat(60));
    console.log('DRY RUN - NO CHANGES MADE');
    console.log('-'.repeat(60));
    console.log('');
    console.log('To actually fix these jobs, run:');
    console.log('  node scripts/reconcile-jobs.js --execute');
    console.log('');
    await cleanup(db, redisClient);
    return;
  }

  // Execute fixes
  console.log('-'.repeat(60));
  console.log('EXECUTING FIXES');
  console.log('-'.repeat(60));
  console.log('');

  let fixedCount = 0;

  for (const job of stuckJobs.rows) {
    try {
      // Update job status to failed
      await db.query(`
        UPDATE jobs
        SET status = 'failed',
            error_message = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [
        `Job recovered by reconciliation script after ${Math.floor(job.minutes_stuck)} minutes stuck in ${job.status} state`,
        job.id
      ]);

      // Remove from Redis queue if present
      const queueKey = `tenant:${job.tenant_id}:job_queue`;
      const jobKey = `tenant:${job.tenant_id}:job:${job.id}`;
      
      // Remove from queue (if present)
      const queueItems = await redisClient.lRange(queueKey, 0, -1);
      for (let i = 0; i < queueItems.length; i++) {
        const item = JSON.parse(queueItems[i]);
        if (item.id === job.id) {
          await redisClient.lRem(queueKey, 1, queueItems[i]);
          break;
        }
      }

      // Update Redis job data
      const jobData = await redisClient.hGet(jobKey, 'data');
      if (jobData) {
        const data = JSON.parse(jobData);
        data.status = 'failed';
        data.error_message = `Recovered by reconciliation script`;
        data.updated_at = new Date().toISOString();
        await redisClient.hSet(jobKey, 'data', JSON.stringify(data));
      }

      fixedCount++;
      console.log(`[✓] Fixed job ${job.id.substring(0, 8)}... (was ${job.status} for ${Math.floor(job.minutes_stuck)}m)`);
    } catch (error) {
      console.error(`[✗] Failed to fix job ${job.id}:`, error.message);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('RECONCILIATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Fixed: ${fixedCount} jobs`);
  console.log(`Failed: ${stuckJobs.rows.length - fixedCount} jobs`);
  console.log('');

  // Final backlog check
  const finalBacklog = await db.query(`
    SELECT COUNT(*) as count FROM jobs WHERE status IN ('queued', 'planning', 'processing')
  `);
  const finalCount = parseInt(finalBacklog.rows[0].count);

  console.log(`Final backlog: ${finalCount} jobs`);
  
  if (finalCount <= MAX_TOTAL_BACKLOG) {
    console.log('[✓] Backlog within limits');
  } else {
    console.log('[!] WARNING: Backlog still exceeds limits');
  }

  await cleanup(db, redisClient);
}

async function cleanup(db, redisClient) {
  await db.end();
  await redisClient.quit();
  console.log('');
  console.log('[✓] Connections closed');
}

main().catch(error => {
  console.error('');
  console.error('='.repeat(60));
  console.error('FATAL ERROR');
  console.error('='.repeat(60));
  console.error(error);
  process.exit(1);
});
