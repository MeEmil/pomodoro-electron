# pomodoro-electron

A small always-on-top Pomodoro timer for macOS. Completed intervals are appended to a Markdown table in an Obsidian vault.

## Run

```bash
npm install
npm start
```

Requires Node.js and macOS. Minimize hides the window and keeps the countdown in the menu bar. Close quits.

## Config

Copy `config.example.json` to `config.json` (gitignored) if the default path is wrong:

```json
{
  "obsidianLogPath": "~/Obsidian Vault/Pomodoro Log.md"
}
```

Default without a config file is `~/Obsidian Vault/Pomodoro Log.md`. `~` is expanded to the home directory.

## Log format

On a full countdown to `00:00`, one row is appended. Cancelled or reset sessions are not logged.

```markdown
# Pomodoro Log

| Date | Start Time | End Time | Duration | Task | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-10-19 | 14:15 | 14:40 | 25m | Write PRD | Completed |
```

The file is created with that header if it does not exist.

## License

MIT
