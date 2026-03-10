# Hướng Dẫn Deploy NetFetch

## Tổng Quan

NetFetch bao gồm:
- **Frontend**: React + Vite (chạy trên Vercel)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Supabase (PostgreSQL)

**Tất cả đều FREE!**

## Bước 1: Chuẩn Bị GitHub

### 1.1 Tạo Repository

```bash
cd netfetch
git init
git add .
git commit -m "Initial commit: NetFetch"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/netfetch.git
git push -u origin main
```

## Bước 2: Cấu Hình Supabase

### 2.1 Tạo Project Supabase

1. Truy cập https://supabase.com
2. Đăng nhập / Tạo tài khoản
3. Click "New Project"
4. Điền thông tin:
   - **Name**: netfetch
   - **Database Password**: Tạo password mạnh
   - **Region**: Chọn gần nhất

### 2.2 Lấy Credentials

1. Vào Project Settings → API
2. Sao chép:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** → `SUPABASE_ANON_KEY`

### 2.3 Chạy Schema SQL

1. Vào SQL Editor
2. Click "New Query"
3. Copy nội dung file `supabase_schema.sql`
4. Paste vào editor
5. Click "Run"

## Bước 3: Tạo Encryption Key

Chạy lệnh này để tạo random key:

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**Windows (PowerShell):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Maximum 256)}))
```

Sao chép kết quả → `ENCRYPTION_KEY`

## Bước 4: Deploy lên Vercel

### 4.1 Kết Nối GitHub

1. Truy cập https://vercel.com
2. Đăng nhập / Tạo tài khoản
3. Click "New Project"
4. Click "Import Git Repository"
5. Chọn repository `netfetch`
6. Click "Import"

### 4.2 Cấu Hình Environment Variables

Trong trang cấu hình, thêm các biến:

| Tên | Giá Trị |
|-----|--------|
| `SUPABASE_URL` | Từ Supabase |
| `SUPABASE_ANON_KEY` | Từ Supabase |
| `ENCRYPTION_KEY` | Từ bước 3 |

### 4.3 Deploy

Click "Deploy" và chờ hoàn tất

**URL sẽ là:** `https://netfetch-xxx.vercel.app`

## Bước 5: Test Ứng Dụng

### 5.1 Truy Cập

Vào https://netfetch-xxx.vercel.app

### 5.2 Kiểm Tra Health Check

Vào https://netfetch-xxx.vercel.app/api/health

Nếu thấy:
```json
{"status":"ok","timestamp":"2024-03-09T..."}
```

**Chúc mừng! Ứng dụng chạy ngon rồi!** 🎉

## Cập Nhật Code

Mỗi khi push code lên GitHub, Vercel tự động deploy:

```bash
git add .
git commit -m "Update: ..."
git push origin main
```

## Troubleshooting

### Lỗi: "SUPABASE_URL is not defined"
- Kiểm tra environment variables trên Vercel Dashboard
- Đảm bảo tất cả 3 biến đã được thêm

### Lỗi: "Cannot connect to IMAP"
- Kiểm tra IMAP credentials
- Đảm bảo IMAP được bật (Gmail: Settings → Forwarding and POP/IMAP)
- Kiểm tra firewall

### Frontend không load
- Kiểm tra Vercel Logs
- Đảm bảo `npm run build` thành công

### API không hoạt động
- Kiểm trap Vercel Logs
- Kiểm tra environment variables
- Đảm bảo Supabase project đang chạy

## Custom Domain (Optional)

### Thêm Domain vào Vercel

1. Vào Project Settings → Domains
2. Click "Add Domain"
3. Nhập domain của bạn
4. Cập nhật DNS records theo hướng dẫn

---

**Đó là tất cả! Ứng dụng của bạn đã sẵn sàng!** 🚀
