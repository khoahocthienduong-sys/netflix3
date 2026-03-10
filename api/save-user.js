import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

  const { username, imap_email, imap_password, imap_host, imap_port } = req.body;

  if (!username || !imap_email || !imap_password || !imap_host) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    // Mã hóa mật khẩu IMAP
    const encrypt = (text) => {
      if (!text) return text;
      if (!process.env.ENCRYPTION_KEY) return text;
      // Dùng SHA-256 để chuẩn hóa key về đúng 32 bytes (AES-256 yêu cầu)
      const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    };

    const encryptedPassword = encrypt(imap_password);

    // Kiểm tra xem user đã tồn tại chưa
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    let result;

    if (existingUser) {
      // Cập nhật user hiện tại
      result = await supabase
        .from('users')
        .update({
          imap_email,
          imap_password: encryptedPassword,
          imap_host,
          imap_port: imap_port || 993
        })
        .eq('id', existingUser.id)
        .select()
        .single();
    } else {
      // Tạo user mới
      result = await supabase
        .from('users')
        .insert({
          username,
          imap_email,
          imap_password: encryptedPassword,
          imap_host,
          imap_port: imap_port || 993
        })
        .select()
        .single();
    }

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    res.status(200).json({
      success: true,
      user: {
        id: result.data.id,
        username: result.data.username,
        imap_email: result.data.imap_email
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
