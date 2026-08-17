# Vendored deployment dependencies

These packages are included in the repository so Zeabur builds do not depend
on upstream GitHub repositories being publicly accessible.

- `timeline-for-agent` 0.1.0: recovered from the previously working Zeabur
  installation. Large example screenshots were omitted; runtime source,
  metadata, tests, README, and license are preserved.
- `whereabouts-mcp` 0.1.0: recovered from the previously working Zeabur
  installation.
- `galatea-garden-wake-bridge` 0.2.1: source corresponding to upstream commit
  `f0cd9c27f1b95d6ff8bd8e0f367de7d4518a1c81`. It uses the dedicated
  `https://wake-v1.abysslumina.com` endpoint and the upstream fail-closed
  single-connection policy.

All three packages retain their upstream license files or metadata.
