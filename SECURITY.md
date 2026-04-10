# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| 1.x     | :x:                |

## Reporting a Vulnerability

We take security issues seriously. Please report vulnerabilities privately rather than in public issues.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email the maintainers directly or use GitHub's private vulnerability reporting
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### Response Timeline

We aim to acknowledge reports within **48 hours** and provide a detailed response within **7 days**.

We follow responsible disclosure practices and will work with reporters on disclosure timing.

### What to Expect

- Acknowledgment of your report
- Regular updates on the progress
- Credit in the security advisory (if desired)
- A fix before public disclosure

## Security Considerations

### State Files

GraphWiki stores state in `graphwiki-out/` and `.omc/state/`. These directories may contain sensitive session data:

- `.omc/state/` — mode, iteration, and task state
- `.omc/notepad.md` — working notes and context

**Recommendation:** Exclude these from version control by ensuring they are in `.gitignore`.

### API Keys and Credentials

- Never commit API keys or credentials to the repository
- Use environment variables for sensitive configuration
- The project uses `.graphwiki/config.json` for settings — do not store secrets here

### Hook Scripts

GraphWiki may execute hook scripts. Only install or run hooks from trusted sources.

### Source Files

Files in `raw/` are treated as immutable sources. Do not modify them — this ensures reproducibility and auditability of the knowledge graph.

## Update Policy

Security updates are provided for the latest minor version. We recommend keeping GraphWiki up to date.

## Credit

We gratefully acknowledge security researchers who help keep GraphWiki safe. Credit will be given in the security advisory unless anonymity is requested.
