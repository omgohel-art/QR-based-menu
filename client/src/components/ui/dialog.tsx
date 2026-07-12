import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";

// Re-exported for compatibility with IME-aware inputs
export const useDialogComposition = () => ({
  isComposing: () => false,
  setComposing: (_composing: boolean) => {},
  justEndedComposing: () => false,
  markCompositionEnd: () => {},
});

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  onOpenChange: () => {},
});

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (val: boolean) => {
      if (!isControlled) setInternalOpen(val);
      onOpenChange?.(val);
    },
    [isControlled, onOpenChange]
  );

  const value = React.useMemo(
    () => ({ open: isOpen, onOpenChange: handleOpenChange }),
    [isOpen, handleOpenChange]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
    </DialogContext.Provider>
  );
}

function DialogTrigger({
  className,
  children,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { onOpenChange } = React.useContext(DialogContext);
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      className={asChild ? undefined : className}
      onClick={(e: React.MouseEvent) => {
        onOpenChange(true);
        (props as any).onClick?.(e);
      }}
      {...(asChild ? {} : props)}
    >
      {children}
    </Comp>
  );
}

function DialogClose({
  className,
  children,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { onOpenChange } = React.useContext(DialogContext);
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      className={asChild ? undefined : className}
      onClick={(e: React.MouseEvent) => {
        onOpenChange(false);
        (props as any).onClick?.(e);
      }}
      {...(asChild ? {} : props)}
    >
      {children}
    </Comp>
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  showCloseButton?: boolean;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
}) {
  const { open, onOpenChange } = React.useContext(DialogContext);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onEscapeKeyDown) {
          onEscapeKeyDown(e);
        } else {
          e.preventDefault();
          onOpenChange(false);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange, onEscapeKeyDown]);

  React.useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto py-4 flex items-start justify-center">
      <div
        className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={contentRef}
        role="dialog"
        data-slot="dialog-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative w-full max-w-[calc(100%-2rem)] grid gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg my-auto",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        )}
      </div>
    </div>,
    document.body
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
};

function DialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open } = React.useContext(DialogContext);
  if (!open) return null;
  return (
    <div
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  );
}
