# Spec 005: shadcn/ui Migration

## Overview

Migrate the web frontend from custom Tailwind styles to shadcn/ui components. Use native shadcn styles without customization.

## Goals

- Replace custom-styled components with shadcn/ui equivalents
- Maintain all existing functionality
- Achieve consistent, production-ready UI
- Zero custom style overrides on shadcn components

## Scope

### Components to Migrate

| Current Component | shadcn Replacement |
|-------------------|-------------------|
| QueryInput | `Input` + `Button` |
| Sidebar | `Sheet` (mobile) + `ScrollArea` |
| ThemeToggle | `Button` + `DropdownMenu` |
| ResponseStream | `Card` + `Skeleton` |
| CitationList | `Accordion` + `Badge` |
| FeedbackWidget | `Button` + `Textarea` + `Dialog` |
| CodeBlock | `Card` + custom (keep syntax highlighter) |
| MarkdownRenderer | Keep as-is (content renderer) |

### New shadcn Components Needed

```bash
npx shadcn@latest add button input card skeleton accordion badge sheet scroll-area dropdown-menu dialog textarea separator avatar
```

## Implementation

### Phase 1: Setup

1. Initialize shadcn/ui
```bash
cd apps/web
npx shadcn@latest init
```

2. Select options:
   - Style: Default
   - Base color: Slate
   - CSS variables: Yes
   - Tailwind CSS: Yes (already configured)
   - Components directory: `src/components/ui`

### Phase 2: Component Migration

#### 2.1 QueryInput
- Replace custom input with `<Input />`
- Replace custom button with `<Button />`
- Keep character count logic

#### 2.2 Sidebar
- Use `<Sheet />` for mobile drawer
- Use `<ScrollArea />` for conversation list
- Use `<Button variant="ghost" />` for conversation items

#### 2.3 ThemeToggle
- Use `<Button variant="outline" size="icon" />`
- Use `<DropdownMenu />` for theme options (light/dark/system)

#### 2.4 ResponseStream
- Wrap in `<Card />`
- Use `<Skeleton />` for loading state
- Use `<Avatar />` for bot icon

#### 2.5 CitationList
- Use `<Accordion />` for expandable citations
- Use `<Badge />` for relevance indicators

#### 2.6 FeedbackWidget
- Use `<Dialog />` for feedback modal
- Use `<Button />` for thumbs up/down
- Use `<Textarea />` for comments

### Phase 3: Layout Updates

- Use `<Separator />` for visual dividers
- Ensure dark mode works via shadcn's built-in support
- Remove custom CSS variables (use shadcn's)

## Constraints

- **No custom style overrides** on shadcn components
- Use only shadcn's built-in variants (`default`, `outline`, `ghost`, `destructive`)
- Keep existing component APIs unchanged where possible
- Maintain test coverage

## Testing

- All existing tests must pass
- Visual regression acceptable (expected with new design system)
- Manual testing for:
  - Light/dark mode
  - Mobile responsiveness
  - Keyboard navigation

## Success Criteria

- [ ] shadcn/ui initialized
- [ ] All components migrated
- [ ] No custom style overrides
- [ ] All tests passing
- [ ] Dark mode functional
- [ ] Mobile responsive

## Timeline

Estimated: 2-3 hours

## References

- [shadcn/ui docs](https://ui.shadcn.com/)
- [shadcn/ui GitHub](https://github.com/shadcn-ui/ui)
