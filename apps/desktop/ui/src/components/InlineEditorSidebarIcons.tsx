import type { SVGProps } from 'react';

function BaseIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" {...props} />;
}

export function ProPresetsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5 6h6M5 8h6M5 10h4" />
    </BaseIcon>
  );
}

export function ProRoutingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="8" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <path d="M5.5 4h2a2 2 0 0 1 2 2v2M5.5 12h2a2 2 0 0 0 2-2V8" />
    </BaseIcon>
  );
}

export function ProOverviewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <BaseIcon {...props}>
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <path d="M5 10V8m3 2V6m3 4V7" />
    </BaseIcon>
  );
}
