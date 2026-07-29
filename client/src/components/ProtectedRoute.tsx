import { type ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageSpinner } from "@/components/Skeletons";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/login", { replace: true });
    } else if (profile?.must_change_password) {
      navigate("/force-change-password", { replace: true });
    }
  }, [user, profile, loading, navigate]);

  if (loading) {
    return <FullPageSpinner />;
  }

  if (!user || profile?.must_change_password) {
    return null;
  }

  return <>{children}</>;
}
