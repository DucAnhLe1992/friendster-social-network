# Friendster Modern - Design System

## Design Philosophy

**Minimalist Tech-Savvy Aesthetic**
- Clean, spacious layouts with intentional whitespace
- Subtle gradients and glassmorphism effects
- Smooth micro-interactions and transitions
- Dark-only theme: one carefully tuned palette instead of two half-maintained ones
- Modern typography with excellent readability

## Color Palette

### Primary Colors
```css
--primary: #6366f1;           /* Indigo 500 */
--primary-light: #818cf8;     /* Indigo 400 */
--primary-dark: #4f46e5;      /* Indigo 600 */
--primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
```

### Background Colors (Dark Mode - Default)
```css
--bg-primary: #0f0f23;        /* Deep navy black */
--bg-secondary: #1a1a2e;      /* Dark purple-blue */
--bg-tertiary: #252542;       /* Lighter card bg */
--bg-elevated: #2d2d5a;       /* Elevated surfaces */
```

### Text Colors
```css
--text-primary: #f8fafc;
--text-secondary: #94a3b8;
--text-muted: #64748b;
--text-inverse: #0f172a;
```

### Accent Colors
```css
--accent-success: #10b981;
--accent-warning: #f59e0b;
--accent-error: #ef4444;
--accent-info: #3b82f6;
```

### Gradients
```css
--gradient-primary: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
--gradient-glow: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
--gradient-card: linear-gradient(145deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 35, 0.95) 100%);
```

## Typography

### Font Family
```css
--font-sans: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale
```css
--text-xs: 0.75rem;      /* 12px */
--text-sm: 0.875rem;     /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg: 1.125rem;     /* 18px */
--text-xl: 1.25rem;      /* 20px */
--text-2xl: 1.5rem;      /* 24px */
--text-3xl: 1.875rem;    /* 30px */
--text-4xl: 2.25rem;     /* 36px */
```

### Font Weights
```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

## Spacing System

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
```

## Border Radius

```css
--radius-sm: 0.375rem;   /* 6px */
--radius-md: 0.5rem;     /* 8px */
--radius-lg: 0.75rem;    /* 12px */
--radius-xl: 1rem;       /* 16px */
--radius-2xl: 1.5rem;    /* 24px */
--radius-full: 9999px;
```

## Shadows

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
--shadow-glow: 0 0 20px rgba(99, 102, 241, 0.3);
--shadow-card: 0 8px 32px rgba(0, 0, 0, 0.4);
```

## Glassmorphism

```css
--glass-bg: rgba(26, 26, 46, 0.7);
--glass-border: rgba(255, 255, 255, 0.08);
--glass-blur: blur(20px) saturate(180%);
```

## Animations

### Durations
```css
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 350ms;
--duration-slower: 500ms;
```

### Easing
```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Key Animations

#### Fade In Up
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

#### Scale In
```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

#### Pulse Glow
```css
@keyframes pulseGlow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
  }
  50% {
    box-shadow: 0 0 40px rgba(99, 102, 241, 0.5);
  }
}
```

#### Shimmer
```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
```

## Component Styles

### Buttons

#### Primary Button
```css
.btn-primary {
  background: var(--gradient-primary);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-lg);
  font-weight: var(--font-semibold);
  transition: all var(--duration-normal) var(--ease-out);
  box-shadow: var(--shadow-glow);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.5);
}
```

#### Secondary Button
```css
.btn-secondary {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  color: var(--text-primary);
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-lg);
  transition: all var(--duration-normal) var(--ease-out);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}
```

### Cards

#### Post Card
```css
.post-card {
  background: var(--gradient-card);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  backdrop-filter: var(--glass-blur);
  transition: all var(--duration-normal) var(--ease-out);
}

.post-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow: var(--shadow-card);
}
```

### Inputs

```css
.input-field {
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  padding: 0.875rem 1rem;
  color: var(--text-primary);
  transition: all var(--duration-normal) var(--ease-out);
}

.input-field:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  outline: none;
}

.input-field::placeholder {
  color: var(--text-muted);
}
```

### Navigation

#### Sidebar
```css
.sidebar {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--glass-border);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  transition: all var(--duration-normal) var(--ease-out);
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary-light);
}
```

## Layout

### Grid System
- Main layout: Sidebar (280px) + Feed (flex-1) + Right Panel (350px)
- Mobile: Single column with bottom navigation
- Max content width: 1200px

### Responsive Breakpoints
```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

## Icons

- Icon library: Lucide React
- Default size: 20px
- Stroke width: 2
- Color: inherit from parent

## Avatar Sizes

```css
--avatar-xs: 24px;
--avatar-sm: 32px;
--avatar-md: 40px;
--avatar-lg: 56px;
--avatar-xl: 80px;
--avatar-2xl: 120px;
```

## Scrollbar

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--bg-elevated);
}
```

## Loading States

### Skeleton
```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--bg-elevated) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}
```

### Spinner
```css
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--bg-tertiary);
  border-top-color: var(--primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```
