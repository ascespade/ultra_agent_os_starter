const redis = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = redis.createClient({ url: REDIS_URL });

async function auditDatabase() {
  console.log('Starting database audit...');
  
  try {
    await redisClient.connect();
    
    // Get all keys
    const allKeys = await redisClient.keys('*');
    console.log(`Total Redis keys: ${allKeys.length}`);
    
    // Job keys analysis
    const jobKeys = allKeys.filter(key => key.startsWith('job:'));
    console.log(`Job keys: ${jobKeys.length}`);
    
    // Queue analysis
    const queueLength = await redisClient.lLen('job_queue');
    console.log(`Jobs in queue: ${queueLength}`);
    
    // Sample job verification
    let validJobs = 0;
    let corruptedJobs = 0;
    
    for (const key of jobKeys.slice(0, 10)) {
      const jobData = await redisClient.hGet(key, 'data');
      if (jobData) {
        try {
          const job = JSON.parse(jobData);
          if (job.id && job.status && job.message) {
            validJobs++;
          } else {
            corruptedJobs++;
            console.log(`Corrupted job: ${key}`);
          }
        } catch (e) {
          corruptedJobs++;
          console.log(`Invalid JSON in job: ${key}`);
        }
      } else {
        corruptedJobs++;
        console.log(`Missing data in job: ${key}`);
      }
    }
    
    console.log(`Valid jobs (sample): ${validJobs}`);
    console.log(`Corrupted jobs (sample): ${corruptedJobs}`);
    
    // Memory files check
    const memoryFiles = ['project_state.json', 'constraints.json', 'decisions.log', 'known_issues.json'];
    console.log('Memory files:');
    
    for (const file of memoryFiles) {
      try {
        const fs = require('fs');
        const path = require('path');
        const DATA_DIR = process.env.DATA_DIR || '/data/agent';
        const filePath = path.join(DATA_DIR, file);
        
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(content);
          console.log(`  ${file}: ${Object.keys(parsed).length} keys`);
        } else {
          console.log(`  ${file}: Not found`);
        }
      } catch (e) {
        console.log(`  ${file}: Error - ${e.message}`);
      }
    }
    
    await redisClient.disconnect();
    
    const score = Math.min(100, (validJobs / Math.max(1, validJobs + corruptedJobs)) * 100);
    console.log(`\nDatabase completeness score: ${score.toFixed(1)}/100`);
    
    return {
      totalKeys: allKeys.length,
      jobKeys: jobKeys.length,
      queueLength,
      validJobs,
      corruptedJobs,
      score
    };
    
  } catch (error) {
    console.error('Database audit failed:', error);
    await redisClient.disconnect();
    throw error;
  }
}

auditDatabase().then(result => {
  console.log('\nAudit completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
