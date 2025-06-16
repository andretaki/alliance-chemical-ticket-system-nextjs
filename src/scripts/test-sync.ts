import fetch from 'node-fetch';

async function testSync() {
  try {
    console.log('Testing product sync endpoint...');
    const response = await fetch('http://localhost:3001/api/sync-products', {
      method: 'POST',
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testSync(); 