---
title: Snap ve nokta paylaşımı
description: Şekilleri hizalı tutmak için iki ilişkili ama farklı mekanizma.
keywords:
  - drawtonomy snap modeli
  - nokta paylaşımı
  - drawtonomy hassasiyet
  - şekil hizalama
---

Snap ve nokta paylaşımı her ikisi de "bu nokta o şeyin üzerinde
gider" ile ilgilenir. UI'de benzer görünürler, ancak farklı
sonuçları vardır. Onları karıştırmak, "neden şekillerim sürüklendi?"
hatalarının en yaygın kaynağıdır.

## Snap = aynı koordinat

Snap, imlecinizi (veya sürüklediğiniz bir köşeyi) mevcut bir hedefe
denk gelecek şekilde hareket ettirir. Sonuç, *koordinatları paylaştığı
ortaya çıkan* iki ayrı noktadır.

Daha sonra orijinal hedefi hareket ettirin ve snap edilmiş noktanız
takip etmez. Hiçbir zaman bağlı değillerdi.

Bu, taslak çizerken istediğiniz şeydir: hassas hizalama, gizli
bağlantı yok.

## Paylaşım = aynı kimlik

Paylaşılan bir nokta, birden fazla şekil tarafından başvurulan tek bir
nesnedir. Onu bir kez hareket ettirin, referansı tutan her şekil
onunla birlikte hareket eder.

Paylaşılan noktaları, tıklarken <kbd>Alt</kbd>'ı basılı tutarak veya
segment düzenleme modunda bir köşeyi mevcut olanın üzerine
sürükleyerek oluşturursunuz.

Bu, asla ayrılmaması gereken sınırlar için istediğiniz şeydir — iki
bitişik şerit kenarı, kaynaşık kalması gereken iki polygon köşesi,
bir yolun sonu ve diğerinin başlangıcı.

## Neden ayırt edilmeli

Aynı olması gereken iki şekil kenarı aslında iki snap edilmiş nokta
ise, birini sürükleyin, OpenDRIVE'a dışa aktarın ve yol ağı o
köşede açılır. Simülatör boşluğu bir süreksizlik olarak yorumlayabilir
veya araca bağlı olarak üzerine bulaşabilir.

Bir sınır paylaşan Şerit Sol/Sağ komşuları her zaman dahili olarak
paylaşılan noktaları kullanır — bu isteğe bağlı değildir ve kullanıcı
tarafından kontrol edilmez. Keyfi şekiller (Linestring, Polygon,
Path) için seçim sizindir.

## Görsel ipuçları

- Bir snap hedefi tek bir vurgulu tutamacı gösterir ve imleci çeker.
- Paylaşılan bir nokta segment düzenleme modunda iki kat tutamaç
  olarak işlenir.

## Ayrıca bakın

- [Mevcut geometriye snap yapın](/tr/guides/snap/)
- [Şekiller arasında nokta paylaşın](/tr/guides/point-sharing/)
