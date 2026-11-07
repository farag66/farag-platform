// api/webhook.js - Farag Platform V2
// بيستقبل كومنت فيسبوك -> يدوره على المحفز -> يحطه في طابور الصفحة دي بس

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'farag_v2_verify';

async function supabase(table, method = 'GET', body = null, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : null
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

export default async function handler(req, res) {
  // 1. فيسبوك بيتحقق من الويب هوك
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // 2. استقبال الكومنت
  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (body.object !== 'page') return res.status(200).send('EVENT_RECEIVED');

      for (const entry of body.entry || []) {
        const pageId = entry.id; // facebook_page_id
        const changes = entry.changes || [];

        // هات الصفحة دي من الداتا بيز
        const pages = await supabase('pages', 'GET', null, `?facebook_page_id=eq.${pageId}&select=id,owner_id,is_active`);
        if (!pages.length || !pages[0].is_active) continue;
        const page = pages[0];

        for (const change of changes) {
          if (change.field !== 'feed') continue;
          const val = change.value || {};
          if (val.item !== 'comment' || val.verb !== 'add') continue;

          const commentText = (val.message || '').trim();
          const commentId = val.comment_id;
          const postId = val.post_id;
          const senderId = val.from?.id || 'unknown';
          const senderName = val.from?.name || '';

          // هات المحفزات بتاعة الصفحة دي
          const triggers = await supabase('triggers', 'GET', null, `?page_id=eq.${page.id}&is_active=eq.true&select=*`);
          // شوف انهي محفز مطابق للكومنت
          let matched = triggers.find(t => t.trigger_type === 'comment' && (!t.keyword || commentText.toLowerCase().includes(t.keyword.toLowerCase())));
          if (!matched && triggers.length) matched = triggers.find(t => t.trigger_type === 'comment' && !t.keyword);
          if (!matched) continue;

          // اعمل / هات المشترك
          let subs = await supabase('subscribers', 'GET', null, `?page_id=eq.${page.id}&psid=eq.${senderId}&select=id`);
          let subId;
          if (subs.length) {
            subId = subs[0].id;
          } else {
            const created = await supabase('subscribers', 'POST', {
              page_id: page.id,
              psid: senderId,
              full_name: senderName,
              opted_in: true,
              last_interaction_at: new Date().toISOString()
            });
            subId = created[0]?.id;
          }

          // حطه في الطابور بتاع الصفحة دي بس - ده قلب V2
          await supabase('queue_jobs', 'POST', {
            page_id: page.id,
            owner_id: page.owner_id,
            subscriber_id: subId,
            post_id: postId,
            comment_id: commentId,
            comment_text: commentText,
            status: 'pending',
            scheduled_at: new Date().toISOString()
          });
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    } catch (e) {
      console.error(e);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }
  return res.status(405).send('Method Not Allowed');
}
