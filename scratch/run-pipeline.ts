import dotenv from 'dotenv';
import path from 'path';

// Configure dotenv before importing any files that initialize Redis/Supabase
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
  try {
    const { fetchHubSpotPipeline } = await import('../lib/integrations/hubspot-pipeline');
    const clientId = 'c8aa7742-287a-40ea-9d5c-064b51a58d9c';
    console.log('Running fetchHubSpotPipeline for client:', clientId);
    const deals = await fetchHubSpotPipeline(clientId);
    console.log('Fetched deals count:', deals.length);
    console.log('Deals list:', JSON.stringify(deals, null, 2));
  } catch (err) {
    console.error('Error running pipeline:', err);
  }
}

run();
