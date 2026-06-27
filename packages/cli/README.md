# @openartshield/cli

The `oas` command-line interface for [OpenArtShield](../../README.md): embed, extract, and audit invisible image watermarks.

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
