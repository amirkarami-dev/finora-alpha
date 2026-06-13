import { theme } from 'antd';
import { APP_NAME } from '@/config/constants';

interface LogoProps {
  size?: number;
  showText?: boolean;
  color?: string;
}

export function Logo({ size = 32, showText = true, color }: LogoProps) {
  const { token } = theme.useToken();
  const textColor = color ?? token.colorText;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <defs>
          <linearGradient id="finoraLogo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b87333" />
            <stop offset="1" stopColor="#7a4a26" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#finoraLogo)" />
        <path d="M20 45V19h23v6.5H27.5v5.2H40v6.4H27.5V45z" fill="#fff" />
        <circle cx="44.5" cy="40.5" r="4.2" fill="#f4b740" />
      </svg>
      {showText && (
        <span
          style={{
            fontSize: size * 0.62,
            fontWeight: 800,
            letterSpacing: -0.5,
            color: textColor,
            lineHeight: 1,
          }}
        >
          {APP_NAME}
        </span>
      )}
    </span>
  );
}
