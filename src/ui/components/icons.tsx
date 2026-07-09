// Mali inline SVG simboli za donju navigaciju i sheet redove — jednostavna
// geometrija u retro duhu (currentColor, bez spoljnih ikonica).
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function svgProps({ size = 18, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, ...rest };
}

export function IconHome(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor">
      <path d="M4 11 12 4l8 7v9h-5.5v-5h-5v5H4z" />
    </svg>
  );
}

export function IconCards(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="6" width="9" height="13" rx="1" />
      <path d="M10 3.5l8.5 2.3-3.4 12.7-2.1-.6" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor">
      <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3.5 2" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.4-4 4.8-5.2 7.5-5.2s6.1 1.2 7.5 5.2z" />
    </svg>
  );
}

export function IconList(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor">
      <path d="M5 6h14v2H5zm0 5h14v2H5zm0 5h9v2H5z" />
    </svg>
  );
}

export function IconGrid(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 10h16M10 4v16" />
    </svg>
  );
}

export function IconDots(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

export function IconExit(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M13 4h6v16h-6" />
      <path d="M4 12h9M9 8l-4 4 4 4" />
    </svg>
  );
}

export function IconShare(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3v11M8 6.5 12 3l4 3.5" />
      <path d="M6 11v9h12v-9" />
    </svg>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <svg {...svgProps(props)} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2.5 3.5L17 12H6" />
    </svg>
  );
}
