Mã nguồn riêng cho chủ tool. Phần dựng đã build ở ../web, không cần Node để dùng.
Nếu phát triển UI: cài Node.js phù hợp Vite 8, vào ui, npm install, npm run build.
Chép ui/dist/* sang ../web, giữ thư mục downloads.
Kiểm tra Python: python test-desktop.py. UI: npx tsc --noEmit, node scripts/check-template-options.mjs, node scripts/check-file-save.mjs, node scripts/check-media-features.mjs, node scripts/check-template-ui.mjs.
Đã kèm test React (cần react-test-renderer khớp phiên bản React).
Không gửi toàn bộ source hoặc bản owner cho khách. Tạo gói khách từ bảng quản trị.

Bản 1.6: intro độc lập trước bản tin. Xem ui/lib/intro*.ts và ui/app/intro-editor.tsx.
Kiểm tra: trong ui chạy node scripts/check-intro.mjs, node scripts/check-template-ui.mjs.
Build/phát hành: cd ui; npm ci; npm run build. Sau đó chạy python build-release.py --output PATH_OUTSIDE_TOOL.zip
từ thư mục source. Script giữ bộ chạy/launcher hiện có, cập nhật web và gói khách; không kèm data/node_modules.
Xác minh gói khách thật: python verify-release.py. Chưa kiểm thử Windows/codec thực tế.

1.6.1: ui/lib/intro-template.ts chuẩn bị chân trang riêng cho intro; intro.ts giải tư liệu nguồn trước
khi lấy frame/âm thanh. Thêm node scripts/check-intro-footer.mjs để kiểm tra chân trang/8 hiệu ứng.

1.7.0: lib/batch-video.ts plans immutable distinct visual variants and per-template audio settings.
app/batch-voices.tsx exposes source/voice/speed/upload/preview per selected template.
Home exports each variant with its own decoded audio, fitted body duration, transcription and SRT.
Narration/cues now use absolute output time from zero; intro-audio.ts offsets only body source video audio.
Intro videos and legacy stings are silent. Body/footer/template slot clocks remain relative to end of intro.
Regression: check-batch-video.mjs, check-template-ui.mjs (two voices 12s/18s), check-intro.mjs (PCM/canvas/export).
Build and verification do not exercise real Windows browser codecs or synthesize with downloaded VieNeu models.

1.8.0: batch-video.ts owns effective template content, deterministic visual plans and per-asset 100-effect assignment.
video-options.ts adds 100 real motion transforms; intro-render.ts uses the same transforms.
video-variant.ts shares template preparation between export and playable TemplateVideoPreview.
Home supports project JSON 8 with private scripts/titles, stable seed and auto-fit flag.
Tests: check-effects-100.mjs (100 distinct raster frames, 30 per-asset assignments, fit alternation);
check-template-ui.mjs (private scripts and matching preview/export); check-template-video-preview.mjs (canvas/playback/seek/sub/cancel).
Native Windows browser layout/codecs/model synthesis remain unverified here.

1.9.0: interface-theme.ts controls UI-only semantic CSS variables and sanitized local preferences.
InterfaceSettings resets view/theme/disclosures, preserving project/media/voices/templates/results.
TemplateTextEditor keeps per-video typography/fonts in BatchVoice.text, normalized by template-text.ts.
video-variant.ts loads own fonts and applies text identically for preview/export/explicit intro footer.
Project JSON9 preserves overrides; old JSON1–8 remains supported. Save-to-library merges into TemplateDesign.
Validation: check-interface-text.mjs (contrast for extreme colors, real raster typography, font cache,
normalization and intro); check-template-ui.mjs (two independent styles, JSON9, library save/reopen,
persistent theme, non-destructive reset and narration cache). Native Windows execution/codecs unverified.

1.10.0: per-video footer settings live in BatchVoice.footer (normalized by template-footer.ts).
Text title overrides affect visible title/output filename without changing synthesis input/key.
TemplateVideoPreview supports PreviewEdit drag/resize; optimistic Home updates keep it mounted.
Styles do not reset time/audio; own narration decode cache avoids repeat mixing on pointer updates.
textGeometry shares exact wrap/width/clamped-top bounds between rendering and selection overlays.
NumberControl retains partial typing drafts and validates on blur, so 1→10→100 can be typed normally.
Reset applies original template typography and default media geometry while retaining words/voice/trim.
safeMotionTransform bounds position/zoom and reduces travel proportional to durations below 8 sec.
Both body and intro video bypass image motion; batch planning marks video scenes/clips as none.
Project JSON10 retains own footer/title/style settings, still accepting JSON1–9.
Tests: check-gentle-motion.mjs, check-text-inputs.mjs, check-template-ui.mjs,
check-template-video-preview.mjs, check-studio.mjs and prior media/effects/intro regressions.
Native Windows app/browser codec/model synthesis is not tested in this environment.

The top typography/channel inspector also follows the selected preview template.
normalizeBatchUpdate retains unchanged WAV/font payloads during pointer/keyboard edits; aggregate limits run only on payload changes/import.
Auto batch transitions use fade/wipe to avoid a fast full-frame slide.
