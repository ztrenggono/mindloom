import type { VaultFile, VaultState } from './types'

const now = Date.now()

const ERD_PESANAN = `title ERD Sistem Pesanan Toko (3NF)

pelanggan [icon: user, color: blue] {
  id_pelanggan int pk
  nama varchar
  kota varchar
}

produk [icon: package, color: green] {
  id_produk int pk
  nama_produk varchar
  harga int
}

pesanan [icon: shopping-cart, color: orange] {
  id_pesanan int pk
  id_pelanggan int fk
  tanggal date
}

detail_pesanan [icon: list, color: orange] {
  id_pesanan int pk fk
  id_produk int pk fk
  jumlah int
}

pesanan.id_pelanggan > pelanggan.id_pelanggan
detail_pesanan.id_pesanan > pesanan.id_pesanan
detail_pesanan.id_produk > produk.id_produk`

const FLOW_TRIAGE = `direction right

Issue type? [shape: oval, icon: file-text]

BugPath [color: red] {
  Bug [icon: bug, color: red]
  Duplicate? [shape: diamond, icon: copy]
  Mark duplicate [shape: oval, icon: copy]
  Has repro? [shape: diamond, icon: repeat]
  Ask for repro [shape: oval, icon: repeat]
}

FeaturePath [color: green] {
  Feature [icon: zap, color: green]
  Well specced? [shape: diamond, icon: check-square]
  Can be package? [shape: diamond, icon: package]
  Define as package [shape: oval, icon: package]
}

Issue ready to claim [shape: oval, icon: send]

Issue type? > Bug
Bug > Duplicate?
Duplicate? > Mark duplicate: Yes
Duplicate? > Has repro?: No
Has repro? > Issue ready to claim: Yes
Has repro? > Ask for repro: No
Issue type? > Feature
Feature > Can be package?
Can be package? > Well specced?: No
Can be package? > Define as package: Yes
Well specced? > Issue ready to claim: Yes`

const SEQ_REQUEST = `autoNumber on

Client [icon: monitor, color: gray]
Server [icon: server, color: blue]
Service [icon: tool, color: green]

Client > Server: Data request
activate Server
Server <> Service: Service request

loop [label: until success, color: green] {
  Service > Service: Check availability
}

Server - Service: Data processing
Server --> Client: Data response
deactivate Server`

const ERD_WORKSPACE = `users [icon: user, color: blue] {
  id string pk
  teams string
  displayName string
  team_role string
}

teams [icon: users, color: blue] {
  id string pk
  name string
}

workspaces [icon: home] {
  id string
  createdAt timestamp
  folderId string
  teamId string
}

folders [icon: folder] {
  id string
  name string
}

chat [icon: message-circle, color: green] {
  duration number
  startedAt timestamp
  endedAt timestamp
  workspaceId string
}

invite [icon: mail, color: green] {
  inviteId string
  type string
  workspaceId string
  inviterId string
}

users.teams <> teams.id
workspaces.folderId > folders.id
workspaces.teamId > teams.id
chat.workspaceId > workspaces.id
invite.workspaceId > workspaces.id
invite.inviterId > users.id`

const NORMALISASI_DOC = `# Normalisasi Data

Normalisasi adalah proses menata tabel database supaya setiap fakta disimpan **satu kali saja**, lalu dihubungkan lewat referensi (foreign key). Tujuannya mencegah duplikasi dan data yang saling bertentangan. Diagram ERD di file ini menunjukkan hasil akhirnya (3NF). Lihat juga [[Relationship Diagram]] dan [[Welcome]].

#database #konsep

## Masalah yang diselesaikan (anomali)
- **Update:** kota Budi tertulis di banyak baris. Jika satu baris terlewat saat diubah, data jadi tidak konsisten.
- **Insert:** produk baru tidak bisa disimpan sebelum ada pesanan yang memakainya.
- **Delete:** menghapus pesanan terakhir seorang pelanggan ikut menghapus data pelanggan itu.

## Ide dasar
Sebelum: kota Budi tertulis 3 kali.

| pesanan | pelanggan | kota |
| ----- | ----- | ----- |
| 1 | Budi | Jakarta |
| 2 | Budi | Jakarta |
| 3 | Budi | Jakarta |

Sesudah: kota Budi tertulis sekali di tabel \`pelanggan\`, dan \`pesanan\` hanya menunjuk ke dia.

## Tiga tingkat normal form
| Tingkat | Aturan | Gejala pelanggaran |
| ----- | ----- | ----- |
| 1NF | Satu sel berisi satu nilai | Nilai dipisah koma, misalnya "Pensil, Buku" |
| 2NF | Sudah 1NF, dan kolom bergantung pada **seluruh** primary key | Kolom hanya bergantung pada sebagian kunci gabungan |
| 3NF | Sudah 2NF, dan kolom non-kunci tidak bergantung pada kolom non-kunci lain | \`id_pesanan → id_pelanggan → kota\` (dependensi transitif) |

### 1NF
Satu sel berisi satu nilai. \`Pensil, Buku\` dipecah jadi satu baris per produk.

### 2NF
Kunci gabungan \`(id_pesanan, produk)\`. Kolom \`harga_produk\` hanya bergantung pada \`produk\`, jadi pindahkan harga ke tabel \`produk\`.

### 3NF
Kolom \`nama_pelanggan\` dan \`kota\` ditentukan oleh \`id_pelanggan\`, bukan oleh \`id_pesanan\`. Pindahkan ke tabel \`pelanggan\`.

## Hasil akhir (lihat ERD)
\`\`\`erd
${ERD_PESANAN}
\`\`\`

## Cara membaca relasi di ERD
- **Pelanggan ke pesanan: one-to-many.** Foreign key \`id_pelanggan\` ada di sisi "banyak" (\`pesanan\`).
- **Pesanan ke produk: many-to-many.** Dipecah oleh \`detail_pesanan\`, yang memegang dua foreign key.
- **Primary key gabungan:** \`detail_pesanan\` memakai \`(id_pesanan, id_produk)\`.

## Untung dan rugi
- **Untung:** data konsisten, penyimpanan lebih hemat, perubahan cukup di satu tempat.
- **Rugi:** kueri butuh lebih banyak \`JOIN\`.
- **Denormalisasi:** data warehouse sering sengaja melanggar normal form demi kecepatan baca.

> [!note] Catatan
> Istilah "normalisasi" juga dipakai di machine learning (min-max scaling, z-score). Itu topik berbeda.
`

const WELCOME_DOC = `# Welcome

Mindloom menggabungkan **dokumen + diagram-as-code + whiteboard** (gaya Eraser) dengan **vault catatan yang saling terhubung** (gaya Obsidian).

#panduan

## Mulai
- Buka [[Normalisasi Data]] untuk contoh dokumen + 3 diagram.
- [[Relationship Diagram]] diimpor dari file \`relationship-diagram.eraser\` Anda.
- Sintaks lengkap ada di [[Diagram Syntax]].
- Tulis \`[[Judul]]\` untuk menautkan catatan. Catatan yang belum ada akan dibuat saat diklik, misalnya [[Ide Baru]].

## Pintasan
| Tombol | Aksi |
| --- | --- |
| Ctrl/⌘ + P | Command palette |
| Ctrl/⌘ + O | Quick switcher |
| Ctrl/⌘ + E | Ganti mode edit / baca |
| Ctrl/⌘ + G | Graph view |
| Ctrl/⌘ + N | Catatan baru |
| Ctrl/⌘ + 1 / 2 / 3 | Layout Document / Both / Canvas |

> [!tip] Diagram di dalam dokumen
> Blok kode \`\`\`erd, \`\`\`flowchart, \`\`\`sequence atau \`\`\`cloud langsung dirender sebagai diagram di mode baca.
`

const SYNTAX_DOC = `# Diagram Syntax

Referensi singkat bahasa diagram. Kembali ke [[Welcome]].

## Flowchart / Cloud
\`\`\`flowchart
direction right
Start [shape: oval, icon: play, color: green]
Check [shape: diamond, icon: help-circle]
Group [color: blue] {
  Work [icon: hammer]
}
Done [shape: oval, icon: check]
Start > Check
Check > Work: no
Check > Done: yes
Work --> Check
\`\`\`

- Node: \`Nama [shape: oval|diamond|rectangle|cylinder|circle, icon: nama-lucide, color: blue]\`
- Grup: \`Nama [color: ...] { ... }\`
- Edge: \`A > B\`, \`A < B\`, \`A <> B\`, \`A - B\`, \`A --> B\` (putus-putus), label setelah \`:\`

## ERD
- Entitas: \`nama [icon, color] { kolom tipe pk fk }\`
- Relasi: \`a.kolom > b.kolom\` (many-to-one), \`<\` (one-to-many), \`-\` (one-to-one), \`<>\` (many-to-many)

## Sequence
\`\`\`sequence
autoNumber on
User [icon: user, color: blue]
API [icon: server, color: green]
User > API: login
activate API
alt [label: valid] {
  API --> User: token
}
else [label: invalid] {
  API --> User: 401
}
deactivate API
\`\`\`
`

function file(id: string, title: string, folder: string, doc: string, extra: Partial<VaultFile> = {}): VaultFile {
  return {
    id,
    title,
    folder,
    doc,
    diagrams: [],
    whiteboard: null,
    layout: 'doc',
    createdAt: now,
    updatedAt: now,
    ...extra,
  }
}

export function seedState(): VaultState {
  const files: VaultFile[] = [
    file('welcome', 'Welcome', '', WELCOME_DOC, { pinned: true }),
    file('normalisasi', 'Normalisasi Data', 'Database', NORMALISASI_DOC, {
      layout: 'both',
      diagrams: [
        { id: 'd-erd', title: 'ERD Pesanan', type: 'erd', code: ERD_PESANAN },
        { id: 'd-flow', title: 'Issue Triage', type: 'flowchart', code: FLOW_TRIAGE },
        { id: 'd-seq', title: 'Request Flow', type: 'sequence', code: SEQ_REQUEST },
      ],
    }),
    file(
      'relationship',
      'Relationship Diagram',
      'Database',
      '# Relationship Diagram\n\nSkema workspace/teams. Diimpor dari `relationship-diagram.eraser`. Terkait dengan [[Normalisasi Data]].\n\n#database\n',
      {
        layout: 'canvas',
        diagrams: [{ id: 'd-rel', title: 'Workspace ERD', type: 'erd', code: ERD_WORKSPACE }],
      },
    ),
    file('syntax', 'Diagram Syntax', 'Reference', SYNTAX_DOC),
  ]
  return {
    files: Object.fromEntries(files.map((f) => [f.id, f])),
    folders: ['Database', 'Reference'],
    openTabs: ['welcome', 'normalisasi'],
    activeTab: 'normalisasi',
    theme: 'dark',
  }
}
