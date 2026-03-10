import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ─── Giải mã mật khẩu IMAP (AES-256-CBC, key chuẩn hóa qua SHA-256) ─────────
function decrypt(text) {
  if (!text) return text;
  if (!process.env.ENCRYPTION_KEY) return text;
  if (!text.includes(':')) return text;
  try {
    const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([
      decipher.update(Buffer.from(parts.join(':'), 'hex')),
      decipher.final(),
    ]).toString();
  } catch (err) {
    console.error('Decryption error:', err);
    throw new Error('Failed to decrypt IMAP password');
  }
}

// ─── Extract link Netflix từ HTML (đã decode quoted-printable bởi mailparser) ─
// mailparser giữ nguyên &amp; trong href → cần replace về &
function extractNetflixLinks(html, text) {
  if (html) {
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map(m => m[1].replace(/&amp;/g, '&'))
      .filter(u => u.includes('netflix.com'));
    if (hrefs.length > 0) return hrefs;
  }
  if (text) {
    const matches = text.match(/https?:\/\/(?:www\.)?netflix\.com\/[^\s"'<>\)\]\n]+/gi) || [];
    return matches.map(l => l.replace(/&amp;/g, '&').replace(/["'>]+$/, ''));
  }
  return [];
}

// ─── Kiểm tra link có phải loại cần thiết không ──────────────────────────────
function isExcluded(u) {
  return (
    u.includes('lkid=URL_LOGO') ||
    u.includes('lkid=URL_EMAIL') ||
    u.includes('lkid=URL_SRC') ||
    u.includes('ManageAccountAccess') ||
    u.includes('/password?') ||
    u.includes('notificationsettings') ||
    u.includes('TermsOfUse') ||
    u.includes('PrivacyPolicy') ||
    u.includes('/browse?') ||
    u.includes('help.netflix') ||
    u.includes('denysignin') ||
    u.includes('unsubscribe') ||
    u.includes('accountaccess') ||
    u.includes('lnktrk=EVO') && !u.includes('travel/verify') && !u.includes('/ilum') && !u.includes('update-primary-location') && !u.includes('update-household')
  );
}

// ─── Parse một email, trả về { type, value, timestamp, subject } hoặc null ───
// type: 'link' | 'code'
// Ưu tiên: link travel/verify > link ilum > link household > mã OTP
function parseEmail(parsed) {
  const emailDate = parsed.date;
  if (!emailDate) return null;

  const htmlContent = parsed.html || '';
  const textContent = parsed.text || '';

  const allLinks = extractNetflixLinks(htmlContent, textContent);
  const validLinks = allLinks.filter(u => !isExcluded(u));

  // Ưu tiên link
  const travelLink = validLinks.find(l => l.includes('/account/travel/verify')) || null;
  const ilumLink   = validLinks.find(l => l.includes('/ilum')) || null;
  const householdLink = validLinks.find(l =>
    l.includes('update-primary-location') || l.includes('update-household')
  ) || null;

  const finalLink = travelLink || ilumLink || householdLink || null;

  if (finalLink) {
    return {
      type: 'link',
      value: finalLink,
      timestamp: emailDate,
      subject: parsed.subject || 'Netflix Email',
    };
  }

  // Fallback: mã OTP 4-6 chữ số
  const codeMatch = textContent.match(/\b(\d{4,6})\b/);
  if (codeMatch) {
    return {
      type: 'code',
      value: codeMatch[1],
      timestamp: emailDate,
      subject: parsed.subject || 'Netflix Email',
    };
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { userId } = req.query;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing userId parameter' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ message: 'Request timeout: Email fetch took too long' });
    }
  }, 30000);

  try {
    // ── Lấy user ────────────────────────────────────────────────────────────
    const { data: user, error: userError } = await supabase
      .from('users').select('*').eq('id', userId).single();

    if (userError || !user) {
      clearTimeout(requestTimeout);
      return res.status(404).json({ message: 'User not found' });
    }

    // ── Xác định IMAP config (riêng → shared) ───────────────────────────────
    let imapEmail    = user.imap_email;
    let imapPassword = user.imap_password;
    let imapHost     = user.imap_host;
    let imapPort     = user.imap_port;

    if (!imapEmail || !imapHost || !imapPassword) {
      const { data: shared } = await supabase
        .from('imap_config').select('email, password, host, port')
        .eq('is_shared', true).single();

      if (shared && shared.email && shared.host && shared.password) {
        imapEmail    = shared.email;
        imapPassword = shared.password;
        imapHost     = shared.host;
        imapPort     = shared.port;
      } else {
        clearTimeout(requestTimeout);
        return res.status(400).json({ message: 'IMAP configuration incomplete for this user' });
      }
    }

    const decryptedPassword = decrypt(imapPassword);

    // ── Kết nối IMAP ────────────────────────────────────────────────────────
    const imap = new Imap({
      user: imapEmail,
      password: decryptedPassword,
      host: imapHost,
      port: imapPort || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    const result = await new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(imapTimeout);
        try { imap.end(); } catch (_) {}
        fn(val);
      };

      const imapTimeout = setTimeout(() => {
        settle(reject, new Error('IMAP operation timeout'));
      }, 20000);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) return settle(reject, err);

          const since = new Date();
          since.setDate(since.getDate() - 7);

          imap.search([['FROM', 'netflix'], ['SINCE', since]], (err, results) => {
            if (err) return settle(reject, err);
            if (!results || results.length === 0) {
              return settle(reject, new Error('No Netflix emails found in the last 7 days.'));
            }

            // Lấy 10 email gần nhất
            const toFetch = results.slice(-10);
            const parsed_emails = [];
            let processedCount = 0;

            const f = imap.fetch(toFetch, { bodies: '' });

            f.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, (err, parsed) => {
                  processedCount++;

                  if (!err && parsed) {
                    const result = parseEmail(parsed);
                    if (result) parsed_emails.push(result);
                  }

                  if (processedCount >= toFetch.length) {
                    if (parsed_emails.length === 0) {
                      return settle(reject, new Error('No Netflix email found in the last 5 minutes. Please wait for a new email and try again.'));
                    }

                    // Lọc chỉ email trong 5 phút gần nhất
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                    const recent = parsed_emails.filter(e => new Date(e.timestamp) >= fiveMinutesAgo);

                    if (recent.length === 0) {
                      return settle(reject, new Error('No Netflix email found in the last 5 minutes. Please wait for a new email and try again.'));
                    }

                    // Sắp xếp theo thời gian mới nhất trước
                    recent.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                    // Lấy email mới nhất — chỉ trả 1 loại (link HOẶC mã)
                    const best = recent[0];

                    if (best.type === 'link') {
                      settle(resolve, {
                        code: null,
                        householdLink: best.value,
                        timestamp: best.timestamp,
                        emailSubject: best.subject,
                      });
                    } else {
                      settle(resolve, {
                        code: best.value,
                        householdLink: null,
                        timestamp: best.timestamp,
                        emailSubject: best.subject,
                      });
                    }
                  }
                });
              });
            });

            f.once('error', (err) => settle(reject, err));
            f.once('end', () => {});
          });
        });
      });

      imap.once('error', (err) => settle(reject, err));

      try { imap.connect(); } catch (e) { settle(reject, e); }
    });

    clearTimeout(requestTimeout);
    res.status(200).json(result);

  } catch (error) {
    clearTimeout(requestTimeout);
    let errorMessage = error.message || 'Unknown error occurred';
    if (error.message?.includes('ECONNREFUSED')) errorMessage = 'Connection refused: Cannot connect to email server.';
    else if (error.message?.includes('ENOTFOUND')) errorMessage = 'Email server not found: Invalid IMAP host.';
    else if (error.message?.includes('ETIMEDOUT')) errorMessage = 'Connection timeout: Email server is not responding.';
    else if (error.message?.includes('Invalid login')) errorMessage = 'Authentication failed: Invalid email or password.';
    console.error('Fetch Code Error:', error);
    res.status(500).json({ message: errorMessage });
  }
}
