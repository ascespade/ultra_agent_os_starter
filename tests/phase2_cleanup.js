#!/usr/bin/env node
/**
 * PHASE_2_BACKLOG_CLEANUP: Safe cleanup of stuck jobs
 * 
 * Policy:
 * - Never delete recent jobs (< 24 hours old)
 * - Mark jobs older than threshold as failed with reason
 * - Optional purge only if table becomes operational risk
 * - Generate before/after reports
 */

const { Pool } = require('pg');
const redis = require('redis');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ultra_agent';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const THRESHOLD_HOURS = 24;

async function backlogCleanup() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  PHASE_2: BACKLOG CLEANUP                                  ║');
  console.log('║  Safe cleanup of jobs stuck in planning                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    threshold_hours: THRESHOLD_HOURS,
    before: {},
    after: {},
    actions: []
  };

  try {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();

    // ===== BEFORE STATE =====
    console.log('📊 CAPTURING BEFORE STATE...\n');
    
    const beforeResult = await pool.query(`
      SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC
    `);
    
    console.log('Job Status Distribution (BEFORE):');
    let totalBefore = 0;
    for (const row of beforeResult.rows) {
      report.before[row.status] = parseInt(row.count);
      totalBefore += parseInt(row.count);
      console.log(`  ${row.status.padEnd(12)}: ${String(row.count).padStart(6)}`);
    }
    report.before.total = totalBefore;
    console.log(`  ${'TOTAL'.padEnd(12)}: ${String(totalBefore).padStart(6)}\n`);

    // ===== IDENTIFY STUCK JOBS =====
    console.log('🔍 IDENTIFYING STUCK JOBS...\n');
    
    const stuckResult = await pool.query(`
      SELECT id, user_id, tenant_id, status, created_at, updated_at
      FROM jobs
      WHERE status = 'planning' AND created_at < NOW() - INTERVAL '${THRESHOLD_HOURS} hours'
      ORDER BY created_at ASC
      LIMIT 500
    `);
    
    const stuckJobs = stuckResult.rows;
    console.log(`Found ${stuckJobs.length} jobs stuck in planning for >${THRESHOLD_HOURS}h\n`);
    
    if (stuckJobs.length > 0) {
      console.log('Sample of stuck jobs:');
      for (let i = 0; i < Math.min(5, stuckJobs.length); i++) {
        const job = stuckJobs[i];
        const ageHours = Math.round((Date.now() - new Date(job.created_at)) / 3600000);
        console.log(`  - ${job.id.substring(0, 8)}... (age: ${ageHours}h, tenant: ${job.tenant_id})`);
      }
      if (stuckJobs.length > 5) {
        console.log(`  ... and ${stuckJobs.length - 5} more\n`);
      }
    }

    // ===== POLICY CHECK =====
    console.log('✅ POLICY VALIDATION...\n');
    
    let policyViolation = false;
    for (const job of stuckJobs) {
      const ageHours = Math.round((Date.now() - new Date(job.created_at)) / 3600000);
      if (ageHours < THRESHOLD_HOURS) {
        console.log(`❌ POLICY VIOLATION: Job ${job.id} is only ${ageHours}h old`);
        policyViolation = true;
        break;
      }
    }
    
    if (!policyViolation && stuckJobs.length > 0) {
      console.log(`✅ All ${stuckJobs.length} stuck jobs are >${THRESHOLD_HOURS}h old - safe to process`);
    }
    console.log();

    // ===== MARK AS FAILED =====
    if (stuckJobs.length > 0 && !policyViolation) {
      console.log(`⚙️  MARKING ${stuckJobs.length} JOBS AS FAILED...\n`);
      
      let processedCount = 0;
      for (const job of stuckJobs) {
        try {
          const ageHours = Math.round((Date.now() - new Date(job.created_at)) / 3600000);
          const updateResult = await pool.query(`
            UPDATE jobs 
            SET status = 'failed', 
                error_message = $1,
                updated_at = NOW()
            WHERE id = $2 AND tenant_id = $3
            RETURNING id
          `, [
            `Automatically failed after ${ageHours}h stuck in planning (policy: mark_as_failed_on_timeout)`,
            job.id,
            job.tenant_id
          ]);
          
          if (updateResult.rows.length > 0) {
            processedCount++;
            report.actions.push({
              type: 'marked_failed',
              jobId: job.id,
              age_hours: ageHours,
              timestamp: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error(`  ❌ Failed to update job ${job.id}:`, err.message);
          report.actions.push({
            type: 'update_failed',
            jobId: job.id,
            error: err.message
          });
        }
      }
      
      console.log(`✅ Marked ${processedCount}/${stuckJobs.length} jobs as failed\n`);
    }

    // ===== AFTER STATE =====
    console.log('📊 CAPTURING AFTER STATE...\n');
    
    const afterResult = await pool.query(`
      SELECT status, COUNT(*) as count FROM jobs GROUP BY status ORDER BY count DESC
    `);
    
    console.log('Job Status Distribution (AFTER):');
    let totalAfter = 0;
    for (const row of afterResult.rows) {
      report.after[row.status] = parseInt(row.count);
      totalAfter += parseInt(row.count);
      console.log(`  ${row.status.padEnd(12)}: ${String(row.count).padStart(6)}`);
    }
    report.after.total = totalAfter;
    console.log(`  ${'TOTAL'.padEnd(12)}: ${String(totalAfter).padStart(6)}\n`);

    // ===== REDIS QUEUE VERIFICATION =====
    console.log('📊 REDIS QUEUE VERIFICATION...\n');
    
    const queueLen = await redisClient.lLen('tenant:default:job_queue');
    console.log(`Queue length: ${queueLen} jobs`);
    report.queue_length = queueLen;
    
    // Check if queue is still growing
    const queueGrowing = queueLen > (report.before.planning || 0);
    if (queueGrowing) {
      console.log(`⚠️  WARNING: Queue appears to be growing (was ${report.before.planning}, now ${queueLen})`);
    } else {
      console.log(`✅ Queue is stable or shrinking`);
    }
    console.log();

    // ===== SUMMARY =====
    const changes = {
      planning_decrease: (report.before.planning || 0) - (report.after.planning || 0),
      failed_increase: (report.after.failed || 0) - (report.before.failed || 0)
    };

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║  CLEANUP SUMMARY                                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    console.log(`Jobs moved from planning → failed: ${changes.planning_decrease}`);
    console.log(`Total failed jobs now: ${report.after.failed || 0}\n`);
    
    if (report.after.planning > 0 && report.after.planning <= 100) {
      console.log(`✅ PASS: Planning queue reduced to ${report.after.planning} (threshold: ≤100)`);
    } else if (report.after.planning > 100) {
      console.log(`❌ FAIL: Planning queue still has ${report.after.planning} jobs (threshold: ≤100)`);
    } else {
      console.log(`✅ PASS: No jobs stuck in planning`);
    }

    // ===== SAVE REPORT =====
    const reportPath = '/home/al-hemam/ultra_agent_os_starter/BACKLOG_CLEANUP_REPORT.md';
    const reportContent = generateReportMarkdown(report, changes);
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\n📄 Report saved: ${reportPath}`);

    await pool.end();
    await redisClient.quit();

    return report.after.planning <= 100;
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error);
    return false;
  }
}

function generateReportMarkdown(report, changes) {
  return `# BACKLOG_CLEANUP_REPORT

## Execution Summary
- **Timestamp:** ${report.timestamp}
- **Threshold:** ${report.threshold_hours} hours
- **Policy:** Mark as failed with reason

## Before State
\`\`\`
${Object.entries(report.before)
  .filter(([k]) => k !== 'total')
  .map(([status, count]) => `${status}: ${count}`)
  .join('\n')}
TOTAL: ${report.before.total}
\`\`\`

## After State
\`\`\`
${Object.entries(report.after)
  .filter(([k]) => k !== 'total')
  .map(([status, count]) => `${status}: ${count}`)
  .join('\n')}
TOTAL: ${report.after.total}
\`\`\`

## Changes
- Planning queue decreased by: ${changes.planning_decrease}
- Failed jobs increased by: ${changes.failed_increase}
- Queue length: ${report.queue_length}

## Actions Taken
- Total updates: ${report.actions.filter(a => a.type === 'marked_failed').length}
- Failed updates: ${report.actions.filter(a => a.type === 'update_failed').length}

## Status
${report.after.planning <= 100 ? '✅ **PASS** - Backlog within acceptable limits' : '❌ **FAIL** - Backlog still above threshold'}

---
Generated by PHASE_2_BACKLOG_CLEANUP orchestrator
`;
}

backlogCleanup().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
