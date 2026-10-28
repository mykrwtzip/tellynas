import { cn } from '@/lib/cn';

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-fg text-bg shadow-xs ring-1 ring-black/10 dark:ring-white/15',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-[17px]"
        aria-hidden="true"
      >
        <path
          d="M3.75 7.25C3.75 5.86929 4.86929 4.75 6.25 4.75H10.4L12.35 6.95H17.75C19.1307 6.95 20.25 8.06929 20.25 9.45V16.75C20.25 18.1307 19.1307 19.25 17.75 19.25H6.25C4.86929 19.25 3.75 18.1307 3.75 16.75V7.25Z"
          fill="currentColor"
          fillOpacity="0.14"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9.25 13.25L12 10.5L14.75 13.25M12 10.85V16"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
