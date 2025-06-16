/**
 * Test script for the enhanced AI-powered ticket resolution system
 * This script demonstrates the AI Sales Manager functionality
 */

import { analyzeTicketResolution, checkTicketsForResolution } from '@/lib/ticketResolutionAgent';

async function testAIResolutionSystem() {
  console.log('🤖 Testing Enhanced AI Ticket Resolution System');
  console.log('=' .repeat(60));
  
  try {
    // Test individual ticket analysis
    console.log('\n📋 Testing Individual Ticket Analysis...');
    const ticketId = 1; // Replace with an actual ticket ID from your system
    
    const analysis = await analyzeTicketResolution(ticketId);
    
    if (analysis) {
      console.log(`✅ AI Analysis for Ticket #${ticketId}:`);
      console.log(`   Resolved: ${analysis.isResolved}`);
      console.log(`   Confidence: ${analysis.confidence}`);
      console.log(`   Recommended Action: ${analysis.recommendedAction}`);
      console.log(`   Should Auto-Close: ${analysis.shouldAutoClose}`);
      console.log(`   Resolution Summary: ${analysis.resolutionSummary}`);
      console.log(`   Reasoning: ${analysis.reasonForConclusion}`);
      
      if (analysis.analysisContext) {
        console.log(`   Context:`);
        console.log(`     - Customer responded last: ${analysis.analysisContext.customerRespondedLast}`);
        console.log(`     - Days since agent response: ${analysis.analysisContext.daysSinceLastAgentResponse.toFixed(1)}`);
        console.log(`     - Conversation turns: ${analysis.analysisContext.conversationTurns}`);
        console.log(`     - Multiple issues: ${analysis.analysisContext.hasMultipleIssues}`);
      }
      
      if (analysis.satisfactionIndicators) {
        console.log(`   Satisfaction Indicators:`);
        console.log(`     - Explicit satisfaction: ${analysis.satisfactionIndicators.explicitSatisfaction}`);
        console.log(`     - Expression of gratitude: ${analysis.satisfactionIndicators.expresstionOfGratitude}`);
        console.log(`     - Negative sentiment: ${analysis.satisfactionIndicators.negativeSentiment}`);
        console.log(`     - Satisfaction confidence: ${analysis.satisfactionIndicators.satisfactionConfidence}`);
      }
      
      if (analysis.followUpQuestion) {
        console.log(`   Suggested Follow-up: "${analysis.followUpQuestion}"`);
      }
    } else {
      console.log(`❌ Failed to analyze ticket #${ticketId}`);
    }
    
    // Test batch processing
    console.log('\n🔄 Testing Batch Processing...');
    const batchResults = await checkTicketsForResolution(3, 5, true); // Test with 3 days inactivity, max 5 tickets
    
    console.log(`✅ Batch Processing Results:`);
    console.log(`   Processed: ${batchResults.processed} tickets`);
    console.log(`   AI Analysis Used: ${batchResults.aiAnalysisUsed} tickets`);
    console.log(`   Resolved: ${batchResults.resolvedByAI} tickets`);
    console.log(`   Auto-closed: ${batchResults.autoClosedByAI} tickets`);
    console.log(`   Follow-up recommended: ${batchResults.followUpRecommendedByAI} tickets`);
    console.log(`   Errors: ${batchResults.errors} tickets`);
    
    if (batchResults.reopened !== undefined) {
      console.log(`   Recently reopened: ${batchResults.reopened} tickets`);
    }
    
    // Calculate success metrics
    const successRate = batchResults.processed > 0 ? 
      ((batchResults.resolvedByAI + batchResults.followUpRecommendedByAI) / batchResults.processed) * 100 : 0;
    
    console.log(`\n📊 Performance Metrics:`);
    console.log(`   AI Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`   AI Utilization: ${batchResults.processed > 0 ? ((batchResults.aiAnalysisUsed / batchResults.processed) * 100).toFixed(1) : 0}%`);
    
    if (batchResults.autoClosedByAI > 0 && batchResults.resolvedByAI > 0) {
      console.log(`   Auto-closure Rate: ${((batchResults.autoClosedByAI / batchResults.resolvedByAI) * 100).toFixed(1)}%`);
    } else if (batchResults.autoClosedByAI > 0) {
      console.log(`   Auto-closure Rate: N/A (Auto-closed but no other resolutions by AI)`);
    }
    
    console.log('\n🎉 Enhanced AI Resolution System Test Complete!');
    
  } catch (error) {
    console.error('❌ Error testing AI resolution system:', error);
  }
}

// Configuration test
async function testAIConfiguration() {
  console.log('\n⚙️  Testing AI Configuration...');
  
  // Import configuration utilities
  const { DEFAULT_RESOLUTION_CONFIG } = await import('@/types/resolution');
  
  console.log('📋 Current Default Configuration:');
  console.log(`   Auto-close enabled: ${DEFAULT_RESOLUTION_CONFIG.autoCloseEnabled}`);
  console.log(`   Inactivity days: ${DEFAULT_RESOLUTION_CONFIG.inactivityDays}`);
  console.log(`   Confidence threshold: ${DEFAULT_RESOLUTION_CONFIG.confidenceThreshold}`);
  console.log(`   Max tickets per batch: ${DEFAULT_RESOLUTION_CONFIG.maxTicketsPerBatch}`);
  console.log(`   Agent response last required: ${DEFAULT_RESOLUTION_CONFIG.autoCloseOnlyIfAgentRespondedLast}`);
  console.log(`   Min conversation turns: ${DEFAULT_RESOLUTION_CONFIG.minimumConversationTurnsForAI}`);
  console.log(`   High confidence inactivity days: ${DEFAULT_RESOLUTION_CONFIG.inactivityDaysForConfidentClosure}`);
  console.log(`   Auto follow-up enabled: ${DEFAULT_RESOLUTION_CONFIG.enableAutoFollowUp}`);
  console.log(`   Analyze low activity tickets: ${DEFAULT_RESOLUTION_CONFIG.analyzeLowActivityTickets}`);
  console.log(`   Customer notifications: ${DEFAULT_RESOLUTION_CONFIG.sendCustomerNotification}`);
}

// Main test function
async function runAIResolutionTests() {
  await testAIConfiguration();
  await testAIResolutionSystem();
}

// Export for use in other contexts
export { testAIResolutionSystem, testAIConfiguration, runAIResolutionTests };

// Allow direct execution
if (require.main === module) {
  runAIResolutionTests()
    .then(() => {
      console.log('\n✅ All tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
} 