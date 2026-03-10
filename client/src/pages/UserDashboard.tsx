import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { getSession, clearSession } from "./LoginPage";
import { Button } from "@/components/ui/button";
import {
  Tv2, LogOut, RefreshCw, Loader2, Key, Home, ExternalLink,
  Copy, CheckCircle2, Clock, AlertCircle, Shield, Wifi, WifiOff
} from "lucide-react";

interface FetchResult {
  code: string | null;
  householdLink: string | null;
  timestamp: string;
  emailSubject: string;
}

interface ImapConfigData {
  email: string;
  host: string;
  port: number;
  allowedSenders: string;
  isShared?: boolean;
}

function isHouseholdLink(url: string): boolean {
  return url.includes("update-primary-location") || url.includes("update-household");
}

function getLinkLabel(url: string): string {
  if (url.includes("/account/travel/verify")) return "Link truy cập tạm thời";
  if (url.includes("/ilum")) return "Link phê duyệt đăng nhập";
  if (isHouseholdLink(url)) return "Link cập nhật Household";
  return "Link truy cập Netflix";
}

function getLinkTitle(url: string): string {
  if (url.includes("/account/travel/verify")) return "Nhấn để truy cập tạm thời";
  if (url.includes("/ilum")) return "Nhấn để phê duyệt đăng nhập";
  if (isHouseholdLink(url)) return "Nhấn để cập nhật Household";
  return "Nhấn để mở link Netflix";
}

export default function UserDashboard() {
  const [, navigate] = useLocation();
  const session = getSession();
  const [result, setResult] = useState<FetchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [imapConfig, setImapConfig] = useState<ImapConfigData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) { navigate("/login"); return; }
    // Lấy IMAP config của user
    fetch(`/api/imap-config?action=user&userId=${session.id}`)
      .then(r => r.json())
      .then(data => { if (data && !data.error) setImapConfig(data); })
      .catch(() => {});
  }, []);

  if (!session) return null;

  const hasImapConfig = !!imapConfig;

  const handleFetch = async () => {
    setIsFetching(true);
    setFetchError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/fetch-codes?userId=${session.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lấy mã Netflix");
      setResult(data as FetchResult);
      if (data.code) toast.success("Đã tìm thấy mã xác minh Netflix!");
      else if (data.householdLink) toast.success("Đã tìm thấy link Netflix!");
    } catch (err: any) {
      const msg = err.message || "Không thể lấy mã Netflix";
      setFetchError(msg);
      toast.error(msg);
    } finally {
      setIsFetching(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Đã sao chép!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không thể sao chép");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="h-1 bg-primary w-full" />
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <Tv2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-foreground text-sm">
              Net<span className="text-primary">Fetch</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              @{session.username}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { clearSession(); navigate("/login"); }}
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" />
              Đăng xuất
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-10">
        <div className="space-y-5">
          {/* Welcome */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Lấy mã Netflix</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Nhấn nút bên dưới để quét email và lấy mã xác minh mới nhất
            </p>
          </div>

          {/* IMAP status */}
          <div className={`flex items-center gap-3 p-3.5 rounded-xl border text-sm ${
            hasImapConfig
              ? "bg-green-50 border-green-200"
              : "bg-amber-50 border-amber-200"
          }`}>
            {hasImapConfig ? (
              <>
                <Wifi className="w-4 h-4 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">
                    {imapConfig.isShared ? "Dùng IMAP Shared" : "IMAP riêng đã cấu hình"}
                  </p>
                </div>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800">Chưa có cấu hình IMAP</p>
                  <p className="text-xs text-amber-600">Liên hệ admin để được cấu hình email</p>
                </div>
              </>
            )}
          </div>

          {/* Fetch button */}
          <Button
            onClick={handleFetch}
            disabled={isFetching || !hasImapConfig}
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-semibold text-base shadow-md shadow-primary/20 disabled:opacity-50"
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang quét email...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Lấy mã Netflix mới nhất
              </>
            )}
          </Button>

          {/* Loading hint */}
          {isFetching && (
            <div className="bg-card border border-border rounded-xl p-5 text-center">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Đang kết nối IMAP và quét email...</span>
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2">Quá trình này có thể mất 5–15 giây</p>
            </div>
          )}

          {/* Error state */}
          {fetchError && !isFetching && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-fade-in-up">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">Không thể lấy mã</p>
                  <p className="text-xs text-red-600 mt-0.5">{fetchError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Result */}
          {result && !isFetching && (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm animate-fade-in-up">
              <div className="h-1 bg-primary" />
              <div className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      {result.code ? (
                        <><Key className="w-4 h-4 text-primary" />Mã xác minh tìm thấy</>
                      ) : result.householdLink ? (
                        <><Home className="w-4 h-4 text-blue-500" />{getLinkLabel(result.householdLink)}</>
                      ) : (
                        "Kết quả email"
                      )}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(result.timestamp).toLocaleString("vi-VN")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-700 font-medium">Thành công</span>
                  </div>
                </div>

                {/* Verification code */}
                {result.code && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mã xác minh</p>
                    <div className="flex items-center gap-3 bg-muted/50 border border-border p-4 rounded-xl">
                      <span className="code-display text-4xl font-bold tracking-[0.25em] text-foreground flex-1 select-all">
                        {result.code}
                      </span>
                      <button
                        onClick={() => result.code && copyToClipboard(result.code)}
                        className="p-2.5 hover:bg-accent rounded-lg transition-all text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
                        title="Sao chép mã"
                      >
                        {copied ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Household / access link */}
                {result.householdLink && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {getLinkLabel(result.householdLink)}
                    </p>
                    <a
                      href={result.householdLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between w-full p-4 bg-muted/30 hover:bg-accent/50 border border-border hover:border-primary/30 rounded-xl group transition-all"
                    >
                      <div className="flex flex-col overflow-hidden min-w-0">
                        <span className="text-primary font-medium group-hover:text-primary/80 transition-colors text-sm">
                          {getLinkTitle(result.householdLink)}
                        </span>
                        <span className="text-xs text-muted-foreground truncate mt-0.5">
                          {result.householdLink}
                        </span>
                      </div>
                      <ExternalLink className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0 ml-3 w-4 h-4" />
                    </a>
                  </div>
                )}

                {/* Email subject */}
                {result.emailSubject && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground/60 text-center">
                      Tiêu đề: "{result.emailSubject}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty hint */}
          {!result && !isFetching && !fetchError && (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nhấn nút phía trên để quét email Netflix</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Hệ thống sẽ tìm email mới nhất từ Netflix</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
