import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Chỉ cho phép đăng nhập nếu username đã được admin tạo sẵn trong database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, is_admin, imap_email, created_at')
      .eq('username', username)
      .single();

    if (error || !user) {
      // Không tìm thấy user — trả về lỗi, không tự tạo mới
      return res.status(401).json({ error: 'Tài khoản không tồn tại. Liên hệ admin để được cấp quyền truy cập.' });
    }

    res.status(200).json({
      id: user.id,
      username: user.username,
      isAdmin: user.is_admin || false,
      createdAt: user.created_at,
      hasImapConfigured: !!user.imap_email
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
