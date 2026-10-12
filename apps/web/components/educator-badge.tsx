import { cn } from "@/lib/utils";
import { GraduationCap } from "@phosphor-icons/react";

export function EducatorBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        "bg-[#deff0a]/10 text-[#deff0a] border border-[#deff0a]/20",
        className
      )}
    >
      <GraduationCap className="w-3 h-3" weight="fill" />
      Educator
    </span>
  );
}
