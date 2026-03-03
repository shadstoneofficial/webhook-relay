const axios = require('axios');
const crypto = require('crypto');

// Configuration
// You can get these from the agent's registration response or database
const RELAY_URL = 'https://relay.powerlobster.com';
const RELAY_ID = 'agt_3eb846510c9248cc'; // From the report
const WEBHOOK_SECRET = 'your-webhook-secret'; // Must match the server env var

async function sendTestWebhook() {
  const timestamp = Date.now().toString();
  const payload = {
    event: 'dm.received',
    data: {
      message_id: 'msg_123',
      sender_handle: 'test_user',
      content: 'Hello from the test script!'
    }
  };

  // Create signature
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');

  try {
    console.log(`Sending webhook to ${RELAY_URL}/api/v1/webhook/${RELAY_ID}...`);
    
    const response = await axios.post(
      `${RELAY_URL}/api/v1/webhook/${RELAY_ID}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-powerlobster-signature': `sha256=${signature}`,
          'x-powerlobster-timestamp': timestamp
        }
      }
    );

    console.log('Success!', response.status, response.data);
  } catch (error) {
    console.error('Failed:', error.response ? error.response.data : error.message);
  }
}

sendTestWebhook();
