/** A four-point sparkle, the app's "ask the AI" mark. Inline SVG so it inherits `currentColor`. */
export function SparklesIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5z" />
      <path d="M5 15.5l.9 2.3 2.3.9-2.3.9L5 21.9l-.9-2.3-2.3-.9 2.3-.9L5 15.5z" opacity="0.8" />
      <path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7L19 14z" opacity="0.8" />
    </svg>
  );
}
