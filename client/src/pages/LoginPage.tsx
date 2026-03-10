import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, KeyRound, Shield } from "lucide-react";

export interface NetFetchUser {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  hasImapConfigured: boolean;
}

const SESSION_KEY = "netfetch_session";

export function saveSession(user: NetFetchUser) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function getSession(): NetFetchUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export default function LoginPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Đăng nhập thất bại");
      }

      const user = await response.json();
      saveSession(user as NetFetchUser);
      
      if (user.isAdmin) {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Đăng nhập thất bại. Vui lòng thử lại.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, oklch(0.3 0 0) 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10 animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25 mb-4">
            <KeyRound className="text-white h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Net<span className="text-primary">Fetch</span>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm text-center">
            Netflix Verification Code Manager
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-7">
          <h2 className="text-base font-semibold text-foreground mb-5">Đăng nhập</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium text-foreground">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Nhập username của bạn"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                autoFocus
                autoComplete="username"
                disabled={isLoading}
                className="h-10 bg-input border-border focus-visible:ring-primary/30 focus-visible:border-primary"
              />
              {error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs mt-2">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm group"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-center text-xs text-muted-foreground">
              Khu vực bảo mật — Chỉ dành cho người được cấp quyền
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/50 mt-5">
          NetFetch © {new Date().getFullYear()} · Netflix Code Manager
        </p>
      </div>
    </div>
  );
}
