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
    // Kiểm tra xem user đã tồn tại chưa
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    let user;

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is expected for new users
      throw selectError;
    }

    if (existingUser) {
      // User tồn tại, cập nhật last_signed_in
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          last_signed_in: new Date().toISOString()
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) throw updateError;
      user = updatedUser;
    } else {
      // Tạo user mới
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          username,
          is_admin: false,
          created_at: new Date().toISOString(),
          last_signed_in: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;
      user = newUser;
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
