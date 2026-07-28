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

## Troubleshooting (Hasil Setup Nyata di Windows)

Catatan dari setup end-to-end di dua PC Windows. Kerjakan berurutan kalau menemui masalah serupa.

### 1. Versi pnpm WAJIB 9.15.4

pnpm 10/11 mengabaikan `pnpm.patchedDependencies` di `package.json` (muncul warning kuning *"The pnpm field in package.json is no longer read"*). Akibatnya patch untuk `embedded-postgres` tidak diterapkan dan install jadi rusak (gejala: `Command "tsx" not found`).

```cmd
npm install -g pnpm@9.15.4
rmdir /s /q node_modules
pnpm install
```

Install yang benar TIDAK menampilkan warning kuning tersebut.

### 2. Error `EPERM: operation not permitted, symlink` saat pnpm install

Windows memblokir pembuatan symlink tanpa izin. Aktifkan **Developer Mode**:
Settings → **System** → **For developers** → toggle **Developer Mode** ON. Lalu buka terminal baru dan ulangi `pnpm install`.

### 3. JANGAN jalankan dari terminal Administrator

PostgreSQL menolak dijalankan dari proses elevated:
*"Execution of PostgreSQL by a user with administrative permissions is not permitted"*.
Selalu pakai terminal biasa. (Developer Mode membuat hak admin tidak diperlukan.)

### 4. Tambahkan pengecualian Windows Defender

Tanpa exclusion, Defender men-scan binary postgres saat first run — init database jadi sangat lambat (menit-menitan) bahkan bisa korup (`postgresql.conf` 0 bytes). Tambahkan di
Windows Security → Virus & threat protection → Exclusions:

- `C:\Users\<user>\paperclip` (folder repo)
- `C:\Users\<user>\.paperclip` (folder data)

### 5. Error `pre-existing shared memory block is still in use`

Ada proses postgres lama yang masih hidup dan memegang folder database:

```cmd
taskkill /f /im postgres.exe
pnpm dev
```

### 6. Reset database (migration bentrok / error `42P07 relation already exists`)

Percobaan gagal yang meninggalkan database setengah-jadi bisa dibersihkan total (data hilang, hanya untuk instance baru/percobaan):

```cmd
taskkill /f /im postgres.exe
rmdir /s /q C:\Users\<user>\.paperclip
pnpm dev
```

### 7. PowerShell memblokir npm (`running scripts is disabled`)

Pakai **cmd** (bukan PowerShell), atau perbaiki sekali dengan:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### 8. `pnpm dev` diam/menggantung tanpa output setelah deprecation warning

Dulu disebabkan script migrasi one-shot yang tidak pernah exit di Windows (event loop tertahan handle embedded-postgres). Sudah diperbaiki di repo ini (`packages/db/src/migrate.ts` dan `migration-status.ts`): script kini exit eksplisit dan sengaja membiarkan postgres tetap hidup agar diadopsi server (log: *"Embedded PostgreSQL already running; reusing existing process"*). Pastikan sudah `git pull` versi terbaru.

Debug manual jalur yang sama secara terlihat:

```cmd
pnpm --filter @paperclipai/db exec tsx src/migration-status.ts --json
pnpm db:migrate
```

### 9. Agent run gagal cepat (±7 detik) / "Recovery needed"

Agent butuh CLI runtime di mesin yang sama. Untuk adapter `Claude Code (local)`:

```cmd
npm install -g @anthropic-ai/claude-code
claude
```

Di dalam REPL ketik `/login` (tanpa prefix `claude`) dan pilih akun **claude.ai subscription** — atau isi kredit API di https://platform.claude.com/settings/billing bila muncul *"Credit balance too low"*. Lalu di UI: halaman agent → panel **Adapter** → tombol **Test** → harus **Passed** (field working directory/cwd sudah deprecated, tidak perlu diisi — workspace dikelola otomatis).

### 10. Menjalankan sebagai root (Linux/container)

Embedded postgres tidak bisa init di path yang tak bisa diakses user `postgres` (mis. `/root`). Solusi: set `PAPERCLIP_HOME` ke lokasi yang bisa diakses (mis. `/home/user/.paperclip-home`, parent 755) sebelum `pnpm dev`.

## Akses Online (dari HP / perangkat lain)

Cara paling aman dan mudah: **Tailscale** (VPN pribadi, gratis untuk personal):

1. Install Tailscale di PC server dan HP, login akun yang sama
2. Jalankan `pnpm dev --bind tailnet` (mode `authenticated/private` — first run akan minta buat akun & klaim admin)
3. Cek alamat: `tailscale ip -4`
4. Buka `http://<ip-tailscale>:3100` dari perangkat lain

Detail: `docs/deploy/tailscale-private-access.md`. PC harus tetap menyala (nonaktifkan sleep) agar agents jalan 24/7.

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
