# Settings Localization Management

This document describes the structure of the `settings.yaml` files used for i18n in AIRI and how to manage them reliably using the provided tooling.

## YAML Structure

The localization keys follow a hierarchical structure:
- `pages`: Root for page-specific translations.
    - `modules`: Specific functional modules (e.g., `mcp-server`, `providers`).
        - `mcp-server`:
            - `title`: Display name of the section.
            - `description`: Subtitle/help text.
            - `actions`: Button labels and primary interactions.
            - `dashboard`: Content for the live dashboard view.

## Management Tool: `yaml-manager.js`

To avoid manual editing errors and key shadowing in large YAML files, use `scripts/yaml-manager.js`.

### Commands

#### 1. Analyze
Prints a flat list of full-dot-separated paths for all keys in the file.
```bash
npx tsx scripts/yaml-manager.js analyze packages/i18n/src/locales/en/settings.yaml
```

#### 2. Audit
Checks for duplicate keys which YAML parsers usually overwrite silently.
```bash
npx tsx scripts/yaml-manager.js audit packages/i18n/src/locales/en/settings.yaml
```

#### 3. Update
Programmatically inserts or updates a key at a specific path while preserving comments and formatting.
```bash
npx tsx scripts/yaml-manager.js update packages/i18n/src/locales/en/settings.yaml pages.modules.mcp-server.actions.refresh "Refresh Status"
```

## Best Practices

1. **Audit First**: Always run `audit` before and after manual edits.
2. **Prefer Tooling**: Use the `update` command for adding new keys to ensure they are placed correctly in the hierarchy.
3. **Cross-Locale Sync**: When adding a key to `en/settings.yaml`, remember to add it to `es`, `ja`, and `ru` using the same path.
