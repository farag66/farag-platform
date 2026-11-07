// worker.js - Farag Platform V2 Worker
// بيشتغل على Fly.io - بيسحب من الطابور ويبعت واتساب

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ ناقص SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function sendWhatsApp(to, body) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log('⚠️ مفيش WHATSAPP_TOKEN - هعمل سكيب للارسال لـ', to);
    return { skipped: true };
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: body },
    }),
  });
  const data = await res.json();
  return data;
}

async function processQueue() {
  try {
    // هات رسالة واحدة pending من الطابور
    const rows = await supabaseFetch(
      `messages_queue?status=eq.pending&order=created_at.asc&limit=1`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return; // مفيش حاجة
    }

    const job = rows[0];
    console.log('📤 ببعت رسالة لـ:', job.to_number, 'ID:', job.id);

    // علم عليها انها بتتبعت
    await supabaseFetch(`messages_queue?id=eq.${job.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processing', updated_at: new Date().toISOString() }),
    });

    const result = await sendWhatsApp(job.to_number, job.body || job.message || 'مرحبا');

    if (result?.error) {
      console.log('❌ فشل الارسال:', result.error.message);
      await supabaseFetch(`messages_queue?id=eq.${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed', error: result.error.message, updated_at: new Date().toISOString() }),
      });
    } else {
      console.log('✅ اتبعتت:', job.id);
      await supabaseFetch(`messages_queue?id=eq.${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      });
    }
  } catch (e) {
    console.log('❌ خطأ في الـ Worker:', e.message);
  }
}

console.log('🚀 Worker V2 شغال... بيcheck كل 5 ثواني');
setInterval(processQueue, 5000);
processQueue();
