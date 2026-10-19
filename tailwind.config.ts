import type { Config } from "tailwindcss";

/**
 * Deliberately a subset of Vesta's config: the shadcn variables, the entry
 * animations and nothing else. Every colour this app paints comes from the
 * neutral scale plus `amber`, so the brand palette needs no extension here.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // 8px of travel, ~0.5s. Anything bigger reads as theatre.
      animation: {
        "fade-in": "fade-in 0.5s ease-out",
        "row-in": "row-in 0.35s ease-out both",
        rise: "row-in 0.5s ease-out both",
        // A ring that draws itself to where he is, a bar that grows from 0.
        draw: "draw 0.8s ease-out both",
        grow: "grow 0.5s ease-out both",
        // A tick landing: a small overshoot, then still.
        pop: "pop 0.35s ease-out both",
        // A baked turn of a 3D object: a strip of 24 frames, played in steps.
        strip: "strip 2.8s steps(24) infinite",
        // An exercise's two poses, each held, crossfading: one rep every 2.4 s.
        rep: "rep 2.4s ease-in-out infinite",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "row-in": {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // Starts at the full circle (`--len`), ends at the element's own offset.
        draw: { "0%": { strokeDashoffset: "var(--len)" } },
        grow: { "0%": { transform: "scaleY(0)" } },
        pop: { "0%": { transform: "scale(0.6)" }, "60%": { transform: "scale(1.12)" }, "100%": { transform: "scale(1)" } },
        strip: { "0%": { backgroundPositionX: "0" }, "100%": { backgroundPositionX: "calc(var(--w) * -24)" } },
        rep: { "0%, 35%": { opacity: "0" }, "50%, 85%": { opacity: "1" }, "100%": { opacity: "0" } },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
