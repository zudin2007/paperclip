# Setup Guide - Paperclip Repository

Paperclip adalah aplikasi open-source untuk orchestration dan management tim AI agents. Repository ini berisi kode lengkap untuk API server, UI dashboard, dan plugin system.

## Prerequisites

- **Node.js 20+** (current: v22.22.2)
- **pnpm 9.15+** (current: 9.15.4)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

Dependencies sudah diinstall untuk semua workspace projects (29 packages).

### 2. Build Project

```bash
pnpm build
```

Ini akan membangun semua workspace packages termasuk:
- Core server dan database
- UI (React)
- CLI tools
- Adapter packages untuk berbagai AI agents (Claude, OpenClaw, Cursor, Codex, Gemini, dll)
- Plugin SDK dan contoh plugins

### 3. Development Server

Untuk menjalankan development environment:

```bash
pnpm dev
```

Ini akan memulai:
- **API Server**: `http://localhost:3100`
- **UI Dashboard**: Served by API server (same origin)
- **Database**: Embedded PostgreSQL (auto-setup, tidak perlu konfigurasi manual)

Untuk development tanpa file watching:

```bash
pnpm dev:once
```

### 4. Cek Dev Server

Untuk melihat status dev runner yang sedang berjalan:

```bash
pnpm dev:list
pnpm dev:stop
```

## Key Features

### Workspace Structure

```
paperclip/
├── packages/
│   ├── adapter-utils/       # Shared utilities untuk adapters
│   ├── adapters/            # AI agent adapters (claude, openclaw, cursor, etc)
│   ├── db/                  # Database schema dan migrations
│   ├── mcp-server/          # Model Context Protocol server
│   ├── shared/              # Shared types dan utilities
│   ├── skills-catalog/      # Skill definitions catalog
│   ├── teams-catalog/       # Teams configuration
│   └── plugins/             # Plugin SDK dan examples
├── server/                  # Express API server
├── ui/                      # React dashboard UI
├── cli/                     # CLI tooling
├── skills/                  # Agent skills (paperclip skill included)
└── docs/                    # Documentation
```

### Available Commands

**Development:**
```bash
pnpm dev              # Full dev (API + UI, watch mode)
pnpm dev:once         # Full dev without file watching
pnpm dev:server       # Server only
pnpm typecheck        # Type checking
```

**Building:**
```bash
pnpm build            # Build all workspace packages
pnpm build-storybook  # Build Storybook for UI components
```

**Testing:**
```bash
pnpm test             # Vitest unit tests
pnpm test:watch       # Vitest watch mode
pnpm test:e2e         # Playwright E2E tests (browser)
```

**Database:**
```bash
pnpm db:generate      # Generate new DB migration
pnpm db:migrate       # Apply pending migrations
```

**UI Development:**
```bash
pnpm storybook        # Run Storybook on port 6006
```

## Configuration

### Environment Variables

Buat file `.env` (atau gunakan default):

```bash
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
PORT=3100
SERVE_UI=false
BETTER_AUTH_SECRET=paperclip-dev-secret
```

Untuk development lokal, default configuration sudah cukup. Database PostgreSQL akan di-embed otomatis.

### Authenticated/Private Mode

Untuk menjalankan dengan authentication (Tailscale atau private network):

```bash
pnpm dev --bind lan      # Private network mode
pnpm dev --bind tailnet  # Tailscale-only mode
```

Setup admin:
```bash
pnpm paperclipai auth bootstrap-ceo
```

## Architecture Overview

### API Server (Node.js/Express)
- Heartbeat-based agent orchestration
- Issue/task management
- Budget tracking dan cost control
- Multi-company support dengan data isolation
- Plugin system untuk extensibility

### UI Dashboard (React)
- Real-time task/issue management
- Agent org chart visualization
- Budget tracking dashboard
- Approval workflow management
- Issue workspace runtime controls

### Database (PostgreSQL)
- Embedded postgres untuk development
- Full schema dengan migrations
- Support untuk multi-company isolation

### Adapters
Support untuk berbagai AI agents:
- Claude Code (local)
- OpenClaw (gateway)
- Cursor (local & cloud)
- Codex (local)
- Gemini (local)
- Grok (local)
- Pi (local)
- Dan lainnya...

## Deployment

### Local Development
Database embedded PostgreSQL otomatis tersedia.

### Production
Sesuaikan `DATABASE_URL` ke PostgreSQL instance Anda sendiri dan deploy server seperti aplikasi Node.js biasa.

Untuk dokumentasi lengkap deployment, lihat: `doc/DEPLOYMENT-MODES.md`

## Development Guidelines

1. **Testing**: Jalankan `pnpm test` untuk unit tests default
2. **Type Checking**: Gunakan `pnpm typecheck` sebelum commit
3. **Browser Testing**: Gunakan `pnpm test:e2e` untuk Playwright tests
4. **File Watching**: `pnpm dev` auto-restart server pada file changes

### Restart Policy
- Board UI menunjukkan banner "Restart required" jika backend changes terdeteksi
- Enable "guarded auto-restart" di Instance Settings > Experimental untuk auto-restart

## Debugging

### View Dev Runner Status
```bash
pnpm dev:list         # List active dev runners
pnpm dev:stop         # Stop current dev runner
```

### Check Logs
Development server logs ditampilkan di console saat menjalankan `pnpm dev`.

## Resources

- **Documentation**: https://paperclip.ing/docs
- **GitHub**: https://github.com/paperclipai/paperclip
- **Discord**: https://discord.gg/m4HZY7xNG3
- **Twitter**: https://x.com/papercliping

## Next Steps

1. Jalankan `pnpm dev` untuk memulai development
2. Buka `http://localhost:3100` di browser
3. Setup company dan agents melalui UI
4. Create goals dan assign tasks kepada agents
5. Monitor execution dan costs dari dashboard

---

Setup selesai! Repository siap untuk development. 🎉
