import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

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
      } catch { return text; }
    };

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, is_admin, imap_email, imap_password, imap_host, imap_port, imap_allowed_senders')
      .eq('id', userId)
      .single();

    if (userError || !user) return res.status(404).json({ error: 'User not found' });

    let imapEmail = user.imap_email;
    let imapPassword = decrypt(user.imap_password);
    let imapHost = user.imap_host;
    let imapPort = user.imap_port || 993;

    if (!imapEmail) {
      const { data: shared } = await supabase
        .from('imap_config')
        .select('email, password, host, port, allowed_senders')
        .eq('is_shared', true)
        .single();
      if (!shared) return res.status(400).json({ error: 'Chưa có cấu hình IMAP. Liên hệ admin.' });
      imapEmail = shared.email;
      imapPassword = decrypt(shared.password);
      imapHost = shared.host;
      imapPort = shared.port || 993;
    }

    // Mốc 5 phút để lọc sau khi fetch (IMAP SINCE chỉ lọc theo ngày, không theo phút)
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000);
    const sinceToday = new Date();
    sinceToday.setHours(0, 0, 0, 0);

    const result = await new Promise((resolve, reject) => {
      const imap = new Imap({
        user: imapEmail,
        password: imapPassword,
        host: imapHost,
        port: imapPort,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) { imap.end(); return reject(err); }

          imap.search([['FROM', 'netflix'], ['SINCE', sinceToday]], (err, results) => {
            if (err) { imap.end(); return reject(err); }

            if (!results || results.length === 0) {
              imap.end();
              return reject(new Error('Không tìm thấy email Netflix hôm nay'));
            }

            // Lấy tối đa 10 email mới nhất
            const toFetch = results.slice(-10);
            const emails = [];
            // FIX: dùng Promise để đảm bảo tất cả simpleParser chạy xong mới finalize
            const parsePromises = [];

            const f = imap.fetch(toFetch, { bodies: '' });

            f.on('message', (msg) => {
              const p = new Promise((res2) => {
                msg.on('body', (stream) => {
                  simpleParser(stream, (err, parsed) => {
                    if (!err && parsed) emails.push(parsed);
                    res2();
                  });
                });
                msg.once('end', () => res2()); // fallback nếu không có body
              });
              parsePromises.push(p);
            });

            f.once('error', (err) => { imap.end(); reject(err); });

            f.once('end', () => {
              // Chờ TẤT CẢ simpleParser xong rồi mới xử lý
              Promise.all(parsePromises).then(() => {
                imap.end();

                // Lọc chính xác theo timestamp 5 phút gần nhất
                const recentEmails = emails.filter(p => p.date && new Date(p.date) >= cutoffTime);

                if (recentEmails.length === 0) {
                  return reject(new Error('Không tìm thấy email Netflix trong 5 phút gần nhất'));
                }

                // Lấy email mới nhất
                recentEmails.sort((a, b) => new Date(b.date) - new Date(a.date));
                const parsed = recentEmails[0];

                const htmlContent = parsed.html || '';
                const textContent = parsed.text || '';

                // Tìm mã OTP 4-6 chữ số
                const codeMatch = textContent.match(/\b(\d{4,6})\b/) || htmlContent.match(/\b(\d{4,6})\b/);
                const code = codeMatch ? codeMatch[1] : null;

                // Tìm link nút đỏ từ HTML (mailparser đã decode quoted-printable)
                const rawHrefs = [...htmlContent.matchAll(/href=["']([^"']+)["']/gi)]
                  .map(m => m[1].replace(/&amp;/g, '&'));

                // Loại trừ các link phụ/tracking/footer
                const isExcluded = (u) =>
                  u.includes('lkid=') ||
                  u.includes('lnktrk=') ||
                  u.includes('ManageAccountAccess') ||
                  u.includes('/password?') ||
                  u.includes('notificationsettings') ||
                  u.includes('TermsOfUse') ||
                  u.includes('PrivacyPolicy') ||
                  u.includes('/browse?') ||
                  u.includes('help.netflix') ||
                  u.includes('denysignin') ||
                  u.includes('unsubscribe') ||
                  u.includes('accountaccess');

                let accessLink = null;

                // Ưu tiên 1: /account/travel/verify (nút "Nhận mã" - Mã truy cập tạm thời)
                accessLink = rawHrefs.find(u =>
                  u.includes('netflix.com') && u.includes('/account/travel/verify') && !isExcluded(u)
                ) || null;

                // Ưu tiên 2: /ilum?code= (nút "Phê duyệt đăng nhập mới")
                if (!accessLink) {
                  accessLink = rawHrefs.find(u =>
                    u.includes('netflix.com') && u.includes('/ilum') && !isExcluded(u)
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
