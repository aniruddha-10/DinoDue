// Small stroke icons, drawn inline so the extension ships no icon font.
// Decorative: callers put the meaning in text next to them.

import type { ReactNode } from "react";

type Props = { size?: number; className?: string };

function Svg({ size = 20, className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const StormIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M7 16a4 4 0 1 1 .9-7.9A5.5 5.5 0 0 1 18.4 9.5 3.3 3.3 0 0 1 18 16" />
    <path d="M12.5 12.5 10.5 16.5h3l-2 4" />
  </Svg>
);

export const CloudIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M7 18.5a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.2 11a3.8 3.8 0 0 1-.7 7.5z" />
  </Svg>
);

export const SunIcon = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);

export const WindIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M3 8.5h10.5a3 3 0 1 0-3-3" />
    <path d="M3 12.5h15a3 3 0 1 1-3 3" />
    <path d="M3 16.5h6" />
  </Svg>
);

export const CheckIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const RefreshIcon = (p: Props) => (
  <Svg {...p}>
    <path d="M19.5 11A7.5 7.5 0 1 0 17.3 16.3" />
    <path d="M19.5 4.5V11H13" />
  </Svg>
);
