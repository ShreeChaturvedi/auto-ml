"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface GlowingEffectProps {
  spread?: number;
  proximity?: number;
  className?: string;
  disabled?: boolean;
  borderWidth?: number;
  children: React.ReactNode;
}

export function GlowingEffect({
  spread = 60,
  proximity = 100,
  className,
  disabled = false,
  borderWidth = 2,
  children,
}: GlowingEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [glowPosition, setGlowPosition] = useState({ x: 0, y: 0 });
  const [isNearby, setIsNearby] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (disabled || !containerRef.current) return;

    const container = containerRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if mouse is within proximity of the button
      const isNear =
        x >= -proximity &&
        x <= rect.width + proximity &&
        y >= -proximity &&
        y <= rect.height + proximity;

      if (isNear) {
        setGlowPosition({ x, y });
        setIsNearby(true);
      } else {
        setIsNearby(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [disabled, proximity]);

  // Determine which background to show
  let background: string;
  if (isHovered) {
    // Even glow all around when hovering - bright and thin
    background = `rgba(255,255,255,0.7)`;
  } else {
    // Following glow when nearby
    background = `radial-gradient(${spread * 2}px circle at ${glowPosition.x + borderWidth}px ${glowPosition.y + borderWidth}px, rgba(255,255,255,0.7), rgba(200,200,200,0.4), transparent)`;
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Glow border effect */}
      <div
        className="pointer-events-none absolute rounded-[inherit] transition-opacity duration-200"
        style={{
          inset: -borderWidth,
          opacity: isHovered || isNearby ? 1 : 0,
          background,
          WebkitMask: `
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0)
          `,
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: borderWidth,
          borderRadius: "inherit",
        } as React.CSSProperties}
      />

      {/* Content */}
      {children}
    </div>
  );
}
