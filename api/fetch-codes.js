import Imap from 'imap';
import { simpleParser } from 'mailparser';
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

  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  try {
    const decrypt = (text) => {
      if (!text || !process.env.ENCRYPTION_KEY || !text.includes(':')) return text;
      try {
        const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        return Buffer.concat([decipher.update(Buffer.from(parts.join(':'), 'hex')), decipher.final()]).toString();
      } catch {
        return text;
      }
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, is_admin, imap_email, imap_password, imap_host, imap_port, imap_allowed_senders')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let imapEmail = user.imap_email;
    let imapPassword = decrypt(user.imap_password);
    let imapHost = user.imap_host;
    let imapPort = user.imap_port || 993;
    let allowedSenders = user.imap_allowed_senders || 'info@account.netflix.com,netflix@netflix.com';

    if (!imapEmail) {
      const { data: shared } = await supabase
        .from('imap_config')
        .select('email, password, host, port, allowed_senders')
        .eq('is_shared', true)
        .single();
      if (!shared) {
        return res.status(400).json({ error: 'Chưa có cấu hình IMAP. Liên hệ admin.' });
      }
      imapEmail = shared.email;
      imapPassword = decrypt(shared.password);
      imapHost = shared.host;
      imapPort = shared.port || 993;
      allowedSenders = shared.allowed_senders || 'info@account.netflix.com,netflix@netflix.com';
    }

    const imap = new Imap({
      user: imapEmail,
      password: imapPassword,
      host: imapHost,
      port: imapPort,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    const result = await new Promise((resolve, reject) => {
      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) return reject(err);
          
          // [SỬA 1] Chỉ lấy email trong 5 phút gần nhất
          const since = new Date();
          since.setMinutes(since.getMinutes() - 5);
          
          imap.search([['FROM', 'netflix'], ['SINCE', since]], (err, results) => {
            if (err) return reject(err);
            
            if (!results || results.length === 0) {
              return reject(new Error('Không tìm thấy email Netflix trong 5 phút gần nhất'));
            }

            const f = imap.fetch(results[results.length - 1], { bodies: '' });
            
            f.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, (err, parsed) => {
                  if (err) return reject(err);
                  
                  const htmlContent = parsed.html || '';
                  const textContent = parsed.text || '';
                  
                  // Tìm mã OTP 4-6 chữ số
                  const codeMatch = textContent.match(/\b(\d{4,6})\b/) || htmlContent.match(/\b(\d{4,6})\b/);
                  const code = codeMatch ? codeMatch[1] : null;
                  
                  // [SỬA 2] Tìm link nút đỏ từ HTML email
                  // mailparser tự decode quoted-printable nên link trong HTML đã đầy đủ
                  // Chỉ cần decode &amp; → &
                  const rawHrefs = [...htmlContent.matchAll(/href=["']([^"']+)["']/gi)].map(m =>
                    m[1].replace(/&amp;/g, '&')
                  );

                  // Danh sách các pattern cần loại trừ (link phụ, tracking, footer)
                  const isExcluded = (u) =>
                    u.includes('lkid=') ||
                    u.includes('lnktrk=') ||
                    u.includes('ManageAccountAccess') ||
                    u.includes('password?') ||
                    u.includes('notificationsettings') ||
                    u.includes('TermsOfUse') ||
                    u.includes('PrivacyPolicy') ||
                    u.includes('browse?') ||
                    u.includes('help.netflix') ||
                    u.includes('denysignin') ||
                    u.includes('unsubscribe');

                  let accessLink = null;

                  // Ưu tiên 1: /account/travel/verify (email "Mã truy cập tạm thời" - nút "Nhận mã")
                  accessLink = rawHrefs.find(u =>
                    u.includes('netflix.com') &&
                    u.includes('/account/travel/verify') &&
                    !isExcluded(u)
                  ) || null;

                  // Ưu tiên 2: /ilum?code= (email "Phê duyệt đăng nhập mới" - nút "Phê duyệt")
                  if (!accessLink) {
                    accessLink = rawHrefs.find(u =>
                      u.includes('netflix.com') &&
                      u.includes('/ilum') &&
                      !isExcluded(u)
                    ) || null;
                  }

                  // Ưu tiên 3: link household
                  if (!accessLink) {
                    accessLink = rawHrefs.find(u =>
                      u.includes('netflix.com') &&
                      (u.includes('update-primary-location') || u.includes('update-household')) &&
                      !isExcluded(u)
                    ) || null;
                  }

                  resolve({
                    code,
                    householdLink: accessLink,
                    timestamp: parsed.date,
                    emailSubject: parsed.subject
                  });
                });
              });
            });
            
            f.once('end', () => imap.end());
          });
        });
      });
      
      imap.once('error', reject);
      imap.connect();
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
