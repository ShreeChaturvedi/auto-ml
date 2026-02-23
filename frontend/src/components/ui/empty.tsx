import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const emptyVariants = cva(
    "flex flex-col items-center justify-center gap-6 p-8 text-center",
    {
        variants: {
            size: {
                sm: "gap-4 p-6",
                default: "gap-6 p-8",
                lg: "gap-8 p-10",
            },
        },
        defaultVariants: {
            size: "default",
        },
    }
)

interface EmptyProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyVariants> { }

function Empty({ className, size, ...props }: EmptyProps) {
    return (
        <div
            role="status"
            className={cn(emptyVariants({ size }), className)}
            {...props}
        />
    )
}

function EmptyHeader({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex flex-col items-center gap-3", className)}
            {...props}
        />
    )
}

const emptyMediaVariants = cva(
    "flex items-center justify-center rounded-full",
    {
        variants: {
            variant: {
                icon: "size-12 bg-muted [&>svg]:size-6 [&>svg]:text-muted-foreground",
                image: "size-24",
                avatar: "size-12",
            },
        },
        defaultVariants: {
            variant: "icon",
        },
    }
)

interface EmptyMediaProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyMediaVariants> {
    asChild?: boolean
}

function EmptyMedia({
    className,
    variant,
    asChild = false,
    ...props
}: EmptyMediaProps) {
    const Comp = asChild ? Slot : "div"
    return (
        <Comp className={cn(emptyMediaVariants({ variant }), className)} {...props} />
    )
}

function EmptyTitle({
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3
            className={cn("text-lg font-semibold tracking-tight", className)}
            {...props}
        />
    )
}

function EmptyDescription({
    className,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            className={cn("text-sm text-muted-foreground max-w-sm", className)}
            {...props}
        />
    )
}

function EmptyContent({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn("flex flex-col items-center gap-2", className)}
            {...props}
        />
    )
}

export {
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
    EmptyContent,
}
