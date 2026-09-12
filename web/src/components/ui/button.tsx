import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "raise-press group inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-transparent whitespace-nowrap transition-[background,color,box-shadow,transform,scale] outline-none select-none raise-focus motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:cursor-default disabled:bg-secondary disabled:text-muted-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#c5e6a4] text-[#233d32] hover:bg-[#b2d98c]",
        secondary: "border-border bg-card text-foreground hover:bg-secondary",
        outline: "border-input bg-background text-foreground hover:bg-secondary dark:bg-transparent dark:hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary hover:text-primary",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        success: "bg-success text-success-foreground hover:bg-success/90",
        light: "bg-[#c5e6a4] text-[#233d32] hover:bg-[#d4eebc]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 button1",
        sm: "h-8 px-4 text-sm font-medium",
        lg: "h-12 px-6 button1",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button data-slot="button" type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

function HoverArrow({ className }: { className?: string }) {
  return (
    <svg className={cn("hover-arrow", className)} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12.9999 8.26758L3.99989 8.26758" className="hover-arrow-line-path" strokeWidth="1.5" />
      <path d="M7 4L11.2426 8.24264L7 12.4853" className="hover-arrow-tip-path" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export { Button, HoverArrow, buttonVariants };
