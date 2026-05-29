import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    const msg = (error.message || "").toLowerCase();
    const name = error.name || "";

    // Bắt TẤT CẢ lỗi DOM manipulation phổ biến trên mobile (insertBefore, removeChild, NotFoundError)
    const isMobileDomError =
      name === "NotFoundError" ||
      msg.includes("insertbefore") ||
      msg.includes("removechild") ||
      msg.includes("failed to execute") && msg.includes("node") ||
      msg.includes("nút mà nút mới cần được chèn vào trước");

    if (isMobileDomError) {
      console.warn("[ErrorBoundary] ✅ Tự động khôi phục lỗi DOM mobile:", error.message);

      // Tự động thử lại tối đa 2 lần, sau đó mới hiện màn hình lỗi
      if (this.state.retryCount < 2) {
        this.setState({
          hasError: false,
          error: null,
          retryCount: this.state.retryCount + 1,
        });
      } else {
        // Vượt quá số lần retry → hiện màn hình lỗi thật
        console.error("[ErrorBoundary] Vượt quá retry limit, hiện màn hình lỗi");
      }
      return;
    }

    // Các lỗi khác thì hiện màn hình lỗi bình thường
    console.error("[ErrorBoundary] Lỗi không phải DOM mobile:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Đã xảy ra lỗi không mong muốn.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.message}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
