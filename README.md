# jedipunkz.rocks

Hugo + [PaperMod](https://github.com/adityatelange/hugo-PaperMod) (git submodule).

```bash
git submodule update --init --recursive   # fetch/update the theme
hugo server                               # local preview
```

## Stylesheets

PaperMod concatenates CSS in a fixed order, and this site only fills the slots
the theme reserves for overrides:

| File | Loaded | Holds |
| --- | --- | --- |
| `assets/css/core/theme-vars.css` | first | design tokens (colours, spacing, shadows, type scale) |
| `assets/css/includes/chroma-styles.css` | after the theme's own CSS | Tokyo Night syntax token colours |
| `assets/css/extended/*.css` | last | everything else, concatenated in filename order |

Files under `extended/` are numbered because that order *is* the cascade:

1. `01-base.css` — element defaults (typography, links, tables, media)
2. `02-code.css` — code block and inline code presentation
3. `03-components.css` — PaperMod widgets (post cards, nav, pagination, footer)
4. `04-mermaid.css` — mermaid diagrams, which must undo some of `02-code.css`

Add a rule to the file that owns its concern; add a new file only for a new
concern, and number it so the cascade stays readable.

Colours follow [Tokyo Night](https://github.com/folke/tokyonight.nvim): the
Night palette in dark mode, Tokyo Night Day in light mode. Link, metadata and
code colours are darkened from the upstream Day values where the originals fell
short of WCAG AA on these backgrounds. Code blocks stay on the Night palette in
both themes; inline code follows the active theme.

## Layout overrides

| File | Why |
| --- | --- |
| `layouts/partials/extend_head.html` | loads Inter, JetBrains Mono and Noto Sans JP (the Japanese face is fetched so body weight 500 resolves to a real medium everywhere) |
| `layouts/partials/extend_footer.html` | mermaid bootstrap, themed to match the code blocks |
| `layouts/_default/_markup/render-table.html` | wraps markdown tables so they can scroll without `display: block` collapsing their columns |

The header shows `params.label.text` (`jedipunkz`), not `title`, because the
home page already prints the full site title as its `h1`.
