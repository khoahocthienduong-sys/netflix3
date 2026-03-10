import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Cấu hình CORS cho Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { userId } = req.query; // Vercel lấy params qua req.query

  // Validate userId
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid or missing userId parameter' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // Set timeout for the entire request (30 seconds)
  const requestTimeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ message: 'Request timeout: Email fetch took too long' });
    }
  }, 30000);

  try {
    // Fetch user with timeout
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      clearTimeout(requestTimeout);
      return res.status(404).json({ message: 'User not found' });
    }

    // Validate IMAP configuration
    if (!user.imap_email || !user.imap_host || !user.imap_password) {
      clearTimeout(requestTimeout);
      return res.status(400).json({ message: 'IMAP configuration incomplete for this user' });
    }

    // Giải mã mật khẩu
    const decrypt = (text) => {
      if (!text || !process.env.ENCRYPTION_KEY || !text.includes(':')) return text;
      try {
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(process.env.ENCRYPTION_KEY), iv);
        return Buffer.concat([decipher.update(Buffer.from(parts.join(':'), 'hex')), decipher.final()]).toString();
      } catch (err) {
        console.error('Decryption error:', err);
        throw new Error('Failed to decrypt IMAP password');
      }
    };

    const imap = new Imap({
      user: user.imap_email,
      password: decrypt(user.imap_password),
      host: user.imap_host,
      port: user.imap_port || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000, // 10 second connection timeout
      authTimeout: 10000, // 10 second auth timeout
    });

    const result = await new Promise((resolve, reject) => {
      // Set IMAP operation timeout (20 seconds)
      const imapTimeout = setTimeout(() => {
        imap.end();
        reject(new Error('IMAP operation timeout: Email search took too long'));
      }, 20000);

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err) => {
          if (err) {
            clearTimeout(imapTimeout);
            return reject(err);
          }

          // Tìm email trong 7 ngày để có đủ kết quả, sau đó lọc 5 phút
          const since = new Date();
          since.setDate(since.getDate() - 7);

          // Hàm kiểm tra email có trong 5 phút gần nhất không
          const isWithin5Minutes = (emailDate) => {
            if (!emailDate) return false;
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            return new Date(emailDate) >= fiveMinutesAgo;
          };

          imap.search([['FROM', 'netflix'], ['SINCE', since]], (err, results) => {
            if (err) {
              clearTimeout(imapTimeout);
              return reject(err);
            }

            if (!results || results.length === 0) {
              clearTimeout(imapTimeout);
              imap.end();
              return reject(new Error('No Netflix emails found in the last 7 days.'));
            }

            // Lấy tối đa 10 email mới nhất để kiểm tra
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

                      // Chỉ xử lý email trong 5 phút gần nhất
                      if (isWithin5Minutes(emailDate)) {
                        // Ưu tiên dùng HTML để extract link chính xác hơn
                        const htmlContent = parsed.html || '';
                        const textContent = parsed.text || '';

                        // Extract verification code (4-6 digits) - tìm trong text
                        const codeMatch = textContent.match(/\b(\d{4,6})\b/);
                        const code = codeMatch ? codeMatch[1] : null;

                        // [SỬA] Extract link Netflix từ href trong HTML (chính xác hơn regex trên text)
                        // mailparser đã decode quoted-printable → href đầy đủ, chỉ cần decode &amp;
                        const extractNetflixLinks = (html, text) => {
                          // Ưu tiên lấy từ href trong HTML
                          if (html) {
                            const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
                              .map(m => m[1].replace(/&amp;/g, '&'))
                              .filter(u => u.includes('netflix.com'));
                            if (hrefs.length > 0) return hrefs;
                          }
                          // Fallback: tìm link trong text thuần
                          if (text) {
                            const matches = text.match(/https?:\/\/(?:www\.)?netflix\.com\/[^\s"'<>\)\]]+/gi) || [];
                            return matches.map(l => l.replace(/&amp;/g, '&').replace(/["'>]+$/, ''));
                          }
                          return [];
                        };

                        const allLinks = extractNetflixLinks(htmlContent, textContent);

                        // Loại trừ link phụ/tracking/footer
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

                        // Phân loại link theo thứ tự ưu tiên
                        // Ưu tiên 1: /account/travel/verify (nút "Nhận mã" - Mã truy cập tạm thời)
                        const travelLink = validLinks.find(l => l.includes('/account/travel/verify')) || null;

                        // Ưu tiên 2: /ilum?code= (nút "Phê duyệt đăng nhập mới")
                        const ilumLink = validLinks.find(l => l.includes('/ilum')) || null;

                        // Ưu tiên 3: link household
                        const householdLink = validLinks.find(l =>
                          l.includes('update-primary-location') || l.includes('update-household')
                        ) || null;

                        // Lấy link theo thứ tự ưu tiên
                        const finalLink = travelLink || ilumLink || householdLink || null;

                        // Ưu tiên email có mã hoặc link, lấy email mới nhất
                        if ((code || finalLink) && !foundEmail) {
                          foundEmail = {
                            code,
                            householdLink: finalLink,
                            timestamp: emailDate || new Date().toISOString(),
                            emailSubject: parsed.subject || 'Netflix Email'
                          };
                        }
                      }
                    } catch (parseErr) {
                      // Bỏ qua lỗi parse từng email, tiếp tục xử lý
                    }
                  }

                  // Sau khi xử lý tất cả email
                  if (processedCount >= totalToFetch) {
                    clearTimeout(imapTimeout);
                    imap.end();

                    if (foundEmail) {
                      resolve(foundEmail);
                    } else {
                      reject(new Error('No Netflix email found in the last 5 minutes. Please wait for a new email and try again.'));
                    }
                  }
                });
              });
            });

            f.once('error', (err) => {
              clearTimeout(imapTimeout);
              reject(err);
            });

            f.once('end', () => {
              // Đợi message parsing hoàn tất
            });
          });
        });
      });

      imap.once('error', (err) => {
        clearTimeout(imapTimeout);
        reject(err);
      });

      imap.once('end', () => {
        // IMAP connection closed
      });

      // Attempt to connect with error handling
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          clearTimeout(imapTimeout);
          reject(err);
        }
      });

      try {
        imap.connect();
      } catch (connectErr) {
        clearTimeout(imapTimeout);
        reject(connectErr);
      }
    });
 
    clearTimeout(requestTimeout);
    res.status(200).json(result);

  } catch (error) {
    clearTimeout(requestTimeout);

    // Provide detailed error messages
    let errorMessage = error.message || 'Unknown error occurred';

    // Handle specific error types
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
