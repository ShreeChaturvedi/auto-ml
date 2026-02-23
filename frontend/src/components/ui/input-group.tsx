import * as React from "react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"

type InputGroupAlign = "inline-start" | "inline-end" | "block-start" | "block-end"

const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      data-slot="input-group"
      className={cn(
        "group/input-group border-input dark:bg-input/30 relative flex w-full min-w-0 items-center rounded-md border shadow-sm transition-[color,box-shadow] outline-none",
        "has-[>textarea]:h-auto has-[>[data-align=inline-start]]:[&>input]:pl-2 has-[>[data-align=inline-end]]:[&>input]:pr-2",
        "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",
        "has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-neutral-500",
        "has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
)
InputGroup.displayName = "InputGroup"

const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { align?: InputGroupAlign }
>(({ className, align = "inline-end", ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    data-slot="input-group-addon"
    data-align={align}
    className={cn(
      "text-muted-foreground group-data-[disabled=true]/input-group:opacity-50 flex h-auto cursor-text items-center gap-2 py-1.5 text-sm font-medium select-none",
      "[&>svg:not([class*=size-])]:size-4 [&>kbd]:rounded-[calc(var(--radius)-5px)]",
      align === "inline-start" && "order-first pl-3 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]",
      align === "inline-end" && "order-last pr-3 has-[>button]:mr-[-0.45rem] has-[>kbd]:mr-[-0.35rem]",
      align === "block-start" && "order-first w-full justify-start px-3 pt-3 [.border-b]:pb-3",
      align === "block-end" && "order-last w-full justify-start px-3 pb-3 [.border-t]:pt-3 group-has-[>input]/input-group:pb-2.5",
      className
    )}
    {...props}
  />
))
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="input-group-control"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "file:text-foreground selection:bg-primary selection:text-primary-foreground",
        "flex h-9 w-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 py-1 text-base shadow-none outline-none transition-[color,box-shadow] focus-visible:ring-0",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-transparent",
        className
      )}
      {...props}
    />
  )
)
InputGroupInput.displayName = "InputGroupInput"

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="input-group-control"
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "flex min-h-16 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none outline-none transition-[color,box-shadow] focus-visible:ring-0",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-transparent",
        className
      )}
      {...props}
    />
  )
)
InputGroupTextarea.displayName = "InputGroupTextarea"

const InputGroupButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button ref={ref} className={cn("shadow-none", className)} {...props} />
  )
)
InputGroupButton.displayName = "InputGroupButton"

export {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
  InputGroupButton
}
