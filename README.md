# Xì Tố 24

Game xì tố bộ 24 lá (9, 10, J, Q, K, A × 4 chất) để luyện kỹ năng: chơi với 1–3 đối thủ máy, có nặn bài, tỉ lệ thắng, ngưỡng hòa vốn và chấm điểm từng quyết định.

## Cài lên điện thoại

**Android:** vào mục [Releases](../../releases/tag/android-latest), tải `XiTo24.apk` về máy rồi mở để cài. Nếu máy hỏi, cho phép cài ứng dụng từ nguồn này. Mỗi lần có code mới, GitHub Actions tự build lại bản APK; bản mới cài đè lên bản cũ, không mất thống kê.

**iPhone / iPad (app thật):** vào [Releases › ios-latest](../../releases/tag/ios-latest), tải `XiTo24-unsigned.ipa` về máy tính. File chưa ký nên cần ký bằng Apple ID của bạn khi cài:

1. Cài [Sideloadly](https://sideloadly.io) (Windows/macOS), cắm iPhone vào máy tính bằng cáp.
2. Kéo file `.ipa` vào Sideloadly, nhập Apple ID, bấm *Start*.
3. Trên iPhone: Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị → tin cậy Apple ID đó. Từ iOS 16 cần bật thêm *Chế độ nhà phát triển* (Cài đặt → Quyền riêng tư & Bảo mật).

Với Apple ID miễn phí, app hết hạn sau 7 ngày, chỉ cần cài lại (dữ liệu vẫn giữ). Có tài khoản Apple Developer (99 USD/năm) thì app dùng được 1 năm, hoặc phát qua TestFlight.

**iPhone / iPad (không cần máy tính):** bật GitHub Pages (Settings → Pages → Source: *GitHub Actions*), chạy workflow *Web app (GitHub Pages)* trong tab Actions, mở trang đó bằng Safari → nút Chia sẻ → *Thêm vào MH chính*. Game chạy toàn màn hình và chơi được khi không có mạng.

## Cấu trúc

| File | Nội dung |
|---|---|
| `xito-engine.js` | Luật chơi, so bài, chia hũ phụ, xác suất, AI |
| `xito-fx.js` | Nặn bài, hé lá úp, âm thanh |
| `index.html` | Giao diện (dùng chung cho web, PWA và app) |
| `scripts/build-web.mjs` | Đóng gói vào `www/` (font offline, manifest, service worker) |
| `scripts/make-icons.mjs` | Vẽ icon và màn hình khởi động |
| `android/` | Project Android (Capacitor 8) |
| `ios/` | Project iOS (Capacitor 8, Swift Package Manager) |

## Lệnh

```bash
npm install
npm test            # kiểm tra luật chơi
npm run build:web   # tạo www/
npm run apk         # build APK (cần Android SDK, JDK 21)
```
