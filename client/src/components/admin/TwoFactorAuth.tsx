import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, ArrowLeft, Clock, Smartphone, Key, CheckCircle } from "lucide-react";

interface TwoFactorAuthProps {
  onNavigate?: (page: string) => void;
}

export default function TwoFactorAuth({ onNavigate }: TwoFactorAuthProps) {
  return (
    <Card className="max-w-2xl mx-auto p-6 md:p-8 bg-white dark:bg-slate-900">
      <div className="flex items-center gap-3 mb-6">
        {onNavigate && (
          <button
            onClick={() => onNavigate("back")}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Two-Factor Authentication</h2>
        </div>
      </div>

      <div className="space-y-6">
        {/* What is 2FA */}
        <div className="bg-purple-50 dark:bg-purple-950 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">What is Two-Factor Authentication?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Two-factor authentication (2FA) adds an extra layer of security to your account by requiring
            a second verification method beyond just your password. Even if someone obtains your password,
            they won't be able to access your account without the second factor.
          </p>
        </div>

        {/* Benefits */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Benefits</h3>
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Enhanced Security</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Dual-layer protection keeps your account safe from unauthorized access.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Authenticator App Support</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Use any standard authenticator app like Google Authenticator, Authy, or Microsoft Authenticator.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">One-Time Passcodes</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Time-based one-time passcodes (TOTP) that change every 30 seconds.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coming Soon Banner */}
        <div className="text-center py-8 px-6 rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/50">
          <Clock className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Coming Soon</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
            Two-factor authentication is under development. We're working on integrating
            authenticator app support for maximum security. Stay tuned!
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            <span>UI ready for authenticator app setup flow</span>
          </div>
        </div>

        {onNavigate && (
          <Button variant="outline" onClick={() => onNavigate("back")} className="w-full">
            Back to Profile
          </Button>
        )}
      </div>
    </Card>
  );
}
