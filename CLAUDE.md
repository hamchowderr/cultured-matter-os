# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shadcn UI Kit Dashboard is a comprehensive Next.js 15 (React 19) admin dashboard template with 60+ dashboard pages, UI components, and ready-to-use applications. Built with Radix UI primitives, Tailwind CSS 4, TypeScript, and shadcn/ui components.

**Tech Stack:**
- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS 4 with CSS variables
- Radix UI primitives
- shadcn/ui components (New York style)
- Zustand for state management
- React Hook Form + Zod for forms
- TipTap for rich text editing

## Development Commands

```bash
# Development
npm run dev              # Start dev server on http://localhost:3000
npm install              # Install dependencies
npm install --legacy-peer-deps  # If peer dependency issues occur

# Build & Production
npm run build            # Build for production
npm start                # Start production server

# Code Quality
npm run lint             # Run ESLint
```

## System Requirements

- Node.js version 20 or above (v20 recommended if issues with newer versions)

## Important: Routing & Entry Points

**Critical:** This project has NO root page (`app/page.tsx` does not exist). Users must navigate directly to a specific route like `/dashboard/default`. Accessing the root URL `/` will result in a 404.

- Default dashboard entry: `/dashboard/default`
- 404 page (`app/not-found.tsx`) redirects users to `/dashboard`
- The `proxy.ts` file in root is unused legacy code (not configured as middleware)

When adding routing:
- Create `app/page.tsx` with a redirect if you want root URL to work
- Or set up `middleware.ts` to handle root redirects

## Project Structure

### App Router Architecture

The app follows Next.js 13+ App Router with route groups:

```
app/
├── dashboard/
│   ├── (auth)/          # Authenticated routes (with sidebar/header layout)
│   │   ├── layout.tsx   # Main dashboard layout with SidebarProvider
│   │   ├── default/     # Default dashboard
│   │   ├── apps/        # Application templates (16 apps)
│   │   ├── academy/     # Academy dashboard
│   │   ├── crm/         # CRM dashboard
│   │   ├── crypto/      # Crypto dashboard
│   │   ├── ecommerce/   # E-commerce dashboard
│   │   ├── finance/     # Finance dashboard
│   │   ├── sales/       # Sales dashboard
│   │   ├── logistics/   # Logistics dashboard
│   │   ├── hotel/       # Hotel dashboard
│   │   ├── hospital-management/  # Hospital dashboard
│   │   ├── project-management/   # Project management
│   │   ├── project-list/         # Project list
│   │   ├── website-analytics/    # Analytics dashboard
│   │   ├── pages/       # Utility pages (profile, settings, etc.)
│   │   └── widgets/     # Component widgets showcase
│   └── (guest)/         # Unauthenticated routes (no dashboard layout)
│       ├── login/
│       ├── register/
│       ├── forgot-password/
│       └── pages/       # Guest pages (404, 500, etc.)
├── layout.tsx           # Root layout with theme providers
├── globals.css          # Global styles and CSS variables
└── themes.css           # Theme preset definitions
```

### Component Organization

```
components/
├── layout/
│   ├── header/          # Dashboard header components
│   ├── sidebar/         # Sidebar navigation
│   │   ├── app-sidebar.tsx  # Main sidebar component
│   │   └── nav-main.tsx     # Navigation menu
│   └── logo.tsx         # Logo component
├── theme-customizer/    # Theme customization panel
│   ├── panel.tsx                  # Main customizer panel
│   ├── color-mode-selector.tsx    # Light/dark mode
│   ├── preset-selector.tsx        # Theme presets
│   ├── radius-selector.tsx        # Border radius
│   ├── scale-selector.tsx         # UI scale
│   ├── sidebar-mode-selector.tsx  # Sidebar variants
│   └── content-layout-selector.tsx # Content layout
├── ui/                  # shadcn/ui components
│   ├── custom/          # Custom extended UI components
│   │   ├── tiptap/      # TipTap rich text editor components
│   │   │   ├── rich-text-editor.tsx   # Main editor component
│   │   │   ├── toolbars/              # Editor toolbars
│   │   │   ├── extensions/            # TipTap extensions
│   │   │   ├── hooks/                 # Editor hooks
│   │   │   └── utils.tsx              # Editor utilities
│   │   ├── prompt/      # AI chat/prompt components
│   │   │   ├── chat-container.tsx
│   │   │   ├── message.tsx
│   │   │   ├── markdown.tsx           # Markdown renderer
│   │   │   ├── code-block.tsx         # Code syntax highlighting
│   │   │   ├── input.tsx
│   │   │   └── loader.tsx
│   │   └── count-animation.tsx        # Animated number counter
│   └── [component].tsx  # Individual UI components
└── active-theme.tsx     # Theme context provider
```

### Key Directories

- **hooks/** - Custom React hooks (`use-mobile.ts`, `use-toast.ts`, `use-file-upload.ts`)
- **lib/** - Utility functions and configurations
  - `utils.ts` - Common utilities (cn, generateMeta, etc.)
  - `themes.ts` - Theme configuration and presets (DEFAULT_THEME constant, THEMES array)
  - `fonts.ts` - Font configuration (loads 11 Google Fonts)
  - `ga.ts` - Google Analytics initialization
- **public/** - Static assets (including 404.svg for not-found page)

## Architecture Patterns

### Layout System

The project uses a sophisticated layout system with two route groups:

1. **(auth) routes** - Include the main dashboard layout:
   - Collapsible sidebar (AppSidebar) with cookie-persisted state
   - Header (SiteHeader) with theme customizer
   - Responsive design with tablet/mobile breakpoints
   - CSS custom properties for spacing (`--sidebar-width`, `--header-height`, `--content-padding`)

2. **(guest) routes** - Minimal layout for authentication pages

### Theme System

The theme system is highly customizable with:

- **8 color presets** defined in `themes.css` using OKLCH color space
- **Persistent theme settings** stored in cookies:
  - `theme_preset` - Color scheme (default, underground, rose-garden, lake-view, sunset-glow, forest-whisper, ocean-breeze, lavender-dream)
  - `theme_scale` - UI scale (none, 90, 95, 100, 105, 110)
  - `theme_radius` - Border radius (none, sm, default, md, lg, xl)
  - `theme_content_layout` - Content layout (full, centered)
  - `sidebar_state` - Sidebar open/closed state
- **CSS variable-based theming** - All colors use CSS custom properties
- **ActiveThemeProvider** - Client-side theme state management in `components/active-theme.tsx`
  - Provides `useThemeConfig()` hook for accessing and updating theme
  - Automatically syncs theme changes to cookies and data attributes
  - Theme config available via: `const { theme, setTheme } = useThemeConfig()`

### State Management

- **Zustand** for global state (e.g., chat app in `app/dashboard/(auth)/apps/chat/useChatStore.ts`)
- **React Context** for theme management (`ActiveThemeProvider`)
- **Cookies** for persistent UI preferences (sidebar state, theme settings)

### Data Patterns

**This is a frontend-only template with no API routes or backend.**

Applications use local JSON files for mock data (e.g., `data.json` files in app directories). When adding backend integration:
- No existing API routes in `app/api/` - you'll need to create them from scratch
- Replace JSON imports with API calls or Server Actions
- Consider Next.js Server Actions for mutations
- Use React Query/SWR for client-side data fetching if needed

### Typography & Fonts

The project loads **11 Google Fonts** via Next.js font optimization (`lib/fonts.ts`):
- **Default font**: Outfit (set via `--text-family` CSS variable)
- All fonts available as CSS variables: `--font-inter`, `--font-geist`, `--font-roboto`, `--font-montserrat`, `--font-poppins`, `--font-overpass-mono`, `--font-pt-sans`, `--font-plus-jakarta-sans`, `--font-hedvig-letters-serif`, `--font-kumbh-sans`, `--font-outfit`

**Performance note:** Loading 11 fonts impacts initial page load. Consider removing unused fonts from `lib/fonts.ts` if not needed for your project.

### Component Patterns

- **Server Components by default** - Use `"use client"` only when needed
- **shadcn/ui composition** - All UI components are local and customizable
- **Responsive design** - Mobile-first with `useMobile()` and `useIsTablet()` hooks
- **Icons** - Lucide React and Radix Icons

## Path Aliases

Configured in `tsconfig.json` and `components.json`:
```typescript
"@/*": ["./*"]
```

Usage:
```typescript
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
```

## shadcn/ui Configuration

The project is configured for shadcn/ui CLI (`components.json`):
- Style: New York
- Base color: Gray
- CSS variables: Enabled
- Icon library: Lucide React
- RSC: Enabled (React Server Components)

**Adding components:**
```bash
npx shadcn@latest add [component-name]
```

All UI components are locally installed in `components/ui/` and fully customizable.

## Styling

- **Tailwind CSS 4** with CSS `@import` syntax in `globals.css` (not the old v3 config format)
- **PostCSS config** (`postcss.config.mjs`) uses `@tailwindcss/postcss` plugin only
- **No separate tailwind.config.ts** - Configuration is in CSS using `@theme` or CSS variables
- **Color system** - OKLCH color space for better perceptual uniformity and accessibility
- **CSS custom properties** for all theme values (defined in `globals.css` and `themes.css`)
- **Class variance authority (CVA)** for component variants
- **`cn()` utility** - Combines clsx and tailwind-merge for className composition

### CSS Variable Reference

Key spacing variables defined in `(auth)/layout.tsx`:
```css
--sidebar-width: calc(var(--spacing) * 64)
--header-height: calc(var(--spacing) * 14)
--content-padding: calc(var(--spacing) * 4)
--content-margin: calc(var(--spacing) * 1.5)
--content-full-height: calc(100vh - var(--header-height) - (var(--content-padding) * 2) - (var(--content-margin) * 2))
```

## Code Formatting

Prettier configuration (`.prettierrc`):
- 2 space indentation
- Semicolons required
- 100 character line width
- Double quotes
- No trailing commas
- Tailwind class sorting plugin enabled

ESLint configuration (`.eslintrc`):
- Next.js core web vitals rules
- Disabled: `react/no-children-prop`, `react-hooks/exhaustive-deps`, `@next/next/no-img-element`

## Key Application Features

### Applications (`app/dashboard/(auth)/apps/`)

The kit includes 16 pre-built applications:
- **ai-chat** & **ai-chat-v2** - AI chatbot interfaces
- **ai-image-generator** - Image generation UI
- **api-keys** - API key management with DataTable
- **calendar** - Full-featured calendar with drag-and-drop (FullCalendar + @dnd-kit)
- **chat** - Messaging app with Zustand state management
- **courses** - Course management and learning platform
- **file-manager** - File browser interface
- **kanban** - Kanban board with drag-and-drop
- **mail** - Email client interface
- **notes** - Note-taking app with TipTap editor
- **pos-system** - Point of sale system
- **social-media** - Social media dashboard
- **tasks** - Task management
- **text-to-speech** - TTS interface
- **todo-list-app** - Todo list with categories

### Dashboard Templates

20+ specialized dashboard templates covering various industries (CRM, e-commerce, finance, hotel, hospital, logistics, etc.)

## Important Implementation Notes

### Adding New Pages

1. Create page in appropriate route group: `(auth)` or `(guest)`
2. Use `generateMeta()` utility from `@/lib/utils` for consistent SEO
3. Follow existing component structure with separate `components/` subdirectories

### Sidebar Navigation

Navigation is defined in `components/layout/sidebar/nav-main.tsx` with a typed structure:

```typescript
type NavGroup = {
  title: string;
  items: NavItem;
};

type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  isComing?: boolean;      // Show "Coming Soon" badge
  isDataBadge?: string;    // Show custom badge text
  isNew?: boolean;         // Show "New" badge
  newTab?: boolean;        // Open in new tab
  items?: NavItem;         // Nested sub-items
}[];

export const navItems: NavGroup[] = [
  {
    title: "Dashboards",
    items: [...]
  },
  {
    title: "Applications",
    items: [...]
  }
];
```

To add new routes:
1. Add item to `navItems` array in `nav-main.tsx`
2. Use Lucide icons for consistency
3. Sidebar automatically handles active states via `usePathname()`
4. Supports nested items and collapsible sections

### Theme Customization

To add a new theme preset:
1. Add theme definition in `app/themes.css` with OKLCH colors
2. Register theme in `lib/themes.ts` THEMES array
3. Define color scales for base-50 through base-1000 and primary colors

### Working with Forms

The project uses React Hook Form + Zod:
```typescript
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form"
```

### TipTap Editor

Rich text editing (used in notes app at `app/dashboard/(auth)/apps/notes`):

**Main component:** `components/ui/custom/tiptap/rich-text-editor.tsx`
- Custom toolbars for formatting, text alignment, lists, code blocks
- Extensions: code-block-lowlight, color, heading, highlight, horizontal-rule, image, link, placeholder, subscript, superscript, text-align, text-style, typography, underline
- Syntax highlighting with lowlight + shiki
- All TipTap packages are v3.15.3
- Custom CSS in `components/ui/custom/tiptap/tiptap.css`

**Usage pattern:**
```typescript
import { RichTextEditor } from "@/components/ui/custom/tiptap/rich-text-editor"

<RichTextEditor
  content={content}
  onChange={setContent}
/>
```

### AI Chat Components

Pre-built AI chat interface components in `components/ui/custom/prompt/`:

- **chat-container.tsx** - Main chat layout wrapper
- **message.tsx** - Individual message bubbles with role-based styling
- **markdown.tsx** - Markdown renderer using react-markdown with remark-gfm
- **code-block.tsx** - Syntax-highlighted code blocks with copy button (uses shiki)
- **input.tsx** - Chat input with auto-resize textarea
- **loader.tsx** - Typing indicator/loading state
- **suggestion.tsx** - Suggestion chips for prompts

Used in `app/dashboard/(auth)/apps/ai-chat-v2` for reference implementation.

## Production Configuration

- Asset prefix configured for production: `https://dashboard.shadcnuikit.com`
- Google Analytics integration (production only)
- Remote image patterns allowed: localhost, bundui-images.netlify.app

## Common Patterns

### Responsive Design
```typescript
import { useIsTablet } from "@/hooks/use-mobile"
import { useSidebar } from "@/components/ui/sidebar"

const { isMobile, setOpenMobile } = useSidebar()
const isTablet = useIsTablet()
```

### Toast Notifications
```typescript
import { toast } from "sonner"

toast.success("Operation completed")
toast.error("An error occurred")
```

### Data Tables
Uses @tanstack/react-table - see `apps/api-keys/datatable.tsx` for reference implementation

### Drag and Drop
Two libraries available:
- **@hello-pangea/dnd** - For kanban boards (React 19 compatible fork of react-beautiful-dnd)
- **@dnd-kit** - For calendar and complex interactions


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
