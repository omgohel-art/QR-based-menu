import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import "@/components/LoadingRipple.css";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="ld-ripple"><div /><div /></div>
      </div>
    );
  }

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  if (profile?.must_change_password) {
    navigate("/force-change-password", { replace: true });
    return null;
  }

  return <>{children}</>;
}
