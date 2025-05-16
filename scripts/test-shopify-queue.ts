import axios from 'axios';

async function triggerWorker(workerUrl: string) {
    try {
        console.log(`Attempting to trigger worker via POST: ${workerUrl}`);
        const response = await axios.post(workerUrl, {}); // Send an empty JSON body
        console.log('Worker triggered successfully:', response.status, response.data);
    } catch (error: any) {
        console.error('Failed to trigger worker:');
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error setting up request:', error.message);
        }
        throw error;
    }
} 