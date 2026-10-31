import { readFileSync } from 'node:fs';
import { haversine } from './geo.js';
import { emit } from './events.js';

const RECIPIENTS = JSON.parse(readFileSync(new URL('./recipients.json', import.meta.url), 'utf8'));

const AT_USERNAME = process.env.AFRICASTALKING_USERNAME || '';
const AT_API_KEY = process.env.AFRICASTALKING_API_KEY || '';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || '';

/**
 * Dispatch real or simulated GSM emergency flash SMS broadcast to contacts within radius.
 */
async function dispatchSms(phoneNumber, message) {
  // 1. Africa's Talking Gateway (Nigeria & Pan-African Telcos)
  if (AT_USERNAME && AT_API_KEY) {
    try {
      const body = new URLSearchParams({
        username: AT_USERNAME,
        to: phoneNumber,
        message,
      });
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'apiKey': AT_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });
      const data = await res.json();
      console.log(`[broadcaster:AT] Dispatched SMS to ${phoneNumber}:`, data);
      return true;
    } catch (err) {
      console.error(`[broadcaster:AT] Failed SMS to ${phoneNumber}:`, err.message);
    }
  }

  // 2. Twilio Gateway Fallback
  if (TWILIO_SID && TWILIO_AUTH && TWILIO_FROM) {
    try {
      const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
      const body = new URLSearchParams({
        From: TWILIO_FROM,
        To: phoneNumber,
        Body: message,
      });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      const data = await res.json();
      console.log(`[broadcaster:Twilio] Dispatched SMS to ${phoneNumber}:`, data.sid);
      return true;
    } catch (err) {
      console.error(`[broadcaster:Twilio] Failed SMS to ${phoneNumber}:`, err.message);
    }
  }

  // 3. Local Simulation Mode (No telecom keys configured)
  console.log(`[broadcaster:SIM] Simulated Flash SMS to ${phoneNumber}: "${message}"`);
  return true;
}

/**
 * Broadcast emergency warning to all recipients within the alert radius.
 */
export function broadcast({ message, lat, lng, radiusKm }) {
  const hits = RECIPIENTS.filter((r) => haversine({ lat, lng }, r) <= radiusKm * 1000);
  console.log(`[broadcast] ${hits.length} recipient(s) within ${radiusKm}km perimeter`);

  // Asynchronously dispatch SMS to all matched recipients
  for (const recipient of hits) {
    if (recipient.phone) {
      dispatchSms(recipient.phone, message).catch((e) => console.error('[broadcaster]', e));
    }
  }

  const result = {
    sent: hits.length,
    recipients: hits.map((r) => r.name),
    phones: hits.map((r) => r.phone),
    message,
  };

  emit('broadcast', result);
  return result;
}
