Vector kiểm tương thích định dạng — sinh bằng minisign 0.11 THẬT (Debian bookworm, gói `minisign`), 2026-10-16:
  minisign -G -W -p a.pub -s a.key            (khoá A: release-a.pub)
  minisign -G -W -p b.pub -s b.key            (khoá B: release-b.pub — ca "khác khoá")
  minisign -S -s a.key -m manifest-0.1.1.json -t 'timestamp:1760600000<TAB>file:release-manifest.json<TAB>hashed'
  minisign -S -s a.key -m manifest-0.1.0.json                        (ca hạ cấp)
  minisign -S -l -s a.key -m manifest-0.1.1.json -x ….legacy.minisig  (chữ ký legacy "Ed" — bị từ chối)
  minisign -S -s b.key -m manifest-0.1.1.json -x ….otherkey.minisig   (ký bằng khoá B)
  minisign -V -p a.pub -m manifest-0.1.1.json   ⇒ "Signature and comment signature verified"
Manifest lưu đuôi .bin (đúng từng byte đã ký) để Biome không định dạng lại JSON — chữ ký tính trên từng byte.
Khoá BÍ MẬT chỉ tồn tại trong scratchpad lúc sinh rồi bị xoá; repo chỉ có khoá CÔNG KHAI + chữ ký (không phải bí mật).
