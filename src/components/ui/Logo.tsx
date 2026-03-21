interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="oh-my-roll20 logo"
    >
      <defs>
        <linearGradient id="d20-body" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#3730a3" />
        </linearGradient>
      </defs>
      {/* d20 pentagon body */}
      <polygon
        points="50,3 97,35 79,91 21,91 3,35"
        fill="url(#d20-body)"
        stroke="#6366f1"
        strokeWidth="2"
      />
      {/* top face triangle */}
      <polygon
        points="50,3 97,35 3,35"
        fill="#3730a3"
        stroke="#a5b4fc"
        strokeWidth="1.5"
      />
      {/* 20 */}
      <text
        x="50"
        y="74"
        textAnchor="middle"
        fill="white"
        fontSize="32"
        fontWeight="bold"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        20
      </text>
    </svg>
  );
}
