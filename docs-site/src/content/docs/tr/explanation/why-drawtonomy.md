---
title: Neden drawtonomy — sürüş senaryoları için inşa edilmiş bir beyaz tahta
description: drawtonomy'nin neden var olduğu ve arkasındaki tasarım seçimleri. Özellikle sürüş senaryoları için inşa edildi — otonom sürüş makalelerine, slayt setlerine, tasarım incelemelerine ve senaryo yazımına giren görseller.
keywords:
  - neden drawtonomy
  - otonom sürüş için beyaz tahta
  - sürüş senaryosu diyagram aracı
  - otonom sürüş diyagram aracı
  - AV araştırma makaleleri için görsel aracı
  - otonom sürüş illüstrasyon yazılımı
  - yol diyagramları için slayt araçlarına alternatif
  - otonom sürüş ekipleri için beyaz tahta
---

drawtonomy, özellikle sürüş senaryoları için inşa edilmiş bir beyaz
tahtadır. Çoğu ekip bu diyagramları bugün genel çizim araçları veya
slayt setleri içinde taslaklar — bunlar genel şekiller için iyi
çalışır, ancak bir şeridin ne olduğunu bilmezler, bu yüzden yol
döndüğünde, kavşak bir kol yetiştirdiğinde veya bir yaya geçidinin
yola hizalanması gerektiğinde geometrinin yeniden çizilmesi gerekir.

Bu sayfa, "bir simülatöre dışa aktaran araç" yerine "sürüş
senaryoları için beyaz tahta" ile öne çıkmadan kaynaklanan tasarım
seçimlerini açıklar.

## Etrafında inşa edildiği problem

Asıl otonom sürüş iletişiminin çoğu diyagramlar aracılığıyla
gerçekleşir: makalelerde, tasarım incelemelerinde, planlama
toplantılarında, olay raporlarında, sınıflarda ve slayt setlerinde.
Diyagram, insanların baktığı, tartıştığı ve hatırladığı eserdir.

Bu seviyedeki genel çizim araçları size yalnızca genel şekiller
verir. Bir şerit, yol her döndüğünde yeniden çizdiğiniz bir
dikdörtgendir; bir yaya geçidi, elle hizalamaya devam ettiğiniz bir
dikdörtgen yığınıdır; bir kavşak yarım saatlik bir kurcalamadır.
Daha kötüsü, yol geometrisi değiştiği anda — ve AV çalışmasında
sürekli değişir — sıfırdan başlarsınız.

drawtonomy bu döngüyü hızlı yapmak için var. Alanın gerçekten
sahip olduğu yapı taşları — şeritler, kavşaklar, yaya geçitleri,
trafik ışıkları, yol işaretlemeleri, araçlar, yayalar — birinci
sınıf şekillerdir, bu nedenle yineledikçe görsel doğru kalır.

## drawtonomy'nin yeri

Sürüş senaryosu çalışması birkaç farklı seviyede gerçekleşir:

1. **Diyagramlar.** Makaleler, slaytlar, beyaz tahta taslakları,
   tasarım belgesi görselleri, sınıf materyali. Prensipte hızlı ve
   kolay, ancak genel bir araçta bir şey hareket ettiğinde yol
   geometrisinin yeniden oluşturulması gerekir.
2. **Yazım araçları.** OpenSCENARIO düzenleyiciler, yol ağı
   düzenleyiciler, CAD tarzı paketler. Hassas, yavaş, öğrenmesi
   pahalı.
3. **Simülatörler.** esmini, CARLA, kurum içi araçlar. Senaryoyu
   çalıştır, veri üret.

drawtonomy 1. seviyede yaşar ve şu durumlarda 2. seviyeye geçer:
bir Lanelet2 haritası içe aktarmanız, değişiklikleri taslamanız,
OpenDRIVE/OpenSCENARIO dışa aktarmanız, sonucu esmini'ye
vermeniz gerektiğinde.

## Tasarım öncelikleri

### Beyaz tahta öncelikli

Karşılaştırma noktası bir CAD aracı değil, hızlı bir beyaz tahta veya
slayt seti taslağıdır. Bu, sürtünme için çıtayı belirler: bir URL'yi
açın, çizin, paylaşın. Kurulum yok, hesap yok, proje dosya formatı
yok. drawtonomy'yi hızlı bir taslaktan daha ağır hissettirecek her
şey kesilir.

### Topoloji bilincine sahip

Bir yol bir çoklu çizgi torbası değildir. drawtonomy, bir sınırı
hareket ettirmenin komşu şeritleri otomatik olarak güncellemesi için
şerit bağlantılarını (Sonraki / Önceki / Sol / Sağ) modeller. Bir
sınırı paylaşan iki şerit aynı sınır noktalarını paylaşır — bir kez
sürükleyin, ikisi de hareket eder.
[Şerit bağlantı modeli](/tr/explanation/lane-model/) sayfasına bakın.

### Sürüş alanı şablonları

Araçlar (sedan, bus, truck, motorcycle…), yayalar (walking, simple),
araç ve yaya trafik ışıkları, yaya geçitleri, yol işaretlemeleri,
işaretler, kavşak şablonları. Bunlar genel-dikdörtgen yaklaşımları
yerine yerleşik şekillerdir. Özel SVG şablonları PR ile eklenebilir.

### Çıkışta da düzenlenebilir, girişte olduğu kadar

drawtonomy'nin ürettiği her çıktı formatı, yeniden düzenlenebilmek
için yeterli durumu korur. `drawtonomy.svg` kayıpsız kanonik formdur:
her yerde önizlenen (tarayıcılar, GitHub, slayt setleri, makale
görselleri) ve drawtonomy'de her bağlantı ve çakışma ilişkisi
bozulmadan yeniden açılan normal bir SVG. Hiçbir şey okuyamayacağınız
bir formatta hapsolmaz.

### Gerektiğinde başsız

Dışa aktarıcı ve ayrıştırıcı kodu `@drawtonomy/sdk`'nın bir parçasıdır
ve düzenleyici olmadan çalışır. CI işlem hatları, tarayıcı uzantıları
ve AI araçları sahneleri programatik olarak üretip doğrulayabilir.

## İş akışının geri kalanına köprüler

Bir diyagramınız olduğunda, genellikle onunla bir şey yapmak
istersiniz. drawtonomy, görselin düzenleyici içinde kilitli
kalmaması için birkaç köprü sunar:

- **`drawtonomy.svg`** — varsayılan. Makalelere, slaytlara, Markdown
  belgelerine gömün; düzenlemeye devam etmek için daha sonra yeniden
  açın.
- **Lanelet2 çift yönlü dönüşüm** — bir Lanelet2 OSM haritasını
  (Autoware örnek haritaları dahil) açın, düzenleyin, geri dışa
  aktarın. Mevcut bir HD haritada değişiklikleri taslaklamak için
  kullanışlıdır.
- **ASAM dışa aktarma** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, isteğe
  bağlı olarak [esmini](https://github.com/esmini/esmini)-hazır bir
  zip olarak paketlenmiş.
- **AI Scene Generator** — doğal dilde bir senaryo açıklayın veya
  OpenSCENARIO XML'i yapıştırın ve iyileştirmeye başlamak için
  düzenlenebilir bir tuval alın.

Bu köprüler kullanışlıdır, ancak diyagramın kendisi drawtonomy'nin
var olma sebebidir. drawtonomy'deki bir görsel zaten bir görsel
olarak değerlidir; bu formatlar, gerektiğinde iş akışının bir
sonraki aşamasına akmasına izin verir.

## drawtonomy ne değildir

- **Bir simülatör değildir.** Senaryoları çalıştırmaz. Bunun için
  esmini, CARLA veya kendi aracınıza dışa aktarın.
- **Bir CAD aracı değildir.** Mühendislik doğruluğunu zorlamaz
  (klotoid spline'ler, eğimleme, yükseklik). Geometri basit 2D'dir.
- **Gerçek zamanlı bir işbirliği paketi değildir.** Tek kullanıcılı
  bir düzenleyicidir. Kaydet, paylaş, yeniden aç.

## Ayrıca bakın

- [Şerit bağlantı modeli](/tr/explanation/lane-model/)
- [Dışa aktarıcı mimarisi](/tr/explanation/exporter-architecture/)
- [Uzantı mimarisi](/tr/explanation/extension-architecture/)
