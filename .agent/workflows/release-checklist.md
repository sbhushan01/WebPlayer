---
description: Checklist to run after every feature change, bug fix, or version bump to keep docs and metadata in sync.
---

# Release Checklist

After **every** code change (feature, fix, refactor, or version bump), always update the following three files before considering the task complete:

## 1. `manifest.json`
- Bump the `"version"` field if this is a new release or significant change.
- Update `"description"` if the extension's scope or capability has changed.
- Add/remove any new `"permissions"`, `"host_permissions"`, or `"web_accessible_resources"` that the change requires.

## 2. `README.md`
- Update the **Version** line near the top (`**Version:** X.Y.Z`) to match `manifest.json`.
- Add or update feature descriptions under **Key Features** if new functionality was added.
- Update the **Keyboard Shortcuts** table if shortcuts were added/changed.
- Update the **Building & Installation** or **Usage** sections if the workflow changed.

## 3. `welcome.html`
- Update the **version badge** in the topbar (`<span class="version-badge">vX.Y.Z</span>`, near line 368).
- Update the **footer version** text (`Version X.Y.Z`, near line 526).
- Add/update feature cards in the **features-grid** section if a user-visible feature was added.
- Update the **shortcuts-grid** section if keyboard shortcuts changed.
- Update the **modes-grid** descriptions if overlay/standalone behavior changed.

## Quick grep to verify version consistency
```bash
grep -n "version" manifest.json
grep -n "Version" README.md
grep -n "version\|Version" welcome.html
```

All three files must show the **same version number**.
