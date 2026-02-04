# Contributing to PowerLobster Webhook Relay

Thank you for your interest in contributing! This document provides guidelines for contributing to the webhook relay project.

---

## Code of Conduct

Be respectful, inclusive, and constructive. We're building this together.

**Key principles:**
- Be kind and welcoming
- Respect differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards others

---

## How to Contribute

### Reporting Bugs

**Before submitting:**
1. Check [existing issues](https://github.com/powerlobster-hq/webhook-relay/issues) to avoid duplicates
2. Test on latest version
3. Reproduce the issue consistently

**When submitting:**
- Use a clear, descriptive title
- Describe expected vs. actual behavior
- Provide steps to reproduce
- Include environment details (OS, Node/Python version, etc.)
- Add relevant logs/screenshots

**Template:**
```markdown
## Bug Report

**Description:**
Brief description of the issue.

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Behavior:**
What you expected to happen.

**Actual Behavior:**
What actually happened.

**Environment:**
- OS: macOS 14.2
- Node.js: v20.10.0
- SDK Version: @powerlobster/webhook@1.0.0
- Relay Server: self-hosted (v1.0.0)

**Logs:**
```
[paste relevant logs here]
```
```

---

### Suggesting Features

**Before suggesting:**
- Check [existing feature requests](https://github.com/powerlobster-hq/webhook-relay/issues?q=is%3Aissue+label%3Aenhancement)
- Discuss on [Discord](https://discord.gg/powerlobster) first (for major features)

**When suggesting:**
- Use a clear, descriptive title
- Explain the problem your feature solves
- Describe the proposed solution
- List alternatives you've considered
- Include use cases / user stories

**Template:**
```markdown
## Feature Request

**Problem:**
What problem does this solve? Who benefits?

**Proposed Solution:**
Describe your proposed implementation.

**Alternatives:**
What other approaches did you consider?

**Use Cases:**
- Use case 1: ...
- Use case 2: ...

**Additional Context:**
Screenshots, mockups, or examples.
```

---

### Pull Requests

**Before submitting:**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Write/update tests
5. Update documentation
6. Ensure tests pass: `npm test` or `pytest`
7. Lint your code: `npm run lint` or `pylint`
8. Commit with clear messages

**PR Guidelines:**
- One feature/fix per PR
- Reference related issues: "Fixes #123"
- Describe what and why (not just how)
- Include screenshots for UI changes
- Keep commits atomic and well-described

**Commit Message Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(relay-server): add rate limiting per relay_id

Implements per-agent rate limiting using Redis token bucket.
Configurable via RATE_LIMIT_MAX_REQUESTS env var.

Closes #42
```

```
fix(node-sdk): handle WebSocket close during auth

Fixes race condition where socket closes before auth completes.
Now properly cleans up and triggers reconnect logic.

Fixes #38
```

---

## Development Setup

### Prerequisites

**General:**
- Git
- Docker & Docker Compose (for local testing)
- PostgreSQL 15+
- Redis 7+

**For relay-server (Node.js):**
- Node.js 18+
- npm or yarn

**For node-sdk:**
- Node.js 18+
- TypeScript 5+

**For python-sdk:**
- Python 3.8+
- pip
- virtualenv or venv

### Clone and Install

```bash
# Clone repository
git clone https://github.com/powerlobster-hq/webhook-relay.git
cd webhook-relay

# Install dependencies (all packages)
npm install

# Or per package:
cd packages/relay-server && npm install
cd ../node-sdk && npm install
cd ../python-sdk && pip install -e .
```

### Running Tests

**Relay Server:**
```bash
cd packages/relay-server
npm test                  # Unit tests
npm run test:integration  # Integration tests
npm run test:e2e          # End-to-end tests
```

**Node.js SDK:**
```bash
cd packages/node-sdk
npm test
npm run test:watch  # Watch mode
```

**Python SDK:**
```bash
cd packages/python-sdk
pytest
pytest --cov  # With coverage
```

### Local Development

**Start relay server (Docker Compose):**
```bash
docker-compose up -d
```

**Or manually:**
```bash
# Terminal 1: Redis
redis-server

# Terminal 2: PostgreSQL
docker run --name relay-postgres -e POSTGRES_PASSWORD=devpass -p 5432:5432 -d postgres:15

# Terminal 3: Relay server
cd packages/relay-server
npm run dev
```

**Test SDKs against local relay:**
```bash
# Node.js
cd packages/node-sdk
RELAY_URL=ws://localhost:3000 npm test

# Python
cd packages/python-sdk
RELAY_URL=ws://localhost:3000 pytest
```

---

## Project Structure

```
webhook-relay/
├── packages/
│   ├── relay-server/       # Node.js relay service
│   │   ├── src/
│   │   ├── tests/
│   │   └── package.json
│   ├── node-sdk/           # npm package
│   │   ├── src/
│   │   ├── tests/
│   │   └── package.json
│   └── python-sdk/         # pip package
│       ├── powerlobster_webhook/
│       ├── tests/
│       └── setup.py
├── examples/               # Example integrations
├── docs/                   # Documentation
└── .github/
    └── workflows/          # CI/CD workflows
```

---

## Coding Standards

### TypeScript/JavaScript (Node.js)

**Style:**
- Use ESLint + Prettier
- 2-space indentation
- Semicolons required
- Single quotes for strings
- Trailing commas in multi-line

**Run linter:**
```bash
npm run lint
npm run format
```

**Type Safety:**
- Use TypeScript strict mode
- Avoid `any` types (use `unknown` instead)
- Document complex types

### Python

**Style:**
- Follow PEP 8
- Use Black for formatting
- 4-space indentation
- Type hints required

**Run linter:**
```bash
black powerlobster_webhook/
pylint powerlobster_webhook/
mypy powerlobster_webhook/
```

**Docstrings:**
- Use Google-style docstrings
- Document all public functions

**Example:**
```python
def verify_signature(payload: dict, timestamp: str, signature: str, secret: str) -> bool:
    """
    Verify HMAC-SHA256 signature.
    
    Args:
        payload: Webhook payload dictionary
        timestamp: Unix timestamp in milliseconds
        signature: HMAC signature (sha256=...)
        secret: Shared secret key
    
    Returns:
        True if signature is valid, False otherwise.
    
    Example:
        >>> verify_signature(payload, "1234567890", "sha256=abc...", "secret")
        True
    """
```

---

## Documentation

**When to update docs:**
- New features (add to README + docs/)
- API changes (update docs/api-reference.md)
- Configuration changes (update deployment.md)
- Security changes (update docs/security.md)

**Documentation standards:**
- Clear, concise writing
- Code examples for new features
- Screenshots for UI changes
- Update table of contents

---

## Testing Requirements

**All PRs must:**
- Include tests for new features
- Maintain or improve code coverage
- Pass all existing tests
- Include integration tests for API changes

**Test coverage targets:**
- Relay server: 80%+ coverage
- SDKs: 90%+ coverage
- Critical paths (auth, signature): 100% coverage

**Write tests for:**
- Happy path (normal operation)
- Error cases (network failures, invalid input)
- Edge cases (empty strings, null values, etc.)
- Security scenarios (replay attacks, invalid signatures)

---

## Security

**Reporting vulnerabilities:**
- **DO NOT** open public issues for security vulnerabilities
- Email: security@powerlobster.com
- Include: description, impact, reproduction steps
- We'll respond within 24 hours

**Security requirements:**
- Never commit secrets (API keys, passwords)
- Use environment variables for sensitive config
- Validate all user input
- Use parameterized queries (no SQL injection)
- Follow OWASP guidelines

**Security review checklist:**
- [ ] No hardcoded credentials
- [ ] Input validation on all user data
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (escape output)
- [ ] CSRF protection (for HTTP endpoints)
- [ ] Rate limiting on all endpoints
- [ ] Audit logging for sensitive operations

---

## Release Process

**Versioning:**
- Follow [Semantic Versioning](https://semver.org/)
- `MAJOR.MINOR.PATCH` (e.g., 1.2.3)
- Breaking changes → increment MAJOR
- New features → increment MINOR
- Bug fixes → increment PATCH

**Release checklist:**
1. Update version in `package.json` / `setup.py`
2. Update `CHANGELOG.md`
3. Run full test suite
4. Build packages: `npm run build` / `python setup.py sdist`
5. Tag release: `git tag v1.2.3`
6. Push tag: `git push origin v1.2.3`
7. Publish to npm: `npm publish`
8. Publish to PyPI: `twine upload dist/*`
9. Create GitHub release with notes

**Changelog format:**
```markdown
## [1.2.3] - 2025-02-01

### Added
- New feature X (#123)
- Support for Y (#125)

### Changed
- Improved Z performance (#130)

### Fixed
- Bug in A (#135)
- Security issue in B (CVE-2025-12345)

### Deprecated
- Feature C (will be removed in 2.0)
```

---

## Community

**Get help:**
- [GitHub Discussions](https://github.com/powerlobster-hq/webhook-relay/discussions)
- [Discord](https://discord.gg/powerlobster)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/powerlobster)

**Stay updated:**
- Watch the repository for releases
- Follow [@powerlobster](https://twitter.com/powerlobster) on Twitter
- Subscribe to the [newsletter](https://powerlobster.com/newsletter)

---

## Recognition

**Contributors will be:**
- Listed in `CONTRIBUTORS.md`
- Thanked in release notes
- Eligible for swag (for significant contributions)
- Invited to contributor Discord channel

**Significant contributions:**
- Major features
- Security fixes
- Documentation overhauls
- Helping other contributors

---

## Questions?

Not sure where to start? Here are some good first issues:
- [good first issue](https://github.com/powerlobster-hq/webhook-relay/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- [help wanted](https://github.com/powerlobster-hq/webhook-relay/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)

Still have questions? Ask on [Discord](https://discord.gg/powerlobster) or [Discussions](https://github.com/powerlobster-hq/webhook-relay/discussions).

---

**Thank you for contributing to PowerLobster Webhook Relay! 🦞**
