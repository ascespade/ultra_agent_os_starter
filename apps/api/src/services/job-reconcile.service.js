/**
 * Job Reconciliation Service - Phase 2 Requirement
 * Handles stuck jobs and enforces backlog limits
 */

const dbConnector = require("../../../../lib/db-connector");
const { getClient } = require("./redis.service");

/**
 * Reconciles jobs stuck in planning state
 * @param {number} maxAgeMinutes - Maximum age in minutes before reconciliation
 * @returns {Promise<number>} Number of jobs reconciled
 */
async function reconcileStuckJobs(maxAgeMinutes = 30) {
  const db = dbConnector.getPool();
  
  try {
    const result = await db.query(
      `
      UPDATE jobs 
      SET status = 'failed', 
          updated_at = NOW(),
          error_message = 'Job reconciled - stuck in planning too long'
      WHERE status = 'planning' 
        AND created_at < NOW() - INTERVAL '${maxAgeMinutes} minutes'
      RETURNING id, tenant_id
      `
    );
    
    const reconciledCount = result.rows.length;
    if (reconciledCount > 0) {
      console.log(`[RECONCILE] Reconciled ${reconciledCount} stuck jobs`);
      
      // Clean up Redis entries for reconciled jobs
      const redis = getClient();
      for (const job of result.rows) {
        const jobKey = `tenant:${job.tenant_id}:job:${job.id}`;
        await redis.del(jobKey);
      }
    }
    
    return reconciledCount;
  } catch (error) {
    console.error("[RECONCILE] Failed to reconcile jobs:", error);
    return 0;
  }
}

/**
 * Enforces hard backlog limit per tenant
 * @param {string} tenantId - Tenant ID
 * @param {number} maxBacklog - Maximum allowed backlog
 * @returns {Promise<number>} Number of jobs removed
 */
async function enforceBacklogLimit(tenantId, maxBacklog = 100) {
  const redis = getClient();
  const queueKey = `tenant:${tenantId}:job_queue`;
  
  try {
    const currentSize = await redis.lLen(queueKey);
    
    if (currentSize <= maxBacklog) {
      return 0;
    }
    
    const excessCount = currentSize - maxBacklog;
    console.warn(`[BACKLOG] Tenant ${tenantId} exceeds limit by ${excessCount}, trimming queue`);
    
    // Remove oldest jobs from the right side of the queue
    const removedJobs = [];
    for (let i = 0; i < excessCount; i++) {
      const jobData = await redis.rPop(queueKey);
      if (jobData) {
        removedJobs.push(JSON.parse(jobData));
      }
    }
    
    // Update database status for removed jobs
    if (removedJobs.length > 0) {
      const db = dbConnector.getPool();
      const jobIds = removedJobs.map(job => job.id);
      
      await db.query(
        `
        UPDATE jobs 
        SET status = 'failed', 
            updated_at = NOW(),
            error_message = 'Job removed due to backlog limit enforcement'
        WHERE id = ANY($1) AND tenant_id = $2
        `,
        [jobIds, tenantId]
      );
      
      // Clean up Redis job entries
      for (const job of removedJobs) {
        const jobKey = `tenant:${tenantId}:job:${job.id}`;
        await redis.del(jobKey);
      }
    }
    
    return removedJobs.length;
  } catch (error) {
    console.error("[BACKLOG] Failed to enforce limit:", error);
    return 0;
  }
}

/**
 * Gets current backlog statistics
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Backlog statistics
 */
async function getBacklogStats(tenantId) {
  const redis = getClient();
  const queueKey = `tenant:${tenantId}:job_queue`;
  
  try {
    const queueSize = await redis.lLen(queueKey);
    
    const db = dbConnector.getPool();
    const dbResult = await db.query(
      `
      SELECT status, COUNT(*) as count 
      FROM jobs 
      WHERE tenant_id = $1 
      GROUP BY status
      `,
      [tenantId]
    );
    
    const statusCounts = {};
    dbResult.rows.forEach(row => {
      statusCounts[row.status] = parseInt(row.count);
    });
    
    return {
      queueSize,
      statusCounts,
      totalJobs: Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
    };
  } catch (error) {
    console.error("[BACKLOG] Failed to get stats:", error);
    return { queueSize: 0, statusCounts: {}, totalJobs: 0 };
  }
}

module.exports = {
  reconcileStuckJobs,
  enforceBacklogLimit,
  getBacklogStats
};
