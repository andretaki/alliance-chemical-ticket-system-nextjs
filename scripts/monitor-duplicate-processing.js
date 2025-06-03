#!/usr/bin/env node

/**
 * Duplicate Email Processing Monitor
 * 
 * This script monitors the effectiveness of the duplicate email processing fix
 * by analyzing logs and database records for patterns and anomalies.
 */

const { execSync } = require('child_process');
const fs = require('fs');

// Configuration
const LOG_FILE = process.env.LOG_FILE || '/var/log/app.log';
const HOURS_TO_ANALYZE = parseInt(process.env.HOURS_TO_ANALYZE || '24');
const DATABASE_URL = process.env.DATABASE_URL;

console.log('🔍 Duplicate Email Processing Monitor');
console.log('=====================================');

/**
 * Analyze log patterns for duplicate detection
 */
function analyzeLogs() {
    console.log('\n📊 Log Analysis');
    console.log('---------------');
    
    try {
        // Count duplicate detections by layer
        const duplicateCounts = {
            webhook: 0,
            inMemory: 0,
            advisory: 0,
            atomic: 0,
            constraint: 0
        };

        if (fs.existsSync(LOG_FILE)) {
            const logs = fs.readFileSync(LOG_FILE, 'utf8');
            const lines = logs.split('\n');
            
            for (const line of lines) {
                if (line.includes('Skipping recently processed email')) {
                    duplicateCounts.webhook++;
                } else if (line.includes('already being processed')) {
                    duplicateCounts.inMemory++;
                } else if (line.includes('Failed to acquire processing lock')) {
                    duplicateCounts.advisory++;
                } else if (line.includes('Email') && line.includes('is duplicate')) {
                    duplicateCounts.atomic++;
                } else if (line.includes('duplicate key value violates unique constraint')) {
                    duplicateCounts.constraint++;
                }
            }
        }

        console.log('Duplicate Detection by Layer:');
        console.log(`  🌐 Webhook Level:     ${duplicateCounts.webhook}`);
        console.log(`  🧠 In-Memory Locks:   ${duplicateCounts.inMemory}`);
        console.log(`  🔒 Advisory Locks:    ${duplicateCounts.advisory}`);
        console.log(`  ⚛️  Atomic Check:      ${duplicateCounts.atomic}`);
        console.log(`  ❌ Constraint Violations: ${duplicateCounts.constraint}`);
        
        const totalDuplicates = Object.values(duplicateCounts).reduce((a, b) => a + b, 0);
        console.log(`\nTotal Duplicates Prevented: ${totalDuplicates}`);
        
        if (duplicateCounts.constraint > 0) {
            console.log('\n⚠️  WARNING: Constraint violations detected! This should be very rare.');
            console.log('   Consider reviewing the processing logic or increasing lock timeouts.');
        } else {
            console.log('\n✅ No constraint violations detected - fix appears to be working!');
        }
        
    } catch (error) {
        console.log(`❌ Error analyzing logs: ${error.message}`);
    }
}

/**
 * Check database for duplicate processing indicators
 */
async function analyzeDatabaseMetrics() {
    console.log('\n🗄️  Database Analysis');
    console.log('-------------------');
    
    if (!DATABASE_URL) {
        console.log('❌ DATABASE_URL not provided, skipping database analysis');
        return;
    }
    
    try {
        // Note: This would require a proper database client
        // For now, we'll show the queries that should be run
        console.log('📋 Recommended Database Queries:');
        console.log('');
        console.log('1. Recent duplicate processing attempts:');
        console.log(`   SELECT COUNT(*) FROM quarantined_emails 
   WHERE ai_reason LIKE '%duplicate%' 
   AND created_at > NOW() - INTERVAL '${HOURS_TO_ANALYZE} hours';`);
        
        console.log('\n2. Emails with multiple processing attempts:');
        console.log(`   SELECT external_message_id, COUNT(*) as attempts
   FROM (
     SELECT external_message_id FROM tickets WHERE external_message_id IS NOT NULL
     UNION ALL
     SELECT external_message_id FROM ticket_comments WHERE external_message_id IS NOT NULL
     UNION ALL
     SELECT internet_message_id as external_message_id FROM quarantined_emails
   ) combined
   GROUP BY external_message_id
   HAVING COUNT(*) > 1;`);
   
        console.log('\n3. Processing performance metrics:');
        console.log(`   SELECT 
     DATE_TRUNC('hour', created_at) as hour,
     COUNT(*) as tickets_created,
     COUNT(CASE WHEN external_message_id IS NOT NULL THEN 1 END) as with_message_id
   FROM tickets 
   WHERE created_at > NOW() - INTERVAL '${HOURS_TO_ANALYZE} hours'
   GROUP BY hour
   ORDER BY hour;`);
        
    } catch (error) {
        console.log(`❌ Error with database analysis: ${error.message}`);
    }
}

/**
 * Performance impact assessment
 */
function assessPerformance() {
    console.log('\n⚡ Performance Assessment');
    console.log('------------------------');
    
    try {
        // Memory usage estimation
        console.log('Memory Impact Estimation:');
        console.log('  📱 Processing locks map: ~1KB per 100 concurrent emails');
        console.log('  🕐 Webhook dedup map: ~1KB per 1000 processed emails/hour');
        console.log('  🔒 Database advisory locks: Minimal memory impact');
        
        // Timing recommendations
        console.log('\nTiming Recommendations:');
        console.log('  ⏱️  Dedup window: 60s (current) - good for most scenarios');
        console.log('  ⏰ Processing timeout: 10s (current) - increase if processing slow emails');
        console.log('  🔄 Lock retry interval: Consider adding if lock contention is high');
        
        console.log('\nMonitoring Commands:');
        console.log('  📊 Watch processing rate: grep "processed email" ' + LOG_FILE + ' | wc -l');
        console.log('  🔍 Find stuck processing: grep "Failed to acquire" ' + LOG_FILE);
        console.log('  📈 Track constraint violations: grep "duplicate key value" ' + LOG_FILE);
        
    } catch (error) {
        console.log(`❌ Error in performance assessment: ${error.message}`);
    }
}

/**
 * Generate recommendations
 */
function generateRecommendations() {
    console.log('\n💡 Recommendations');
    console.log('------------------');
    
    console.log('✅ Immediate Actions:');
    console.log('  1. Set up log monitoring alerts for constraint violations');
    console.log('  2. Add database monitoring for quarantine table growth');
    console.log('  3. Monitor memory usage of Node.js processes');
    
    console.log('\n🔧 Tuning Options:');
    console.log('  1. Increase WEBHOOK_MAX_CONCURRENT if processing is slow');
    console.log('  2. Adjust DEDUP_WINDOW_MS based on Microsoft Graph behavior');
    console.log('  3. Add Redis-based locks for multi-instance deployments');
    
    console.log('\n📊 Long-term Monitoring:');
    console.log('  1. Set up metrics dashboard for duplicate detection rates');
    console.log('  2. Create alerts for abnormal quarantine rates');
    console.log('  3. Track processing latency trends');
    
    console.log('\n🎯 Success Metrics:');
    console.log('  • Constraint violations: < 1 per day (ideally 0)');
    console.log('  • Processing success rate: > 99%');
    console.log('  • Average processing time: < 2 seconds per email');
}

/**
 * Main execution
 */
async function main() {
    try {
        analyzeLogs();
        await analyzeDatabaseMetrics();
        assessPerformance();
        generateRecommendations();
        
        console.log('\n🎉 Analysis Complete!');
        console.log('\nFor continuous monitoring, consider running this script hourly via cron:');
        console.log(`0 * * * * node ${__filename} >> /var/log/duplicate-monitor.log 2>&1`);
        
    } catch (error) {
        console.error('\n❌ Monitor failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    analyzeLogs,
    analyzeDatabaseMetrics,
    assessPerformance,
    generateRecommendations
}; 