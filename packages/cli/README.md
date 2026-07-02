# @openartshield/cli

The `oas` command-line interface for [OpenArtShield](../../README.md): the user-facing surface over the project's protection layers - Trace (`protect` / `embed` / `extract` / `verify`), Measure (`ai-audit`), Cloak (`cloak`), and Audit (`audit`).

```bash
oas embed input.png --message "artist=demo" --seed 123 --out protected.png
oas extract protected.png --seed 123 --message-length 34
oas audit input.png --message "artist=demo" --seed 123 --out report.json
oas version
```

See the [root README](../../README.md) for full documentation.

> **OpenArtShield does not make images AI-proof. All results should be interpreted as experimental.**

## License

Apache-2.0
