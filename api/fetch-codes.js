import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ─── Helper: giải mã mật khẩu IMAP ──────────────────────────────────────────
// PHẢI dùng SHA-256 để chuẩn hóa key về 32 bytes — giống hàm encrypt() trong
// imap-config.js và save-user.js. Nếu không hash key, AES-256-CBC sẽ báo
// "Invalid key length" và ném ra "Failed to decrypt IMAP password".
function decrypt(text) {
  if (!text) return text;
  if (!process.env.ENCRYPTION_KEY) return text;
  if (!text.includes(':')) return text; // plain text (chưa mã hóa)
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

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing userId parameter' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // Timeout toàn bộ request (30 giây)
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ message: 'Request timeout: Email fetch took too long' });
    }
  }, 30000);

  try {
    // ── Lấy thông tin user ────────────────────────────────────────────────
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      clearTimeout(requestTimeout);
      return res.status(404).json({ message: 'User not found' });
    }

    // ── Xác định IMAP config: ưu tiên riêng của user, fallback sang shared ─
    let imapEmail = user.imap_email;
    let imapPassword = user.imap_password;
    let imapHost = user.imap_host;
    let imapPort = user.imap_port;

    if (!imapEmail || !imapHost || !imapPassword) {
      // Thử lấy shared config
      const { data: shared } = await supabase
        .from('imap_config')
        .select('email, password, host, port')
        .eq('is_shared', true)
        .single();

      if (shared && shared.email && shared.host && shared.password) {
        imapEmail = shared.email;
        imapPassword = shared.password;
        imapHost = shared.host;
        imapPort = shared.port;
      } else {
        clearTimeout(requestTimeout);
        return res.status(400).json({ message: 'IMAP configuration incomplete for this user' });
      }
    }

    // ── Giải mã mật khẩu ─────────────────────────────────────────────────
    const decryptedPassword = decrypt(imapPassword);

    // ── Kết nối IMAP ──────────────────────────────────────────────────────
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
        settle(reject, new Error('IMAP operation timeout: Email search took too long'));
      }, 20000);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) return settle(reject, err);

          // Tìm email Netflix trong 7 ngày gần nhất
          const since = new Date();
          since.setDate(since.getDate() - 7);

          const isWithin5Minutes = (emailDate) => {
            if (!emailDate) return false;
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            return new Date(emailDate) >= fiveMinutesAgo;
          };

          imap.search([['FROM', 'netflix'], ['SINCE', since]], (err, results) => {
            if (err) return settle(reject, err);

            if (!results || results.length === 0) {
              return settle(reject, new Error('No Netflix emails found in the last 7 days.'));
            }

            const recentResults = results.slice(-10);
            let processedCount = 0;
            let foundEmail = null;
            const totalToFetch = recentResults.length;

            const f = imap.fetch(recentResults, { bodies: '' });

            f.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream, async (err, parsed) => {
                  processedCount++;

                  if (!err) {
                    try {
                      const emailDate = parsed.date;

                      if (isWithin5Minutes(emailDate)) {
                        const htmlContent = parsed.html || '';
                        const textContent = parsed.text || '';

                        // Tìm mã OTP 4-6 chữ số
                        const codeMatch = textContent.match(/\b(\d{4,6})\b/);
                        const code = codeMatch ? codeMatch[1] : null;

                        // Lấy tất cả href Netflix từ HTML, fallback sang text
                        const extractNetflixLinks = (html, text) => {
                          if (html) {
                            const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
                              .map(m => m[1].replace(/&amp;/g, '&'))
                              .filter(u => u.includes('netflix.com'));
                            if (hrefs.length > 0) return hrefs;
                          }
                          if (text) {
                            const matches = text.match(/https?:\/\/(?:www\.)?netflix\.com\/[^\s"'<>\)\]]+/gi) || [];
                            return matches.map(l => l.replace(/&amp;/g, '&').replace(/["'>]+$/, ''));
                          }
                          return [];
                        };

                        const allLinks = extractNetflixLinks(htmlContent, textContent);

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

                        const validLinks = allLinks.filter(u => !isExcluded(u));

                        const travelLink = validLinks.find(l => l.includes('/account/travel/verify')) || null;
                        const ilumLink = validLinks.find(l => l.includes('/ilum')) || null;
                        const householdLink = validLinks.find(l =>
                          l.includes('update-primary-location') || l.includes('update-household')
                        ) || null;

                        const finalLink = travelLink || ilumLink || householdLink || null;

                        if ((code || finalLink) && !foundEmail) {
                          foundEmail = {
                            code,
                            householdLink: finalLink,
                            timestamp: emailDate || new Date().toISOString(),
                            emailSubject: parsed.subject || 'Netflix Email',
                          };
                        }
                      }
                    } catch (_) {
                      // bỏ qua lỗi parse từng email
                    }
                  }

                  if (processedCount >= totalToFetch) {
                    if (foundEmail) {
                      settle(resolve, foundEmail);
                    } else {
                      settle(reject, new Error('No Netflix email found in the last 5 minutes. Please wait for a new email and try again.'));
                    }
                  }
                });
              });
            });

            f.once('error', (err) => settle(reject, err));

            f.once('end', () => {
              // Đợi message parsing hoàn tất — xử lý trong processedCount >= totalToFetch
            });
          });
        });
      });

      imap.once('error', (err) => settle(reject, err));

      try {
        imap.connect();
      } catch (connectErr) {
        settle(reject, connectErr);
      }
    });

    clearTimeout(requestTimeout);
    res.status(200).json(result);

  } catch (error) {
    clearTimeout(requestTimeout);

    let errorMessage = error.message || 'Unknown error occurred';

    if (error.message && error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused: Cannot connect to email server. Please check IMAP configuration.';
    } else if (error.message && error.message.includes('ENOTFOUND')) {
      errorMessage = 'Email server not found: Invalid IMAP host. Please verify the host address.';
    } else if (error.message && error.message.includes('ETIMEDOUT')) {
      errorMessage = 'Connection timeout: Email server is not responding. Please try again later.';
    } else if (error.message && error.message.includes('Invalid login')) {
      errorMessage = 'Authentication failed: Invalid email or password for IMAP server.';
    }

    console.error('Fetch Code Error:', error);
    res.status(500).json({ message: errorMessage });
  }
}
