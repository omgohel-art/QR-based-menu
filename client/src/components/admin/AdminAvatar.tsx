import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  User,
  Store,
  Mail,
  Lock,
  Palette,
  LogOut,
  ClipboardList,
  Users,
  Activity,
} from "lucide-react";

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  roles?: string[];
}

interface AdminAvatarProps {
  onNavigate: (page: string) => void;
}

export default function AdminAvatar({ onNavigate }: AdminAvatarProps) {
  const { user, profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const isAdmin = profile?.role === "admin";

  const { data: settings } = useQuery({
    queryKey: ["businessSettings"],
    queryFn: async () => {
      const { data } = await supabase.from("businessSettings").select("*").single();
      return data;
    },
    staleTime: 2 * 60 * 1000,
  });

  const businessName = settings?.restaurantName || "MAMA Cafe";
  const initial = businessName.charAt(0).toUpperCase();
  const userEmail = user?.email || "";
  const profileImage = profile?.profile_image_url || settings?.logoUrl || null;

  const allMenuItems: MenuItem[] = [
    { label: "My Profile", icon: <User className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("profile"); } },
    { label: "Business Settings", icon: <Store className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("settings"); }, roles: ["admin"] },
    { label: "Email Settings", icon: <Mail className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("email"); }, roles: ["admin"] },
    { label: "Change Password", icon: <Lock className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("password"); } },
    { label: "Theme", icon: <Palette className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("theme"); } },
    { label: "Take Order", icon: <ClipboardList className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("take-order"); } },
    { label: "Staff Management", icon: <Users className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("staff-management"); }, roles: ["admin"] },
    { label: "Staff Activity", icon: <Activity className="w-4 h-4" />, onClick: () => { setOpen(false); onNavigate("staff-activity"); }, roles: ["admin"] },
    { label: "Logout", icon: <LogOut className="w-4 h-4" />, onClick: () => { setOpen(false); setLogoutOpen(true); }, variant: "destructive" },
  ];

  const menuItems = allMenuItems.filter(
    (item) => !item.roles || item.roles.includes(isAdmin ? "admin" : "staff")
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button className="relative outline-none">
            <Avatar className="w-9 h-9 ring-2 ring-slate-200 dark:ring-slate-700 hover:ring-slate-400 dark:hover:ring-slate-500 transition-all cursor-pointer">
              {profileImage ? (
                <AvatarImage src={profileImage} alt={businessName} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-amber-600 to-amber-700 text-white text-sm font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-slate-900 rounded-full" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-900/10 rounded-xl p-1.5"
        >
          <DropdownMenuLabel className="flex items-center gap-3 p-3">
            <Avatar className="w-10 h-10 ring-2 ring-amber-200">
              {profileImage ? (
                <AvatarImage src={profileImage} alt={businessName} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-amber-600 to-amber-700 text-white font-bold">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{businessName}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{userEmail}</span>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="bg-slate-200 dark:bg-slate-700 mx-2" />

          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              variant={item.variant}
              className="cursor-pointer rounded-lg py-2 px-3 text-slate-700 dark:text-slate-300 focus:text-slate-900 focus:bg-slate-100 dark:focus:bg-slate-800"
            >
              <span className="text-slate-500 dark:text-slate-400">{item.icon}</span>
              <span>{item.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out of your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { logout(); setLogoutOpen(false); }} className="bg-red-600 hover:bg-red-700">
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
