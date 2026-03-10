import { createClient } from '@supabase/supabase-js';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET /api/admin-users — lấy danh sách tất cả users
  if (req.method === 'GET') {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, username, is_admin, imap_email, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const result = (users || []).map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: u.is_admin || false,
        createdAt: u.created_at,
        hasImapConfigured: !!u.imap_email,
      }));
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/admin-users — tạo user mới
  if (req.method === 'POST') {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username is required' });
    try {
      // Kiểm tra trùng username
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();
      if (existing) return res.status(400).json({ error: 'Username đã tồn tại' });

      const { data: newUser, error } = await supabase
        .from('users')
        .insert({ username, is_admin: false })
        .select('id, username, is_admin, imap_email, created_at')
        .single();
      if (error) throw error;
      return res.status(200).json({
        id: newUser.id,
        username: newUser.username,
        isAdmin: newUser.is_admin || false,
        createdAt: newUser.created_at,
        hasImapConfigured: !!newUser.imap_email,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/admin-users?userId=xxx — xóa user
  if (req.method === 'DELETE') {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    try {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
