// worker.js - Farag Platform Worker - بيبعت ماسنجر من queue_jobs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('❌ ناقص SUPABASE_URL او SUPABASE_SERVICE_ROLE_KEY في Secrets');
  process.exit(1);
}
if (!PAGE_TOKEN) {
  console.log('❌ ناقص PAGE_ACCESS_TOKEN في Secrets');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sendMessenger(psid, text) {
  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text: text }
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }
  return data;
}

async function processOneJob() {
  // هات أقدم شغلانة لسه pending
  const { data: jobs, error } = await supabase
    .from('queue_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.log('❌ خطأ في قراءة queue_jobs:', error.message);
    return false;
  }
  if (!jobs || jobs.length === 0) return false;

  const job = jobs[0];
  console.log(`📩 شغلانة جديدة: ${job.id} - نوعها: ${job.job_type}`);

  // اقفل عليها عشان مفيش worker تاني ياخدها
  await supabase.from('queue_jobs').update({ status: 'processing' }).eq('id', job.id);

  try {
    const payload = job.payload || {};
    const psid = payload.psid || payload.recipient_id || payload.sender_id;
    let text = payload.text || payload.message || '';

    // لو مفيش نص، حط الرسالة الافتراضية
    if (!text) text = 'يا محمد صل على النبي';

    if (!psid) throw new Error('مفيش psid في الشغلانة');

    await sendMessenger(psid, text);
    console.log(`✅ اتبعت لـ ${psid}: ${text}`);

    await supabase.from('queue_jobs').update({ status: 'done' }).eq('id', job.id);
    return true;
  } catch (err) {
    console.log(`❌ فشل في الشغلانة ${job.id}:`, err.message);
    await supabase.from('queue_jobs').update({ status: 'failed', error: err.message }).eq('id', job.id);
    return true;
  }
}

async function main() {
  console.log('🚀 Worker started - يا محمد صل على النبي');
  console.log('⏳ مستني شغلانات من queue_jobs...');
  while (true) {
    try {
      const didWork = await processOneJob();
      if (didWork) {
        // 1 في الثانية عشان ماسنجر ميعملش بلوك
        await sleep(1000);
      } else {
        // مفيش شغل، ريح 2 ثانية
        await sleep(2000);
      }
    } catch (e) {
      console.log('❌ خطأ عام:', e.message);
      await sleep(2000);
    }
  }
}

main();
