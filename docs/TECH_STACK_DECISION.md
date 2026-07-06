# Tech Stack Decision

## Recommended Stack
Astro.js + Supabase + Baileys (Node.js) + Coolify

## Decision Status
**Confirmed**

## Rationale
Proyek ini menuntut antarmuka publik yang super cepat tanpa *login* dan *dashboard* admin yang aman.
- **Astro.js** sanggup me-render UI statis & interaktif (Island architecture) dengan sangat ringan.
- **Supabase** memudahkan pembuatan database relasional PostgreSQL sekaligus menangani Auth tim IT via RLS.
- **Coolify** memfasilitasi kebutuhan **Baileys** yang harus terus menyala (tidak bisa di Vercel).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Next.js | Ekosistem sangat besar, fitur *App Router*. | Terlalu *overkill* untuk form publik sederhana, butuh node server. | Rejected |
| Vercel | *Zero-config deployment*. | Eksekusi Baileys akan mati karena *serverless limit*. | Rejected |
| API WA Berbayar (Wablas/Fonnte) | Gampang, tinggal panggil REST API via serverless. | Butuh biaya bulanan tambahan. | Rejected (Pilih Baileys mandiri) |

## Application Stack
- Framework: Astro.js
- Styling: Tailwind CSS
- UI Components: Alpine.js (opsional) atau React (jika butuh interaksi *state* kompleks).

## Database / Backend Stack
- Platform: Supabase (BaaS)
- DB: PostgreSQL
- ORM: Supabase JS Client (`@supabase/supabase-js`)

## Auth Strategy
- Supabase Auth (Khusus IT Admin). Publik anonim.

## File Storage Strategy
- Supabase Storage (Untuk foto/bukti error).

## Deployment Target
- Coolify (VPS)

## Package Manager
- `npm`

## Testing Strategy
- Manual / UAT (User Acceptance Testing) dengan *Quality Gates*.

## Open Questions
- -
