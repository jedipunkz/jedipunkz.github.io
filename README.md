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
