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

// ─── Extract link Netflix từ HTML hoặc text ───────────────────────────────────
// mailparser decode quoted-printable nhưng giữ &amp; trong href → cần replace
function extractNetflixLinks(html, text) {
  if (html) {
    const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map(m => m[1].replace(/&amp;/g, '&'))
      .filter(u => u.includes('netflix.com'));
    if (hrefs.length > 0) return hrefs;
  }
  if (text) {
    // Tìm URL trong plain text (kể cả trong email forward có thể bị wrap)
    const matches = text.match(/https?:\/\/(?:www\.)?netflix\.com\/[^\s"'<>\)\]\n]+/gi) || [];
    return matches.map(l => l.replace(/&amp;/g, '&').replace(/["'>)\]]+$/, ''));
  }
  return [];
}

// ─── Whitelist: chỉ giữ link hành động thực sự ────────────────────────────────
function isActionLink(u) {
  return (
    u.includes('/account/travel/verify') ||
    u.includes('/ilum') ||
    u.includes('update-primary-location') ||
    u.includes('update-household')
  );
}

// ─── Parse email → { type, value, timestamp, subject } hoặc null ─────────────
// Ưu tiên: link > mã OTP
function parseEmail(parsed) {
  const emailDate = parsed.date;
  if (!emailDate) return null;

  const htmlContent = parsed.html || '';
  const textContent = parsed.text || '';
  const subject = parsed.subject || '';

  // Bỏ qua email không liên quan đến Netflix
  const isNetflixRelated =
    (parsed.from?.text || '').toLowerCase().includes('netflix') ||
    subject.toLowerCase().includes('netflix') ||
    htmlContent.toLowerCase().includes('netflix') ||
    textContent.toLowerCase().includes('netflix');

  if (!isNetflixRelated) return null;

  // Tìm link hành động
  const allLinks = extractNetflixLinks(htmlContent, textContent);
  const validLinks = allLinks.filter(u => isActionLink(u));

  const travelLink    = validLinks.find(l => l.includes('/account/travel/verify')) || null;
  const ilumLink      = validLinks.find(l => l.includes('/ilum')) || null;
  const householdLink = validLinks.find(l =>
    l.includes('update-primary-location') || l.includes('update-household')
  ) || null;

  const finalLink = travelLink || ilumLink || householdLink || null;

  if (finalLink) {
    return { type: 'link', value: finalLink, timestamp: emailDate, subject: subject || 'Netflix Email' };
  }

  // Fallback: mã OTP
  // Tìm mã 4-8 chữ số đứng độc lập (không phải số điện thoại, năm, v.v.)
  // Ưu tiên tìm trong context "mã", "code", "verify" trước
  const codeContextMatch = textContent.match(
    /(?:m[aã]|code|verify|verification|x[aá]c\s*minh|x[aá]c\s*nh[aậ]n)[^\d]{0,30}(\d{4,8})/i
  );
  if (codeContextMatch) {
    return { type: 'code', value: codeContextMatch[1], timestamp: emailDate, subject: subject || 'Netflix Email' };
  }

  // Tìm số 4-8 chữ số đứng trên dòng riêng (thường là OTP)
  const standaloneCode = textContent.match(/^\s*(\d{4,8})\s*$/m);
  if (standaloneCode) {
    return { type: 'code', value: standaloneCode[1], timestamp: emailDate, subject: subject || 'Netflix Email' };
  }

  return null;
}

// ─── Search email với 4 bước fallback ────────────────────────────────────────
function searchEmails(imap, since) {
  return new Promise((resolve, reject) => {
    // Bước 1: OR (FROM netflix) (SUBJECT netflix) — bắt cả email gốc lẫn forward
    imap.search([['OR', ['FROM', 'netflix'], ['SUBJECT', 'netflix']], ['SINCE', since]], (err, results) => {
      if (!err && results && results.length > 0) return resolve(results);

      // Bước 2: chỉ FROM netflix
      imap.search([['FROM', 'netflix'], ['SINCE', since]], (err2, results2) => {
        if (!err2 && results2 && results2.length > 0) return resolve(results2);

        // Bước 3: chỉ SUBJECT netflix (bắt email forward "Fwd: ...netflix...")
        imap.search([['SUBJECT', 'netflix'], ['SINCE', since]], (err3, results3) => {
          if (!err3 && results3 && results3.length > 0) return resolve(results3);

          // Bước 4: lấy tất cả email 7 ngày gần nhất, tự lọc theo nội dung
          imap.search([['SINCE', since]], (err4, results4) => {
            if (err4 || !results4 || results4.length === 0) {
              return reject(new Error('Không tìm thấy email nào trong 7 ngày gần nhất.'));
            }
            resolve(results4);
          });
        });
      });
    });
  });
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

  // Tổng timeout 55s (Vercel function limit 60s)
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ message: 'Request timeout: Email fetch took too long' });
    }
  }, 55000);

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
      connTimeout: 15000,
      authTimeout: 15000,
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

      // IMAP timeout 50s
      const imapTimeout = setTimeout(() => {
        settle(reject, new Error('IMAP operation timeout — kết nối email quá chậm, vui lòng thử lại.'));
      }, 50000);

      imap.once('ready', async () => {
        try {
          await new Promise((res2, rej2) => imap.openBox('INBOX', true, (e) => e ? rej2(e) : res2()));

          const since = new Date();
          since.setDate(since.getDate() - 7);

          // Tìm email: bắt cả email gốc từ Netflix lẫn email forward
          const results = await searchEmails(imap, since);

          // Lấy 20 email gần nhất để tăng khả năng tìm thấy
          const toFetch = results.slice(-20);
          const parsed_emails = [];
          let processedCount = 0;

          const f = imap.fetch(toFetch, { bodies: '' });

          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                processedCount++;
                if (!err && parsed) {
                  const r = parseEmail(parsed);
                  if (r) parsed_emails.push(r);
                }

                if (processedCount >= toFetch.length) {
                  if (parsed_emails.length === 0) {
                    return settle(reject, new Error('Không tìm thấy email Netflix nào có link hoặc mã hợp lệ trong 7 ngày gần nhất.'));
                  }

                  // Lọc email trong 30 phút gần nhất
                  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
                  const recent = parsed_emails.filter(e => new Date(e.timestamp) >= thirtyMinutesAgo);

                  if (recent.length === 0) {
                    return settle(reject, new Error('Không tìm thấy email Netflix trong 30 phút gần nhất. Vui lòng yêu cầu Netflix gửi lại email và thử lại.'));
                  }

                  // Lấy email mới nhất
                  recent.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                  const best = recent[0];

                  if (best.type === 'link') {
                    settle(resolve, { code: null, householdLink: best.value, timestamp: best.timestamp, emailSubject: best.subject });
                  } else {
                    settle(resolve, { code: best.value, householdLink: null, timestamp: best.timestamp, emailSubject: best.subject });
                  }
                }
              });
            });
          });

          f.once('error', (err) => settle(reject, err));
          f.once('end', () => {});

        } catch (e) {
          settle(reject, e);
        }
      });

      imap.once('error', (err) => settle(reject, err));
      try { imap.connect(); } catch (e) { settle(reject, e); }
    });

    clearTimeout(requestTimeout);
    res.status(200).json(result);

  } catch (error) {
    clearTimeout(requestTimeout);
    let errorMessage = error.message || 'Unknown error occurred';
    if (error.message?.includes('ECONNREFUSED')) errorMessage = 'Không thể kết nối đến email server.';
    else if (error.message?.includes('ENOTFOUND')) errorMessage = 'Không tìm thấy email server. Kiểm tra lại IMAP host.';
    else if (error.message?.includes('ETIMEDOUT')) errorMessage = 'Kết nối email server bị timeout.';
    else if (error.message?.includes('Invalid login') || error.message?.includes('Authentication failed')) errorMessage = 'Sai email hoặc mật khẩu IMAP.';
    else if (error.message?.includes('IMAP operation timeout')) errorMessage = error.message;
    console.error('Fetch Code Error:', error);
    res.status(500).json({ message: errorMessage });
  }
}
