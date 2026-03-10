# NetFetch - Netflix Code Manager

Ứng dụng quản lý mã xác minh Netflix từ email IMAP. Deploy trên Vercel + Supabase.

## Tính Năng

- ✅ Lấy mã Netflix từ email IMAP
- ✅ Lưu thông tin IMAP được mã hóa
- ✅ Giao diện React đẹp mắt
- ✅ Deploy trên Vercel (miễn phí)
- ✅ Database Supabase (miễn phí)

## Cấu Trúc Project

```
netfetch/
├── client/               # React frontend
├── api/                  # Vercel Serverless Functions
│   ├── fetch-codes.js    # Lấy mã Netflix
│   ├── save-user.js      # Lưu thông tin user
│   ├── get-user.js       # Lấy thông tin user
│   └── health.js         # Health check
├── package.json
├── vite.config.ts
├── vercel.json
└── supabase_schema.sql
```

## Setup Local

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Tạo file .env

```bash
cp .env.example .env
```

Cập nhật các giá trị:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
ENCRYPTION_KEY=your_32_char_key_here
```

### 3. Chạy development server

```bash
npm run dev
```

Truy cập http://localhost:5173

## Deploy lên Vercel

### 1. Push code lên GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/netfetch.git
git branch -M main
git push -u origin main
```

### 2. Deploy trên Vercel

1. Truy cập https://vercel.com
2. Click "New Project"
3. Import repository `netfetch`
4. Thêm Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `ENCRYPTION_KEY`
5. Click "Deploy"

### 3. Cấu hình Supabase

1. Truy cập https://supabase.com
2. Tạo project mới
3. Vào SQL Editor
4. Chạy file `supabase_schema.sql`
5. Lấy `SUPABASE_URL` và `SUPABASE_ANON_KEY`

## API Endpoints

### GET /api/health
Kiểm tra server có chạy không

### POST /api/save-user
Lưu thông tin IMAP user

**Body:**
```json
{
  "username": "john",
  "imap_email": "john@gmail.com",
  "imap_password": "password",
  "imap_host": "imap.gmail.com",
  "imap_port": 993
}
```

### GET /api/get-user?userId=xxx
Lấy thông tin user

### GET /api/fetch-codes?userId=xxx
Lấy mã Netflix từ email

## Troubleshooting

### "SUPABASE_URL is not defined"
- Kiểm tra environment variables trên Vercel
- Đảm bảo `.env` file có đầy đủ thông tin

### "Cannot connect to IMAP"
- Kiểm tra IMAP credentials
- Đảm bảo IMAP được bật trên email provider
- Kiểm tra firewall/antivirus

### "No Netflix emails found"
- Kiểm tra xem có email từ Netflix không
- Kiểm tra IMAP folder (có thể ở Spam)

## License

MIT
