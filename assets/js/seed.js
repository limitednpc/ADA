/* ==========================================================================
   ADA · seed.js — örnek veri kümesi
   Uygulamanın tüm yeteneklerini (künye, alıntı/yorum ayrımı, çift yönlü
   bağlantı, hiyerarşik etiket, bağlantısız not) tek seferde gösterir.
   ========================================================================== */
(function () {
  'use strict';
  var ADA = (window.ADA = window.ADA || {});

  var DAY = 86400000;

  ADA.seed = function () {
    var now = Date.now();
    var N = [
      {
        title: 'Dağıtılmış biliş',
        type: 'kavram',
        status: 'islendi',
        tags: ['bilissel-bilim', 'bilissel-bilim/bellek', 'kavram'],
        meta: {},
        body:
          'Düşünme yalnızca kafanın içinde olup biten bir şey değil; defter, kenar notu, ' +
          'fiş kutusu ve konuşma da bilişsel sistemin parçasıdır.\n\n' +
          ':: Bu kavram, not tutmayı "hatırlama" işi olmaktan çıkarıp "düşünme" işine çeviriyor. ' +
          'Bir not sisteminin değeri sakladığı bilgi değil, kurduğu bağlantı sayısıdır.\n\n' +
          'İlgili: [[Zettelkasten yöntemi]] · [[Çalışma belleği kapasitesi]] · [[Dış bellek olarak yazı]]',
        ago: 9
      },
      {
        title: 'Çalışma belleği kapasitesi',
        type: 'kavram',
        status: 'islendi',
        tags: ['bilissel-bilim/bellek'],
        body:
          'Aynı anda etkin tutulabilen bağımsız öğe sayısı sınırlıdır; bu sınır, karmaşık ' +
          'metinleri parçalara bölmeden anlamayı zorlaştırır.\n\n' +
          '> "The span of immediate memory seems to be almost independent of the number of bits per chunk."\n\n' +
          ':: Anahtar kelime *chunk*. Sınırı büyütemiyorsak parçanın içeriğini zenginleştirebiliriz — ' +
          'atomik notlar tam olarak bunu yapıyor: her not tek bir "chunk".\n\n' +
          'Kaynak: [[Miller 1956 — Sihirli sayı yedi]] · İlgili: [[Atomik not nedir?]]',
        ago: 7
      },
      {
        title: 'Miller 1956 — Sihirli sayı yedi',
        type: 'makale',
        status: 'tamamlandi',
        tags: ['bilissel-bilim/bellek', 'okuma/literatur'],
        meta: {
          author: 'George A. Miller',
          source: 'Psychological Review',
          date: '1956-03-01',
          pages: '81-97',
          doi: '10.1037/h0043158',
          url: 'https://psycnet.apa.org/record/1957-02914-001'
        },
        body:
          '> "The magical number seven, plus or minus two: some limits on our capacity for ' +
          'processing information." (s. 81)\n\n' +
          ':: Makalenin sık atlanan yanı: Miller bir kapasite yasası ilan etmiyor, ölçüm ' +
          'yönteminin sınırına işaret ediyor. Sonraki literatür sayıyı 4±1\'e çekti.\n\n' +
          '### Yöntem\nMutlak yargı deneyleri + anlık bellek görevleri karşılaştırması.\n\n' +
          '### Bulgular\nKanal kapasitesi ~2,5 bit; parçalama (chunking) bu sınırı esnetiyor.\n\n' +
          '### İtirazlar\nModalite farkları ve uzman belleği (satranç ustaları) sonucu bulandırıyor.\n\n' +
          'Bağlanan kavram: [[Çalışma belleği kapasitesi]]',
        ago: 6
      },
      {
        title: 'Zettelkasten yöntemi',
        type: 'kavram',
        status: 'okunuyor',
        tags: ['yontem', 'not-alma'],
        body:
          'Luhmann\'ın fiş kutusu: her fişte tek bir düşünce, her fişte en az bir komşuya ' +
          'referans. Sistem büyüdükçe fişler arası ilişkiler yeni sorular üretir.\n\n' +
          ':: Kritik ayrım: klasör hiyerarşisi bilgiyi *yerine* koyar, bağlantı ağı bilgiyi ' +
          '*ilişkiye* sokar. Ben ikisini birlikte kullanıyorum: etiket = kaba raf, ' +
          '[[ ]] = ince ilişki.\n\n' +
          'İlgili: [[Atomik not nedir?]] · [[Dağıtılmış biliş]] · [[Not alırken alıntı-yorum ayrımı]]',
        ago: 5
      },
      {
        title: 'Atomik not nedir?',
        type: 'kavram',
        status: 'islendi',
        tags: ['yontem', 'not-alma'],
        body:
          'Tek bir kavramı, kendi başına anlaşılacak kadar tam ama bir başkasının içine ' +
          'gömülmeyecek kadar küçük anlatan not.\n\n' +
          '- Başlığı bir iddia ya da kavram olmalı, konu başlığı değil\n' +
          '- Kaynağa değil, düşünceye ait olmalı\n' +
          '- En az bir [[Zettelkasten yöntemi]] komşusu olmalı\n\n' +
          ':: Sınama sorusu: "Bu notu altı ay sonra bağlamsız okusam ne anlarım?"',
        ago: 4
      },
      {
        title: 'Not alırken alıntı-yorum ayrımı',
        type: 'kavram',
        status: 'okunuyor',
        tags: ['yontem', 'not-alma', 'incelenecek'],
        body:
          'Ham alıntı ile kendi yorumun aynı blokta durursa, altı ay sonra hangisinin kime ' +
          'ait olduğunu bilemezsin. Bu, farkında olmadan yapılan intihalin ve yanlış ' +
          'atfın birinci kaynağıdır.\n\n' +
          '> "Notlarında kaynağın sesini kendi sesinden ayır." — çalışma defteri, 2024\n\n' +
          ':: Bu yüzden ADA\'da iki blok var: `>` ham alıntı, `::` kendi sentezin. ' +
          'Kenardaki renk şeridi altı ay sonrası için yazılmış bir uyarı.\n\n' +
          'İlgili: [[Dış bellek olarak yazı]]',
        ago: 3
      },
      {
        title: 'Dış bellek olarak yazı',
        type: 'kitap',
        status: 'okunuyor',
        tags: ['felsefe', 'felsefe/dil', 'okuma'],
        meta: {
          author: 'Walter J. Ong',
          source: 'Sözlü ve Yazılı Kültür',
          publisher: 'Metis',
          date: '1982-01-01',
          pages: '95-120',
          isbn: '9789753420723'
        },
        body:
          '> "Yazı, bilinci yeniden yapılandırır."\n\n' +
          ':: Ong\'un iddiası teknoloji karşıtlığı değil: her dışsallaştırma aracı, düşünmenin ' +
          'biçimini de değiştiriyor. Fiş kutusu da bir "bilinç yeniden yapılandırıcısı".\n\n' +
          'Sözlü kültürde bilgi *formüllerle* saklanır; yazılı kültürde *listelenebilir* ' +
          've böylece eleştirilebilir hale gelir.\n\n' +
          'İlgili: [[Dağıtılmış biliş]] · [[Not alırken alıntı-yorum ayrımı]]',
        ago: 2
      },
      {
        title: 'Okuma kaydı — 12 Mart',
        type: 'ders',
        status: 'gelen',
        tags: ['gunluk', 'okuma'],
        meta: { source: 'Kendi çalışma defteri', date: '2025-03-12' },
        body:
          'Miller makalesinin ilk yarısı okundu, iki kavram notu çıkarıldı.\n\n' +
          ':: Sonraki adım: 4±1 tartışmasını açan Cowan (2001) taranacak. #incelenecek\n\n' +
          'Değinilen: [[Miller 1956 — Sihirli sayı yedi]]',
        ago: 1
      },
      {
        title: 'Grafik görünümü neden işe yarıyor?',
        type: 'fikir',
        status: 'gelen',
        tags: ['fikir', 'arayuz'],
        body:
          ':: Ağ görünümünün asıl işlevi güzel görünmek değil, *boşluğu* göstermek: hiçbir ' +
          'yere bağlanmamış düğüm, henüz düşünülmemiş bir fikirdir.\n\n' +
          'İlgili: [[Zettelkasten yöntemi]]',
        ago: 0.5
      },
      {
        title: 'Kenar notu: kahve ve dikkat',
        type: 'fikir',
        status: 'gelen',
        tags: [],
        body:
          'Öğleden sonra ikinci fincandan sonra okuma hızı artıyor ama anlama düşüyor gibi. ' +
          'Ölçmeden konuşmamalı.\n\n' +
          ':: Bu not bilerek hiçbir yere bağlanmadı — Ağ görünümünde "bağlantısız" olarak ' +
          'işaretlendiğini göreceksin.',
        ago: 0.2
      }
    ];

    var created = {};
    N.forEach(function (n) {
      var t = now - n.ago * DAY;
      var note = ADA.store.create({
        title: n.title,
        body: n.body,
        type: n.type,
        status: n.status,
        tags: n.tags || [],
        meta: n.meta || {},
        createdAt: t,
        updatedAt: t
      }, { log: false });
      created[n.title] = note.id;
      // Günlüğü geçmişe yayarak zaman çizelgesini gerçekçi kıl
      ADA.store.log('note.create', note.id, 'Not oluşturuldu: ' + n.title, { ts: t });
    });

    ADA.store.log('note.edit', created['Miller 1956 — Sihirli sayı yedi'],
      'Miller makalesi tarandı, iki kavram notu çıkarıldı', { ts: now - 6 * DAY + 3600000 });
    ADA.store.log('note.status', created['Miller 1956 — Sihirli sayı yedi'],
      'Durum → Tamamlandı: Miller 1956 — Sihirli sayı yedi', { ts: now - 5.6 * DAY });
    ADA.store.log('note.edit', created['Zettelkasten yöntemi'],
      'Zettelkasten üzerine okuma; iki kavram notu bağlandı', { ts: now - 4.6 * DAY });
    ADA.store.log('note.edit', created['Dış bellek olarak yazı'],
      'Ong bölüm 4 okundu; alıntı-yorum ayrımı notu yazıldı', { ts: now - 2 * DAY + 5400000 });
    ADA.store.log('capture', created['Grafik görünümü neden işe yarıyor?'],
      'Hızlı not: Grafik görünümü neden işe yarıyor?', { ts: now - 0.5 * DAY });
    ADA.store.log('import', null, 'Örnek veri kümesi yüklendi');

    ADA.store.state.log.sort(function (a, b) { return b.ts - a.ts; });
    ADA.store.save();
    ADA.store.emit('seed');
  };
})();
