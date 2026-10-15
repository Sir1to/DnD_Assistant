# SRD 5.2.1 bestiary data

`dnd5e-srd-5.2.1-bestiary.json` is generated data. Do not edit individual stat blocks by
hand; regenerate it with:

```powershell
node scripts/import-srd-bestiary.mjs <path-to-monsters.json>
```

The source file used on 4 October 2026 was
[`data/monsters.json`](https://github.com/adkinn/srd-5.2.1/blob/main/data/monsters.json),
SHA-256 `8E01C3B1257F42B36913C26DC3E70022A15573BF032202DE92EEDB55EAF7EA8A`.
The import script renames fields to the Fog of Lore camel-case schema, fills absent optional
collections with empty values, and sorts entries by English name. It does not translate or
rewrite rules text.

The data includes material from the **D&D System Reference Document 5.2.1**, © Wizards of
the Coast LLC, available at <https://www.dndbeyond.com/srd>. The SRD 5.2.1 is licensed under
the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/legalcode).
The structured source was republished by [Open5e](https://open5e.com/) and distributed by
the [`adkinn/srd-5.2.1`](https://github.com/adkinn/srd-5.2.1) project under the same license.
