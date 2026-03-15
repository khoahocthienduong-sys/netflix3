import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getSession, clearSession, NetFetchUser } from "./LoginPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Tv2, Users, Settings, LogOut, Trash2, Loader2,
  Shield, Mail, Server, Lock, RefreshCw, CheckCircle2,
  AlertCircle, Eye, EyeOff, Globe, X, UserPlus, Wifi
} from "lucide-react";

type Tab = "users" | "imap";

interface UserItem {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  hasImapConfigured: boolean;
}

interface ImapConfigData {
  email: string;
  host: string;
  port: number;
  allowedSenders: string;
  isShared?: boolean;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const session = getSession();
  const [activeTab, setActiveTab] = useState<Tab>("users");

  useEffect(() => {
    if (!session || !session.isAdmin) navigate("/login", { replace: true });
  }, []);

  if (!session?.isAdmin) return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
        {/* Top red bar */}
        <div className="h-1 bg-primary w-full" />

        {/* Logo */}
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <Tv2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm leading-tight">NetFetch</p>
              <p className="text-[11px] text-muted-foreground">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <button
            onClick={() => setActiveTab("users")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "users"
                ? "bg-primary text-white shadow-sm"
                : "text-foreground hover:bg-accent"
            }`}
          >
            <Users className="w-4 h-4" />
            Quản lý Users
          </button>
          <button
            onClick={() => setActiveTab("imap")}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === "imap"
                ? "bg-primary text-white shadow-sm"
                : "text-foreground hover:bg-accent"
            }`}
          >
            <Settings className="w-4 h-4" />
            Cấu hình IMAP
          </button>
          {/* Nút Đăng xuất ngay dưới các nút điều hướng */}
          <button
            onClick={() => { clearSession(); navigate("/login", { replace: true }); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-muted-foreground hover:bg-accent hover:text-foreground mt-1"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg bg-accent/50">
            <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Shield className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{session.username}</p>
              <p className="text-[10px] text-muted-foreground">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-background">
        <div className="p-8 max-w-5xl">
          {activeTab === "users" ? <UsersTab /> : <ImapConfigTab />}
        </div>
      </main>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [imapUser, setImapUser] = useState<{ id: string; username: string } | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin-users");
      if (!res.ok) throw new Error("Không thể tải danh sách users");
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message || "Lỗi tải users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleCreate = async () => {
    if (!newUsername.trim()) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tạo user thất bại");
      toast.success("Tạo user thành công");
      setShowCreateDialog(false);
      setNewUsername("");
      loadUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin-users?userId=${deleteUserId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xóa user thất bại");
      toast.success("Đã xóa user");
      setDeleteUserId(null);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Quản lý Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {users.length} tài khoản trong hệ thống
          </p>
        </div>
        <Button
          onClick={() => setShowCreateDialog(true)}
          className="bg-primary hover:bg-primary/90 text-white h-9 shadow-sm"
          size="sm"
        >
          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
          Thêm User
        </Button>
      </div>

      {/* Users table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có user nào</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_140px_100px] gap-4 px-5 py-3 border-b border-border bg-muted/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Username</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vai trò</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">IMAP</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Thao tác</span>
            </div>
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_120px_140px_100px] gap-4 items-center px-5 py-3.5 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      user.isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                  </div>
                  <div>
                    {user.isAdmin ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-medium">
                        <Shield className="w-3 h-3 mr-1" />Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs font-medium">User</Badge>
                    )}
                  </div>
                  <div>
                    {user.hasImapConfigured ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                        <Wifi className="w-3 h-3" />
                        Đã cấu hình
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        <Globe className="w-3 h-3" />
                        Dùng Shared
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5 border-border"
                      onClick={() => setImapUser({ id: user.id, username: user.username })}
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      IMAP
                    </Button>
                    {!user.isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                        onClick={() => setDeleteUserId(user.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Thêm User mới</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tạo tài khoản user để truy cập hệ thống NetFetch
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Label htmlFor="new-username" className="text-foreground text-sm">Username</Label>
            <Input
              id="new-username"
              placeholder="Nhập username..."
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newUsername.trim() && handleCreate()}
              className="bg-input border-border"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="border-border">Hủy</Button>
            <Button
              onClick={handleCreate}
              disabled={!newUsername.trim() || isCreating}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {isCreating && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Tạo User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Xác nhận xóa user?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Hành động này không thể hoàn tác. User và toàn bộ cấu hình IMAP sẽ bị xóa vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={handleDelete}
            >
              {isDeleting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* IMAP per-user modal */}
      {imapUser && (
        <UserImapModal
          userId={imapUser.id}
          username={imapUser.username}
          open={!!imapUser}
          onClose={() => setImapUser(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}

// ─── User IMAP Modal ──────────────────────────────────────────────────────────

function UserImapModal({
  userId, username, open, onClose, onSaved
}: {
  userId: string;
  username: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<ImapConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [allowedSenders, setAllowedSenders] = useState("info@account.netflix.com,netflix@netflix.com");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    fetch(`/api/imap-config?action=user&userId=${userId}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error && !data.isShared) {
          // User có IMAP riêng — hiện dữ liệu riêng
          setConfig(data);
          setEmail(data.email || "");
          setPassword(data.password || "");
          setHost(data.host || "");
          setPort(String(data.port || 993));
          setAllowedSenders(data.allowedSenders || "info@account.netflix.com,netflix@netflix.com");
        } else if (data && data.isShared) {
          // User đang dùng Shared — pre-fill từ Shared config
          setConfig(data);
          setEmail(data.email || "");
          setPassword(data.password || "");
          setHost(data.host || "");
          setPort(String(data.port || 993));
          setAllowedSenders(data.allowedSenders || "info@account.netflix.com,netflix@netflix.com");
        } else {
          setConfig(null);
        }
      })
      .catch(() => setConfig(null))
      .finally(() => setIsLoading(false));
  }, [open, userId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/imap-config?action=user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email, password: password || undefined, host, port: parseInt(port), allowedSenders }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu thất bại");
      toast.success(`Đã lưu IMAP cho @${username}`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const res = await fetch(`/api/imap-config?action=user&userId=${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xóa thất bại");
      toast.success(`Đã xóa IMAP riêng của @${username}, sẽ dùng Shared`);
      setConfig(null);
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            Cấu hình IMAP — @{username}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Thiết lập email IMAP riêng cho user này
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Status */}
            <div className={`flex items-center gap-2.5 p-3 rounded-lg border text-sm ${
              config && !config.isShared
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              {config && !config.isShared ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Đang dùng IMAP riêng: <strong>{config.email}</strong></span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-xs text-destructive hover:bg-destructive/10"
                    onClick={handleClear}
                    disabled={isClearing}
                  >
                    {isClearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  </Button>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>Đang dùng IMAP Shared — nhập thông tin bên dưới để cấu hình riêng</span>
                </>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input type="email" placeholder="email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="pl-8 h-9 text-sm bg-input border-border" required />
                  </div>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Password {config && !config.isShared && <span className="text-muted-foreground/60">(để trống = giữ nguyên)</span>}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input type="text" placeholder="App password..." value={password}
                      onChange={(e) => setPassword(e.target.value)} className="pl-8 h-9 text-sm bg-input border-border" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">IMAP Host</Label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="imap.gmail.com" value={host} onChange={(e) => setHost(e.target.value)}
                      className="pl-8 h-9 text-sm bg-input border-border" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Port</Label>
                  <Input type="number" placeholder="993" value={port} onChange={(e) => setPort(e.target.value)}
                    className="h-9 text-sm bg-input border-border" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Allowed Senders</Label>
                <Input placeholder="info@account.netflix.com,netflix@netflix.com" value={allowedSenders}
                  onChange={(e) => setAllowedSenders(e.target.value)} className="h-9 text-sm bg-input border-border" />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={onClose} className="border-border">Hủy</Button>
                <Button type="submit" disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white">
                  {isSaving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Lưu cấu hình
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── IMAP Config Tab (Shared) ─────────────────────────────────────────────────

function ImapConfigTab() {
  const [sharedConfig, setSharedConfig] = useState<ImapConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [allowedSenders, setAllowedSenders] = useState("info@account.netflix.com,netflix@netflix.com");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/imap-config?action=shared")
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setSharedConfig(data);
          setEmail(data.email || "");
          setHost(data.host || "");
          setPort(String(data.port || 993));
          setAllowedSenders(data.allowedSenders || "info@account.netflix.com,netflix@netflix.com");
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/imap-config?action=shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: password || undefined, host, port: parseInt(port), allowedSenders }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu thất bại");
      toast.success("Đã lưu cấu hình IMAP Shared");
      setSharedConfig({ email, host, port: parseInt(port), allowedSenders });
      setPassword("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Cấu hình IMAP Shared</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cấu hình mặc định dùng cho tất cả users chưa có IMAP riêng
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      ) : (
        <>
          {/* Status */}
          <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${
            sharedConfig
              ? "bg-green-50 border-green-200"
              : "bg-amber-50 border-amber-200"
          }`}>
            {sharedConfig ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">IMAP Shared đã cấu hình</p>
                  <p className="text-xs text-green-600">{sharedConfig.email} · {sharedConfig.host}:{sharedConfig.port}</p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Chưa có cấu hình IMAP Shared</p>
                  <p className="text-xs text-amber-600">Users không có IMAP riêng sẽ không thể lấy mã Netflix</p>
                </div>
              </>
            )}
          </div>

          {/* Form */}
          <div className="bg-card rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Shared Email Configuration</p>
                <p className="text-xs text-muted-foreground">Cấu hình này áp dụng cho tất cả users</p>
              </div>
            </div>
            <Separator className="mb-4" />
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input type="email" placeholder="netflix-handler@gmail.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} className="pl-8 h-9 text-sm bg-input border-border" required />
                  </div>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Password {sharedConfig && <span className="text-muted-foreground/60">(để trống = giữ nguyên)</span>}
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input type={showPassword ? "text" : "password"} placeholder="App password..." value={password}
                      onChange={(e) => setPassword(e.target.value)} className="pl-8 pr-9 h-9 text-sm bg-input border-border" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">IMAP Host</Label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="imap.gmail.com" value={host} onChange={(e) => setHost(e.target.value)}
                      className="pl-8 h-9 text-sm bg-input border-border" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Port</Label>
                  <Input type="number" placeholder="993" value={port} onChange={(e) => setPort(e.target.value)}
                    className="h-9 text-sm bg-input border-border" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Allowed Senders</Label>
                <Input placeholder="info@account.netflix.com,netflix@netflix.com" value={allowedSenders}
                  onChange={(e) => setAllowedSenders(e.target.value)} className="h-9 text-sm bg-input border-border" />
                <p className="text-xs text-muted-foreground">Danh sách email Netflix được phép, cách nhau bằng dấu phẩy</p>
              </div>
              <Button type="submit" className="w-full h-9 bg-primary hover:bg-primary/90 text-white" disabled={isSaving}>
                {isSaving
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Đang lưu...</>
                  : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Lưu cấu hình Shared</>
                }
              </Button>
            </form>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">Hướng dẫn Gmail App Password</p>
            <ol className="text-xs text-blue-600 space-y-1 list-decimal list-inside">
              <li>Bật 2-Step Verification trong Google Account</li>
              <li>Vào Google Account → Security → App Passwords</li>
              <li>Tạo App Password cho "Mail" và "Other device"</li>
              <li>Dùng mật khẩu 16 ký tự được tạo ra (không phải mật khẩu Google)</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
