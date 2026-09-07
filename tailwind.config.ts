import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Theme tokens contain complete OKLCH colors. Tailwind 3 needs an explicit
// alpha placeholder to generate utilities such as bg-primary/10 and border-primary/30.
const themeColor = (token: string) =>
  `color-mix(in oklch, var(${token}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: themeColor("--border"),
        input: themeColor("--input"),
        ring: themeColor("--ring"),
        background: themeColor("--background"),
        foreground: themeColor("--foreground"),
        primary: {
          DEFAULT: themeColor("--primary"),
          foreground: themeColor("--primary-foreground"),
        },
        secondary: {
          DEFAULT: themeColor("--secondary"),
          foreground: themeColor("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: themeColor("--destructive"),
          foreground: themeColor("--destructive-foreground"),
        },
        muted: {
          DEFAULT: themeColor("--muted"),
          foreground: themeColor("--muted-foreground"),
        },
        accent: {
          DEFAULT: themeColor("--accent"),
          foreground: themeColor("--accent-foreground"),
        },
        popover: {
          DEFAULT: themeColor("--popover"),
          foreground: themeColor("--popover-foreground"),
        },
        card: {
          DEFAULT: themeColor("--card"),
          foreground: themeColor("--card-foreground"),
        },
        success: {
          DEFAULT: themeColor("--success"),
          foreground: themeColor("--success-foreground"),
        },
        warning: {
          DEFAULT: themeColor("--warning"),
          foreground: themeColor("--warning-foreground"),
        },
        navbar: {
          DEFAULT: themeColor("--navbar-bg"),
          foreground: themeColor("--navbar-text"),
          hover: themeColor("--navbar-hover"),
        },
        chart: {
          1: themeColor("--chart-1"),
          2: themeColor("--chart-2"),
          3: themeColor("--chart-3"),
          4: themeColor("--chart-4"),
          5: themeColor("--chart-5"),
        },
        sidebar: {
          DEFAULT: themeColor("--sidebar"),
          foreground: themeColor("--sidebar-foreground"),
          primary: themeColor("--sidebar-primary"),
          "primary-foreground": themeColor("--sidebar-primary-foreground"),
          accent: themeColor("--sidebar-accent"),
          "accent-foreground": themeColor("--sidebar-accent-foreground"),
          border: themeColor("--sidebar-border"),
          ring: themeColor("--sidebar-ring"),
        },
        navy: {
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d9ff',
          300: '#a5bfff',
          400: '#8199ff',
          500: '#6366f1',
          600: '#4338ca',
          700: '#3730a3',
          800: '#312e81',
          900: '#1e1b4b',
          950: '#0f0a2e',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 0.2rem)",
        sm: "calc(var(--radius) - 0.4rem)",
        xl: "calc(var(--radius) + 0.2rem)",
        "2xl": "calc(var(--radius) + 0.4rem)",
      },
      boxShadow: {
        "2xs": "var(--shadow-2xs)",
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "Menlo", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(12px, -24px) scale(1.06)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 10s ease-in-out infinite",
        "gradient-pan": "gradient-pan 14s ease infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
