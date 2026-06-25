# CRM ↔ Maliyyə inteqrasiyası — Spec (PRD-grounded)

> **Status:** PROPOSAL — təsdiq gözləyir. Kod yazılmayıb.
> **Müəllif metodu:** kəşfiyyat → spec → PRD uyğunlaşması → user story → expert Q&A → arxitektura.
> **Tarix:** 2026-06-25. **Sahib:** talifa.isgandarli@gmail.com.
> **Qayda:** PRD (`docs/PRD.md`) kanonikdir. Bu spec mövcud Maliyyə primitivlərini (PRD Module 7)
> CRM səthinə (Module 6) bağlayır — yeni "pul modeli" icad etmir.

---

## 1. Problem statement

Müştərilər səhifəsi natamamdır: istifadəçi bir müştərinin/layihənin **ödənişini qeyd edə bilmir** və
**"nə qədər ödənilib / nə qədər qalıb"** doğru görünmür. Səbəb — iki ayrı, bağlanmamış pul anlayışı:

| Anlayış | Cədvəl | Məna | Nə vaxt |
|---|---|---|---|
| **Gözlənilən dəyər** | `clients.expected_value` | CRM proqnozu (ehtimallı təxmin) | Lead → Müzakirə (sövdələşmədən əvvəl) |
| **Müqavilə / qaimə** | `receivables` (`amount`, `paid_amount`, `status`) | Razılaşılmış borc + ödəniş gedişi | İcrada → Portfolio (sövdələşmədən sonra) |
| **Ödəniş** | `receivable_payments` (+trigger) | Qaiməyə qarşı hər bir ödəniş | iş gedişində |
| **Gəlir (cashflow)** | `incomes` | Kassaya daxil olan pul (ayrı ledger) | istənilən vaxt |

**Boşluq:** Faza 2-də "ödənilib" üçün `Σ incomes` istifadə etdim — bu səhvdir (incomes müqaviləyə bağlı olmaya bilər).
Düzgün mənbə **receivables**-dir, amma o yalnız Maliyyə → Debitor tabında görünür, Müştərilər səhifəsinə bağlı deyil.
İstifadəçi bilmir ki, müqaviləni harada yaradır, ödənişi harada qeyd edir.

---

## 2. PRD uyğunlaşması (sitatlar)

- **REQ-FIN-01** (`docs/PRD.md`): *"+ Gəlir" modal: amount, project, client, payment_method, date, invoice_number, note. On save → `incomes` row + activity_log + receivable status sync.*
- **REQ-FIN-02:** receivable overpayment validation: `paid_amount` ≤ `amount` (DB CHECK + form).
- **REQ-FIN-03:** `markPaid` partial payments: `paid_amount += delta`, status yalnız tam ödənişdə `paid`.
- **REQ-CRM-05:** müştəri detal paneli bölmələri: overview · **interactions · proposals · projects · documents**.
- **RLS:** `incomes` / `receivables` / `receivable_payments` = **admin-only** (0002, 0040). Müştərilər route artıq admin-only.

**Nəticə:** bütün lazımi cədvəllər və triggerlər **artıq var** (PRD Module 7). Bu spec **yeni sxem icad etmir** —
mövcud `receivables` + `receivable_payments` + `MarkPaidModal` primitivlərini CRM modalına bağlayır.
Yeni bir `REQ-CRM-14` əlavə olunur (aşağıda) — Müştəri detalında Maliyyə görünüşü.

---

## 3. Arxitektura qərarı (Engineer lead)

**Tək həqiqət mənbəyi = `receivables`.** "Müqavilə dəyəri / ödənilib / qalıq" HƏR YERDƏ receivables-dən gəlir:
- Müqavilə dəyəri (cəmi) = `Σ receivables.amount` (müştəri üzrə)
- Ödənilib = `Σ receivables.paid_amount`
- Qalıq = cəmi − ödənilib

`clients.expected_value` **yalnız** sövdələşmədən əvvəlki proqnoz olaraq qalır (Lead/Təklif/Müzakirə).
Sövdələşmə bağlananda (İcrada) → proqnoz **qaiməyə çevrilir** (receivable yaranır).

**İki ledger ayrı qalır (mövcud davranış):** `receivable_payments` müqaviləni ödəyir; `incomes` kassanı qeyd edir.
Bunlar avtomatik bir-birini yaratmır (bu, mövcud Maliyyə davranışıdır — §7 açıq qərar).

**Sxem dəyişikliyi YOXDUR.** Yalnız: yeni hook-lar (oxu), client modalına "Maliyyə" tabı, kartın paid/remaining-i receivables-ə keçirmək.

---

## 4. User stories (Given / When / Then)

**US-1 — Müqaviləni qeyd et (proqnozdan qaiməyə)**
> Sövdələşmə bağlananda razılaşılan məbləği müqavilə kimi qeyd etmək istəyirəm ki, ödənişi izləyə bilim.
- **Given** müştəri İcrada mərhələsindədir və qaiməsi yoxdur,
- **When** client modalında "Maliyyə" tabında "+ Müqavilə (qaimə)" basıb məbləğ (default = expected_value), müddət, layihə (ops.) daxil edirəm,
- **Then** `receivables` sətri yaranır (`client_id`, `amount`, `due_at`), status `open` olur, kartda "Müqavilə dəyəri" və "Qalıq" görünür.

**US-2 — Ödənişi qeyd et**
> Müştəri ödəniş edəndə onu qeyd etmək istəyirəm ki, ödənilib/qalıq yenilənsin.
- **Given** müştərinin açıq/qismən qaiməsi var,
- **When** "Maliyyə" tabında həmin qaimədə "+ Ödəniş" basıb məbləğ + üsul daxil edirəm (mövcud `MarkPaidModal`),
- **Then** `receivable_payments` sətri yaranır, trigger `paid_amount` və status-u yeniləyir, kart və tab dərhal yenilənir.

**US-3 — Paid/remaining doğru görünməsi**
- **Given** müştərinin qaimələri var,
- **When** Müştəri bazası kartına və ya modala baxıram,
- **Then** "Ödənilib ₼X / ₼Y" və "Qalıq ₼Z" **receivables-dən** gəlir (incomes cəmindən yox); İcrada/Portfolio-da görünür.

**US-4 — Müştəri detalında maliyyə şəffaflığı**
- **Given** müştəri modalını açıram,
- **When** "Maliyyə" tabına keçirəm,
- **Then** müştərinin bütün qaimələrini (məbləğ/ödənilib/qalıq/status/müddət), ödəniş tarixçəsini və "+ Müqavilə"/"+ Ödəniş" düymələrini görürəm.

**US-5 — Tək həqiqət, iki giriş nöqtəsi**
- **Given** ödənişi həm Maliyyə → Debitor, həm də Müştəri modalından qeyd etmək olar,
- **Then** hər ikisi **eyni** `receivables`/`receivable_payments` cədvəllərinə yazır — dublikat yoxdur, rəqəmlər həmişə uyğun.

---

## 5. Dizayn (Designer lead)

**Müştəri modalına yeni "Maliyyə" tabı** (REQ-CRM-05 bölmələrinə uyğun, admin-only):
```
[ Layihələr | Maliyyə | Əlaqə | Tarixçə ]

Maliyyə tabı:
  Xülasə:  Müqavilə ₼22,000 · Ödənilib ₼12,000 · Qalıq ₼10,000   [▓▓▓▓▓░░ 55%]
  ───────────────────────────────────────────────
  Qaimələr:
    • İdarə binası · ₼22,000 · ödənilib ₼12,000 · qalıq ₼10,000 · [open]  [+ Ödəniş]
       └ ödəniş tarixçəsi (tarix · üsul · məbləğ)
  [+ Müqavilə (qaimə)]
```
- **Kart** (Müştəri bazası): İcrada/Portfolio-da "Ödənilib ₼X / ₼Y" + bar + "Qalıq" — **receivables-dən**.
- **States:** boş (qaimə yoxdur → "Müqavilə əlavə et" dəvəti), qismən (sarı qalıq), tam (yaşıl "Tam ödənilib ✓"), gecikmiş (`due_at` keçib → qırmızı "Gecikmiş").
- **Əlçatanlıq:** rəng tək deyil — status həm mətn, həm rəng. Düymələr ≥ aydın hədəf.
- **Naviqasiya:** modaldan Maliyyə → Debitor tabına "tam bax" keçidi (firm-wide görünüş).

---

## 6. Texniki plan (sxem dəyişikliyi yox)

**Yeni hook-lar (`src/lib/hooks.ts`, hamısı admin-gated, oxu):**
- `useReceivablesByClient()` → `Map<client_id, Receivable[]>` (bir sorğu, qruplaşdır). Kart + tab paid/remaining bunun üzərindən.
- `useReceivablePayments(receivableId)` → ödəniş tarixçəsi (lazım olsa; MarkPaidModal artıq inline edir).
- Mutasiyalar: `useCreateReceivable()` (insert), ödəniş = mövcud `MarkPaidModal` axını.

**Komponentlər:**
- `ClientModal` → yeni `FinanceTab` (qaimə siyahısı + xülasə + `MarkPaidModal` yenidən istifadə + `CreateReceivableModal`).
- `ClientBase` kartı + `ClientModal` xülasəsi → paid/remaining-i `useIncomeByClient`-dən **receivables**-ə keçir.
- `useIncomeByClient` saxlanılır, amma "ödənilib" üçün yox — yalnız "cashflow" göstərmək istəsək.

**Silinir/dəyişir:** Faza 2-nin `incomes vs expected_value` məntiqi receivables ilə əvəz olunur.

**Performans:** hər biri tək qruplaşdırılan sorğu — N+1 yox. Hamısı admin route-da.

---

## 7. Açıq qərarlar (təsdiqin lazımdır)

1. **Müqavilə (qaimə) səviyyəsi:** müştəri üzrə bir, yoxsa layihə üzrə? (receivable hər ikisinə bağlana bilər.)
   → **Tövsiyə:** müştəri üzrə başla, `project_id`-i opsional bağla (layihə üzrə sonra dərinləşir).
2. **Proqnoz→qaimə körpüsü:** müştəri İcrada-ya keçəndə qaimə **avtomatik** yaransın, yoxsa **bir klik "+ Müqavilə"** (default məbləğ = expected_value)?
   → **Tövsiyə:** bir klik (səssiz avtomatik yox — gözlənilməz data yaratmasın).
3. **Ödəniş = gəlir?** Qaimə ödənişi həm də kassaya (`incomes`) yazılsın? Hazırda Maliyyə bunları **ayrı** saxlayır.
   → **Tövsiyə:** MVP-də ayrı saxla (mövcud davranış), amma ödəniş modalında "kassaya da əlavə et" qutusu təklif edim. (Bu, mövcud iki-ledger redundansını gələcəkdə birləşdirməyə yol açır.)

---

## 8. Out of scope (bu mərhələdə yox)
- Maliyyə-nin iki-ledger redundansını (incomes.receivable_id 0030 vs receivable_payments 0040) tam birləşdirmək.
- Layihə səviyyəli P&L-i CRM-ə gətirmək (ProjectPnL ayrı qalır).
- Qaimə üçün avtomatik faktura/PDF.
- Qismən ödənişdə avtomatik xatırlatma (gecikmiş bildirişləri Maliyyədə qalır).

## 9. Uğur metrikləri
- Admin **Müştərilər səhifəsindən çıxmadan** müqavilə yarada və ödəniş qeyd edə bilir (klik sayı ≤ 3).
- Kartdakı "Qalıq" 100% receivables ilə uyğundur (incomes ilə fərq = 0).
- "Ödənişi harada qeyd edirəm?" sualı yox olur — modal Maliyyə tabı tək aydın yer.

## 10. Risklər
- RLS: admin-only — non-admin route-a düşməməlidir (artıq RequireAdmin). ✓
- İki giriş nöqtəsi (Maliyyə + modal) eyni cədvələ yazır — invalidation düzgün olmalı (query key paylaşımı).
- expected_value vs receivable.amount fərqi istifadəçiyə aydın olmalıdır (kopyada izah).
