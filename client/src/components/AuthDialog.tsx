import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Loader2, Lock, Mail, User } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

export function AuthDialog({
  open,
  onOpenChange,
  title = "Konto erforderlich",
  description = "Melde dich an oder registriere dich, um fortzufahren.",
  onSuccess,
}: AuthDialogProps) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSuccess = () => {
    utils.auth.me.invalidate();
    setPassword("");
    onOpenChange(false);
    onSuccess?.();
  };

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Konto erstellt — willkommen!");
      handleSuccess();
    },
    onError: err => toast.error(err.message),
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Angemeldet");
      handleSuccess();
    },
    onError: err => toast.error(err.message),
  });

  const isPending = registerMutation.isPending || loginMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register") {
      registerMutation.mutate({ email, password, name: name.trim() || email.split("@")[0]! });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="space-y-1.5">
          <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {description}
          </DialogDescription>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-secondary rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode("register")}
            className={cn(
              "rounded-md py-1.5 text-xs font-medium transition-all",
              mode === "register" ? "bg-card shadow-sm" : "text-muted-foreground"
            )}
          >
            Registrieren
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={cn(
              "rounded-md py-1.5 text-xs font-medium transition-all",
              mode === "login" ? "bg-card shadow-sm" : "text-muted-foreground"
            )}
          >
            Anmelden
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name" className="text-xs font-medium">
                Name
              </Label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="auth-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Dein Name"
                  className="pl-9"
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email" className="text-xs font-medium">
              E-Mail
            </Label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="du@beispiel.de"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password" className="text-xs font-medium">
              Passwort
            </Label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auth-password"
                type="password"
                required
                minLength={mode === "register" ? 8 : undefined}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Mind. 8 Zeichen" : "Dein Passwort"}
                className="pl-9"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : null}
              {mode === "register" ? "Konto erstellen" : "Anmelden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
