import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
}

function encrypt(text) {
  if (!text) return text;
  // Nếu không có ENCRYPTION_KEY thì lưu plain text
  if (!process.env.ENCRYPTION_KEY) return text;
  // Dùng SHA-256 để chuẩn hóa key về đúng 32 bytes (AES-256 yêu cầu)
  const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { action, userId } = req.query;

  // GET /api/imap-config?action=user&userId=xxx — lấy config của user
  if (req.method === 'GET' && action === 'user') {
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const { data: user } = await supabase
        .from('users')
        .select('imap_email, imap_host, imap_port, imap_allowed_senders')
        .eq('id', userId)
        .single();
      if (user && user.imap_email) {
        return res.status(200).json({
          email: user.imap_email,
          host: user.imap_host,
          port: user.imap_port || 993,
          allowedSenders: user.imap_allowed_senders || 'info@account.netflix.com,netflix@netflix.com',
          isShared: false,
        });
      }
      // Fallback: lấy shared config
      const { data: shared } = await supabase
        .from('imap_config')
        .select('email, host, port, allowed_senders')
        .eq('is_shared', true)
        .single();
      if (shared) {
        return res.status(200).json({
          email: shared.email,
          host: shared.host,
          port: shared.port || 993,
          allowedSenders: shared.allowed_senders || 'info@account.netflix.com,netflix@netflix.com',
          isShared: true,
        });
      }
      return res.status(404).json({ error: 'No IMAP config found' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET /api/imap-config?action=shared — lấy shared config
  if (req.method === 'GET' && action === 'shared') {
    try {
      const { data: shared } = await supabase
        .from('imap_config')
        .select('email, host, port, allowed_senders')
        .eq('is_shared', true)
        .single();
      if (!shared) return res.status(404).json({ error: 'No shared config' });
      return res.status(200).json({
        email: shared.email,
        host: shared.host,
        port: shared.port || 993,
        allowedSenders: shared.allowed_senders || '',
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/imap-config?action=user — lưu IMAP riêng cho user
  if (req.method === 'POST' && action === 'user') {
    const { userId: uid, email, password, host, port, allowedSenders } = req.body || {};
    if (!uid || !email || !host) return res.status(400).json({ error: 'Missing fields' });
    try {
      const updateData = {
        imap_email: email,
        imap_host: host,
        imap_port: port || 993,
        imap_allowed_senders: allowedSenders || '',
        updated_at: new Date().toISOString(),
      };
      if (password) updateData.imap_password = encrypt(password);
      const { error } = await supabase.from('users').update(updateData).eq('id', uid);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/imap-config?action=user&userId=xxx — xóa IMAP riêng của user
  if (req.method === 'DELETE' && action === 'user') {
    if (!userId) return res.status(400).json({ error: 'userId required' });
    try {
      const { error } = await supabase.from('users').update({
        imap_email: null,
        imap_password: null,
        imap_host: null,
        imap_port: null,
        imap_allowed_senders: null,
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST /api/imap-config?action=shared — lưu shared config
  if (req.method === 'POST' && action === 'shared') {
    const { email, password, host, port, allowedSenders } = req.body || {};
    if (!email || !host) return res.status(400).json({ error: 'Missing fields' });
    try {
      // Upsert vào bảng imap_config
      const { data: existing } = await supabase
        .from('imap_config')
        .select('id')
        .eq('is_shared', true)
        .single();

      const configData = {
        email,
        host,
        port: port || 993,
        allowed_senders: allowedSenders || '',
        is_shared: true,
        updated_at: new Date().toISOString(),
      };
      if (password) configData.password = encrypt(password);

      let error;
      if (existing) {
        ({ error } = await supabase.from('imap_config').update(configData).eq('id', existing.id));
      } else {
        ({ error } = await supabase.from('imap_config').insert(configData));
      }
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
