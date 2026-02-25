# Browser Automation with agent-browser

Use `agent-browser` for web automation.

## Installation
```bash
npm install -g agent-browser
agent-browser install  # Download Chromium
```

## Core Workflow
1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

## Common Commands

**Navigation & Interaction**
- `agent-browser open <url>` - Navigate to URL
- `agent-browser click <ref>` - Click element
- `agent-browser fill <ref> "text"` - Fill input
- `agent-browser type <ref> "text"` - Type character by character
- `agent-browser hover <ref>` - Hover element
- `agent-browser scroll down/up <px>` - Scroll

**Get Info**
- `agent-browser snapshot` - Full accessibility tree
- `agent-browser snapshot -i` - Interactive elements only (recommended)
- `agent-browser snapshot -c` - Compact mode
- `agent-browser get text @e1` - Get text content
- `agent-browser screenshot [path]` - Take screenshot

**Wait & Assert**
- `agent-browser wait <ms>` - Wait milliseconds
- `agent-browser wait --text "Done"` - Wait for text
- `agent-browser is visible @e1` - Check visibility

**Browser Control**
- `agent-browser back` - Go back
- `agent-browser reload` - Reload
- `agent-browser close` - Close browser

## Using Refs

`snapshot` returns elements with refs:
```
- heading "Login" [ref=e1]
- button "Submit" [ref=e2]
- textbox "Email" [ref=e3]
```

Use `@e1`, `@e2` to interact - more stable than CSS selectors.

## Debug Mode

Show browser window:
```bash
agent-browser open <url> --headed
```

## Tips
- Re-run `snapshot` after page changes
- Use `-i` to filter interactive elements only
- Use `-d 3` to limit depth for complex pages
