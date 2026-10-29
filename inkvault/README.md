# Inkvault

Dokumen + diagram-as-code + whiteboard (terinspirasi Eraser) di dalam vault catatan yang saling terhubung (terinspirasi Obsidian). Data disimpan di browser (IndexedDB) lalu di-sync ke backend PostgreSQL di `../backend`. Cara menjalankan semuanya sekaligus dengan Docker ada di [README utama](../README.md).

## Menjalankan

```bash
npm install
npm run dev
```

## Fitur

| Dari Eraser | Dari Obsidian |
| --- | --- |
| Layout per file: Document / Both / Canvas | Vault dengan folder, drag-and-drop, rename, hapus |
| Diagram-as-code: ERD, flowchart, sequence, cloud architecture (sintaks kompatibel Eraser) | `[[wikilink]]` dengan autocomplete, catatan baru dibuat saat link diklik |
| Banyak diagram per file + editor kode dengan nomor baris | Backlinks, unlinked mentions, outgoing links |
| Whiteboard freeform (Excalidraw) | Graph view global + local graph |
| Export diagram ke SVG / PNG | Tag `#tag`, callout `> [!note]`, `==highlight==`, task list |
| Diagram tersemat di dokumen (blok ```` ```erd ```` dsb.) | Mode edit / baca (Ctrl+E), tab, outline |
| Import file `.eraser` | Command palette (Ctrl+P), quick switcher (Ctrl+O), tema gelap / terang |

Rename catatan otomatis memperbarui semua `[[link]]` yang menunjuk ke catatan itu. Backup / restore seluruh vault lewat tombol export / import (JSON).
