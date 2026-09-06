# ADA — Araştırma & Düşünce Atölyesi

Yerel çalışan (local-first), bağımlılıksız bir **kişisel bilgi yönetimi (PKM)** uygulaması.
Amaç bir not defteri değil, **düşünme aracı**: bilgiyi toplamak, bağlamak, işlemek ve
geri çağırmak için gereken dört halkanın tamamını kapsar.

Tek bir `index.html` açmak yeterli. Kurulum, hesap, sunucu, internet bağlantısı gerekmez.
Veriler yalnızca senin tarayıcında durur.

```
index.html                 uygulama kabuğu
assets/css/app.css         tema (açık/koyu) ve tüm arayüz
assets/js/store.js         veri modeli · localStorage · IndexedDB · araştırma günlüğü
assets/js/markdown.js      alıntı/yorum blokları · [[bağlantı]] · #etiket · dışa aktarım biçimleri
assets/js/search.js        bulanık arama (Türkçe aksan duyarsız) + alan filtreleri
assets/js/graph.js         kuvvet yönelimli düğüm ağı (canvas, bağımlılıksız)
assets/js/seed.js          örnek veri kümesi
assets/js/app.js           görünümler, editör, kısayollar, dışa aktarım akışları
tools/build-single.mjs     her şeyi tek dosyaya gömen derleyici
dist/ada.html              tek dosyalık sürüm (çift tıkla aç, taşınabilir)
```

---

## Nasıl çalıştırılır

**Seçenek 1 — tek dosya.** `dist/ada.html` dosyasını tarayıcıda aç. Hepsi bu.

**Seçenek 2 — kaynaktan.** Depoyu klonla, `index.html`i aç. Yerel bir sunucu istersen:

```bash
npx http-server -p 8080 .      # sonra http://localhost:8080
```

**Tek dosyayı yeniden üretmek için:**

```bash
node tools/build-single.mjs              # → dist/ada.html
node tools/build-single.mjs --artifact   # → dist/ada.artifact.html (gömülü yayın için)
```

---

## Modüller ve karşıladıkları ihtiyaç

### 1. Veri toplama ve giriş (Capture)

| Özellik | Nerede |
| --- | --- |
| **Hızlı Not** — akışı bozmadan tek kısayolla yakalama | `Ctrl/⌘ + Shift + K` ya da üst çubuktaki **＋ Hızlı Not**. İlk satır başlık olur, `#etiket` ve `[[bağlantı]]` doğrudan yazılabilir, kayıt **Gelen kutusu**na düşer. |
| **Format ve medya esnekliği** | Metin, URL, PDF, görsel ve şema yüklemesi. Ekler IndexedDB'de blob olarak saklanır; görseller not içinde gömülü görünür, PDF'ler kartla açılır. |
| **Kaynak künyesi (metadata)** | Her türün kendi yapılandırılmış alanları var: makale → yazar / dergi / yayın tarihi / DOI / sayfa / URL; kitap → yazar / yayınevi / basım / ISBN / bölüm; ders notu, deney, web kaynağı, proje için ayrı şemalar. Künye paneli kaynak türlerinde kendiliğinden açılır. |

Türler: **Kavram · Fikir · Makale · Kitap · Ders notu · Deney/Gözlem · Web kaynağı · Proje**
Durumlar: **Gelen kutusu · İncelenecek · Okunuyor · İşlendi · Tamamlandı · Arşiv**

### 2. Bilgi mimarisi ve bağlantı kurma

- **Çift yönlü bağlantı.** `[[Kavram Adı]]` yazdığında hedef notun sağ panelinde
  *“Bu nota atıf yapanlar”* listesi otomatik oluşur — üstelik bağlantının geçtiği
  cümleyle birlikte. Olmayan bir kavrama bağlanırsan bağlantı kesik çizgili görünür;
  tıklayınca not oluşturulur. Bir notu yeniden adlandırırsan, ona atıf yapan notlardaki
  bağlantıları güncellemeyi önerir.
- **Atomik not yapısı.** Tek kavrama odaklı küçük notlar için profil şablonları,
  “kelime · ❝alıntı · ✎yorum · bağlantı” sayacı ve *Ağ* görünümündeki bağlantısızlık
  uyarısı bu disiplini destekler.
- **Esnek etiketleme ve hiyerarşi.** `#felsefe/etik` gibi eğik çizgiyle iç içe etiketler
  yan panelde ağaç olarak görünür; üst etikete tıklamak alt dalları da kapsar. Etiketler
  hem künyeye (kaldırılabilir rozetler) hem de metnin içine (`#incelenecek`) yazılabilir;
  ikisi tek kümede birleşir.

### 3. Analiz ve çalışma araçları

- **Çift panelli arayüz.** İki katman:
  1. *Editör içi ikili görünüm* — solda kaynak metni yazarsın, sağda anında biçimlenmiş
     hali (`Ctrl/⌘ + E` ile Yazım → İkili → Okuma).
  2. *Çalışma Masası* — solda **okuduğun kaynağı**, sağda **kendi sentezini** yan yana
     açarsın. Soldan metin seçip **❝ Alıntıyı aktar** dersen, alıntı sağdaki nota
     kaynak künyesiyle (yazar, eser, sayfa, DOI) birlikte düşer ve altına boş bir
     yorum bloğu açılır.
- **Araştırma günlüğü / zaman çizelgesi.** Not oluşturma, durum değişimi, üzerinde
  çalışma ve hızlı yakalama kayıtları güne göre gruplanmış kronolojik akışta: hangi gün
  hangi kaynağı taradığını geriye dönük okuyabilirsin. Süre ölçen bir sayaç ya da seans
  kavramı **yok** — günlük kendiliğinden birikir, sen bir şey başlatmak zorunda kalmazsın.
  Üstte özet: not sayısı, bu hafta eklenen, bağlantı sayısı, bağlantısız not, etiket,
  künyeli kaynak.
- **Alıntı – yorum ayrımı.** Editörde iki ayrı blok tipi:

  ```
  > Kaynaktan aldığın ham cümle (s. 81)     →  ALINTI bloğu (serif, altın şerit)
  :: Senin kendi cümlelerinle analizin       →  YORUM bloğu (sans, mavi şerit)
  ```

  Ayrım yalnızca ekranda değil; Markdown, HTML ve PDF çıktısında da korunur.
  Altı ay sonra kimin cümlesi olduğunu tartışmazsın.

### 4. Arama, filtreleme ve görselleştirme

- **Düğüm ağı (Graph View).** Canvas üzerinde kuvvet yönelimli yerleşim; düğüm rengi
  tür, boyutu bağlantı sayısı. **Bağlantısız notlar kesik çizgiyle işaretlenir** —
  izole fikirleri bulmanın en hızlı yolu. Etiketleri de düğüm olarak gösterebilir,
  yalnız bağlantısızları süzebilir, düğümleri sürükleyip yakınlaştırabilirsin.
  Düğüme tıklamak notu açar.
- **Gelişmiş arama.** Başlık, etiket, künye ve metin içinde bulanık (fuzzy) arama.
  Türkçe aksan ve İ/ı farkları yok sayılır (`bilissel` → `bilişsel`). Sorgu dili:

  ```
  bellek kapasite          serbest metin (hepsi geçmeli)
  #felsefe/etik            etiket (alt dalları da kapsar)
  tur:makale               tür
  durum:incelenecek        durum
  yazar:miller             künye alanı
  kaynak:nature            künye alanı
  sonra:2024  once:2025    tarih aralığı
  ```

  `Ctrl/⌘ + K` komut paleti aynı motoru kullanır: not arar, komut çalıştırır ve
  eşleşme yoksa o başlıkla yeni not açmayı önerir.

### 5. Teknik yapı ve veri güvenliği

- **Local-first.** Notlar `localStorage`da JSON olarak, ekli dosyalar IndexedDB'de
  blob olarak. Ağ isteği yok, telemetri yok, hesap yok. Depolama yazılamazsa
  uyarı verir (yedek al der), sessizce veri kaybetmez.
- **Dışa aktarım.** JSON (tam yedek, geri yüklenebilir), Markdown (YAML künyeli,
  Obsidian/Logseq uyumlu), HTML (kendi stilini taşıyan tek dosya), PDF (yazdır).
  Tek not ya da tüm defter. Dışa aktarım penceresi metni ekranda da gösterir; indirme
  engelli bir ortamdaysan panoya kopyalayabilirsin.
- **İçe aktarım.** JSON yedeğini birleştirerek ya da üzerine yazarak geri yükler.

---

## Söz dizimi

| Yazdığın | Anlamı |
| --- | --- |
| `> metin` | **Alıntı** bloğu — kaynaktan ham bilgi |
| `:: metin` | **Yorum** bloğu — senin sentezin |
| `[[Kavram]]` | çift yönlü not bağlantısı (yoksa tıkla oluştur) |
| `[[Kavram\|görünen ad]]` | takma adlı bağlantı |
| `#felsefe/etik` | hiyerarşik etiket |
| `**kalın** *italik* ==vurgu== ~~üstü çizili~~` | metin biçimleri |
| `# Başlık`, `- madde`, `1. madde`, `` `kod` ``, ` ``` ` | standart Markdown |
| `![[dosya:ID\|ad]]` | ek dosya (📎 düğmesiyle kendiliğinden eklenir) |

## Kısayollar

| İşlem | Tuş |
| --- | --- |
| Komut paleti / arama | `Ctrl/⌘ + K` |
| Hızlı not | `Ctrl/⌘ + Shift + K` |
| Yeni not | `Ctrl/⌘ + N` |
| Yazım → İkili → Okuma | `Ctrl/⌘ + E` |
| Alıntı bloğu | `Ctrl/⌘ + Shift + A` |
| Yorum bloğu | `Ctrl/⌘ + Shift + Y` |
| Not bağlantısı `[[ ]]` | `Ctrl/⌘ + L` |
| Kalın / italik | `Ctrl/⌘ + B` · `I` |
| Aramaya odaklan | `/` |
| Kapat | `Esc` |

---

## Araştırma profilleri

Uygulama üç odak alanının hepsini destekler; **profil** seçimi yalnızca varsayılan türü,
yeni not şablonunu ve önerilen etiketleri değiştirir (menü → *Profil*):

| Profil | Varsayılan tür | Şablon |
| --- | --- | --- |
| **Akademik / bilimsel makale** (öntanımlı) | Makale | Alıntı → Yorum → Yöntem → Bulgular → İtirazlar |
| **Kitap & metin analizi** | Kitap | Alıntı (s. …) → Yorum → Bağlam → İzlek/motif |
| **Genel proje fikirleri** | Fikir | Fikrin özü → Neden şimdi → İlk adım → Riskler |

Profil değiştirmek eski notlara dokunmaz; türler ve künye alanları ortak kalır, yani
aynı defterde hem makale hem kitap hem proje notu tutabilirsin.

## Veri modeli

```jsonc
{
  "version": 1,
  "profile": "akademik",
  "settings": { "theme": "auto", "sort": "updated", "editorMode": "split" },
  "notes": {
    "n-abc123": {
      "id": "n-abc123",
      "title": "Çalışma belleği kapasitesi",
      "body": "> ham alıntı\n\n:: kendi yorumun\n\nİlgili: [[Atomik not nedir?]]",
      "type": "kavram",                  // kavram|fikir|makale|kitap|ders|deney|web|proje
      "status": "islendi",               // gelen|incelenecek|okunuyor|islendi|tamamlandi|arsiv
      "tags": ["bilissel-bilim/bellek"],
      "meta": { "author": "…", "source": "…", "date": "1956-03-01", "doi": "…", "url": "…" },
      "files": ["f-xyz789"],             // IndexedDB'deki eklerin kimlikleri
      "createdAt": 1710000000000,
      "updatedAt": 1710000900000
    }
  },
  "log": [ { "id": "l-…", "ts": 1710000000000, "kind": "note.edit", "noteId": "n-abc123", "text": "Miller makalesi tarandı" } ]
}
```

Bağlantılar ayrı bir tabloda tutulmaz; `[[…]]` ifadeleri gövdeden ayrıştırılıp
başlık eşleşmesiyle çözülür (Türkçe duyarlı normalizasyon). Böylece notlar düz metin
olarak taşınabilir kalır: dışa aktarılan Markdown başka bir Zettelkasten aracında da
aynı bağlantı ağını kurar.

## Sınırlar

- Veriler tarayıcıya bağlıdır: tarayıcı verilerini silmek notları da siler.
  **Düzenli JSON yedeği al** (menü → *JSON yedeği indir*).
- `localStorage` pratikte ~5 MB; binlerce not sonrası metin için hâlâ bolca yer var,
  ama büyük PDF'ler IndexedDB'ye gider (orada sınır çok daha yüksektir).
- Cihazlar arası eşitleme yok — bu bilinçli bir tercih. Eşitleme istersen dışa
  aktardığın Markdown/JSON dosyalarını kendi bulut klasörüne koyabilirsin.
