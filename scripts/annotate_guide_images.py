import os
from PIL import Image, ImageDraw, ImageFont

img_dir = r"e:\dev\tools-bdld-vnp\tools-bdld-vnp\docs\images"
out_dir = os.path.join(img_dir, "annotated")
os.makedirs(out_dir, exist_ok=True)

# Load fonts with fallback
try:
    font_badge = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 17)
    font_text = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 14)
except Exception:
    try:
        font_badge = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 17)
        font_text = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 14)
    except Exception:
        font_badge = ImageFont.load_default()
        font_text = ImageFont.load_default()

def draw_callout_box(draw, box, num, label, color=(220, 38, 38, 255), badge_pos="tl", bg_dark=(15, 23, 42, 245)):
    x1, y1, x2, y2 = box
    draw.rounded_rectangle([x1, y1, x2, y2], radius=6, outline=color, width=3)
    
    r = 14
    if badge_pos == "tl":
        bx, by = x1 + 16, max(y1, 16)
    elif badge_pos == "tr":
        bx, by = x2 - 16, max(y1, 16)
    elif badge_pos == "bl":
        bx, by = x1 + 16, min(y2, 970)
    elif badge_pos == "top_center":
        bx, by = (x1 + x2) // 2 - 20, max(y1, 16)
    else:
        bx, by = x1 + 16, max(y1, 16)
    
    # Circular number badge
    draw.ellipse([bx - r, by - r, bx + r, by + r], fill=color, outline=(255, 255, 255, 255), width=2)
    
    num_str = str(num)
    bbox_num = font_badge.getbbox(num_str)
    nw = bbox_num[2] - bbox_num[0]
    nh = bbox_num[3] - bbox_num[1]
    draw.text((bx - nw // 2, by - nh // 2 - 2), num_str, fill=(255, 255, 255, 255), font=font_badge)
    
    # Text banner
    if label:
        bbox_txt = font_text.getbbox(label)
        tw = bbox_txt[2] - bbox_txt[0] + 16
        th = bbox_txt[3] - bbox_txt[1] + 10
        tx1 = bx + r + 4
        ty1 = by - th // 2
        draw.rounded_rectangle([tx1, ty1, tx1 + tw, ty1 + th], radius=5, fill=bg_dark, outline=color, width=1)
        draw.text((tx1 + 8, ty1 + 4), label, fill=(255, 255, 255, 255), font=font_text)

def run():
    # 1. 01_dang_nhap.png
    p1 = os.path.join(img_dir, "01_dang_nhap.png")
    if os.path.exists(p1):
        im = Image.open(p1).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [773, 476, 1130, 524], 1, "Ô nhập Tên đăng nhập", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [773, 576, 1130, 624], 2, "Ô nhập Mật khẩu", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [773, 642, 1130, 688], 3, "Nút 'Đăng nhập'", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "01_dang_nhap_annotated.png"))
        print("Done: 01_dang_nhap_annotated.png")

    # 2. 02_dashboard_tong_quan.png
    p2 = os.path.join(img_dir, "02_dashboard_tong_quan.png")
    if os.path.exists(p2):
        im = Image.open(p2).convert("RGBA")
        draw = ImageDraw.Draw(im)
        # Nút làm mới
        draw_callout_box(draw, [1720, 48, 1860, 94], 1, "Nút 'Làm mới' dữ liệu", (220, 38, 38, 255), "tl")
        # Khối thẻ KPI
        draw_callout_box(draw, [245, 130, 1860, 225], 2, "Khối thẻ KPI: Tổng sản lượng, Tổng COD, Tổng trọng lượng", (37, 99, 235, 255), "tl")
        # Nút cấu hình
        draw_callout_box(draw, [1215, 255, 1845, 295], 3, "Cấu hình Thời gian tồn & Cấu hình Bưu cục", (217, 119, 6, 255), "tl")
        # Highlight & lọc
        draw_callout_box(draw, [255, 305, 1845, 350], 4, "Thanh Highlight ngưỡng tồn & Bộ lọc Nhóm KH", (16, 185, 129, 255), "tl")
        # Bảng tổng hợp
        draw_callout_box(draw, [245, 360, 1870, 960], 5, "Bảng tổng hợp bưu cục tồn & Cột Xem chi tiết", (147, 51, 234, 255), "tl")
        # Sidebar điều khiển
        draw_callout_box(draw, [15, 785, 205, 885], 6, "Nút 'Đồng bộ dữ liệu' & 'Đăng xuất'", (220, 38, 38, 255), "tl")
        im.save(os.path.join(out_dir, "02_dashboard_tong_quan_annotated.png"))
        print("Done: 02_dashboard_tong_quan_annotated.png")

    # 3. 02_cau_hinh_ngay_ton.png
    p2_ngay = os.path.join(img_dir, "02_cau_hinh_ngay_ton.png")
    if os.path.exists(p2_ngay):
        im = Image.open(p2_ngay).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [765, 380, 1140, 520], 1, "Chọn các mốc ngày tồn hiển thị trên ma trận", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [765, 525, 1140, 580], 2, "Chọn các cột tham gia tính Tổng tồn toàn tỉnh", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [960, 590, 1140, 635], 3, "Nút 'Lưu cấu hình'", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "02_cau_hinh_ngay_ton_annotated.png"))
        print("Done: 02_cau_hinh_ngay_ton_annotated.png")

    # 4. 02_cau_hinh_buu_cuc.png
    p2_bc = os.path.join(img_dir, "02_cau_hinh_buu_cuc.png")
    if os.path.exists(p2_bc):
        im = Image.open(p2_bc).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [555, 140, 1350, 195], 1, "Ô tìm kiếm nhanh mã hoặc tên bưu cục", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [555, 205, 1350, 785], 2, "Công tắc Bật/Tắt hiển thị từng bưu cục", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [1150, 805, 1350, 860], 3, "Nút 'Lưu cấu hình bưu cục'", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "02_cau_hinh_buu_cuc_annotated.png"))
        print("Done: 02_cau_hinh_buu_cuc_annotated.png")

    # 5. 02_filter_va_highlight.png
    p2_hl = os.path.join(img_dir, "02_filter_va_highlight.png")
    if os.path.exists(p2_hl):
        im = Image.open(p2_hl).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [255, 305, 1300, 350], 1, "Ô nhập ngưỡng Highlight số lượng tồn (≥3N, 4N, 5N, 7N, 14N, Tổng)", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [1460, 305, 1665, 350], 2, "Dropdown lọc 'Nhóm KH'", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [1670, 305, 1845, 350], 3, "Nút 'Reset bộ lọc'", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [1810, 360, 1868, 460], 4, "Vị trí bấm Xem chi tiết bưu gửi", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "02_filter_va_highlight_annotated.png"))
        print("Done: 02_filter_va_highlight_annotated.png")

    # 6. 03_chi_tiet_buu_gui.png
    p3_ct = os.path.join(img_dir, "03_chi_tiet_buu_gui.png")
    if os.path.exists(p3_ct):
        im = Image.open(p3_ct).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [245, 115, 850, 160], 1, "Tiêu đề: Chi tiết bưu gửi tồn tại BĐT/TP Lâm Đồng", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [1370, 115, 1860, 160], 2, "Thao tác: [ Cột ], [ Xuất Excel ], [ Định vị bưu gửi ]", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [245, 175, 1860, 260], 3, "Thanh bộ lọc: Bưu cục, Ngày đến, TG tồn, Nhóm KH, Tìm kiếm", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [245, 270, 1860, 915], 4, "Bảng danh sách chi tiết bưu gửi tồn kèm bưu tá & COD", (16, 185, 129, 255), "tl")
        draw_callout_box(draw, [245, 925, 1860, 970], 5, "Thanh phân trang và chọn số lượng dòng hiển thị", (147, 51, 234, 255), "tl")
        im.save(os.path.join(out_dir, "03_chi_tiet_buu_gui_annotated.png"))
        print("Done: 03_chi_tiet_buu_gui_annotated.png")

    # 7. 03_cau_hinh_cot.png
    p3_cot = os.path.join(img_dir, "03_cau_hinh_cot.png")
    if os.path.exists(p3_cot):
        im = Image.open(p3_cot).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [725, 205, 1070, 785], 1, "Checkbox Bật/Tắt ẩn hiện từng cột dữ liệu", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [1075, 205, 1175, 785], 2, "Nút mũi tên lên/xuống sắp xếp thứ tự cột", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [1015, 800, 1175, 845], 3, "Nút 'Đóng / Lưu cấu hình'", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "03_cau_hinh_cot_annotated.png"))
        print("Done: 03_cau_hinh_cot_annotated.png")

    # 8. 03_filter_chi_tiet.png
    p3_flt = os.path.join(img_dir, "03_filter_chi_tiet.png")
    if os.path.exists(p3_flt):
        im = Image.open(p3_flt).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [245, 215, 620, 680], 1, "Dropdown danh sách bưu cục mở rộng (Multiselect)", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [260, 265, 605, 305], 2, "Nút 'Chọn tất cả' và 'Xóa chọn'", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [630, 175, 1860, 260], 3, "Các bộ lọc còn lại: Thời gian tồn, Trạng thái, Nhóm KH, Tìm kiếm", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "03_filter_chi_tiet_annotated.png"))
        print("Done: 03_filter_chi_tiet_annotated.png")

    # 9. 04_dinh_vi_tong_quan.png
    p4_dv = os.path.join(img_dir, "04_dinh_vi_tong_quan.png")
    if os.path.exists(p4_dv):
        im = Image.open(p4_dv).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [245, 110, 1860, 180], 1, "Trạng thái luồng kết nối VNPost & Nút 'Đặt lại'", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [245, 200, 920, 750], 2, "Khung dán danh sách mã bưu gửi & Nút Mẫu / Xóa", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [245, 770, 920, 830], 3, "Nút 'Định vị và xuất excel'", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [945, 200, 1860, 830], 4, "Khung tiến trình xử lý, Console logs & Checklist lô tải", (16, 185, 129, 255), "tl")
        im.save(os.path.join(out_dir, "04_dinh_vi_tong_quan_annotated.png"))
        print("Done: 04_dinh_vi_tong_quan_annotated.png")

    # 10. 04_tao_luong_captcha.png
    p4_cap = os.path.join(img_dir, "04_tao_luong_captcha.png")
    if os.path.exists(p4_cap):
        im = Image.open(p4_cap).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [245, 110, 1860, 180], 1, "Trạng thái luồng kết nối VNPost", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [245, 190, 1860, 275], 2, "Khu vực giải Captcha luồng: Ảnh Captcha, Ô nhập mã, Nút 'Xác nhận'", (220, 38, 38, 255), "tl")
        draw_callout_box(draw, [245, 295, 920, 830], 3, "Khung nhập danh sách mã bưu gửi cần tra cứu", (16, 185, 129, 255), "tl")
        draw_callout_box(draw, [945, 295, 1860, 830], 4, "Khung hiển thị tiến trình và nút Tải xuống file Excel", (37, 99, 235, 255), "tl")
        im.save(os.path.join(out_dir, "04_tao_luong_captcha_annotated.png"))
        print("Done: 04_tao_luong_captcha_annotated.png")

    # 11. 05_loc_ton_giao_dien_upload.png
    p5_up = os.path.join(img_dir, "05_loc_ton_giao_dien_upload.png")
    if os.path.exists(p5_up):
        im = Image.open(p5_up).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [245, 130, 1035, 340], 1, "Vùng kéo thả File Hàng Tồn (hangton.xlsx xuất từ P3)", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [1065, 130, 1860, 340], 2, "Vùng kéo thả File Định Vị (dinh_vi.xlsx xuất từ P4)", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [800, 365, 1310, 420], 3, "Nút 'Bắt đầu Lọc Tồn' (Xử lý 1-3 giây) & 'Làm mới'", (220, 38, 38, 255), "tl")
        im.save(os.path.join(out_dir, "05_loc_ton_giao_dien_upload_annotated.png"))
        print("Done: 05_loc_ton_giao_dien_upload_annotated.png")

    # 12. 05_loc_ton_ket_qua.png
    p5_res = os.path.join(img_dir, "05_loc_ton_ket_qua.png")
    if os.path.exists(p5_res):
        im = Image.open(p5_res).convert("RGBA")
        draw = ImageDraw.Draw(im)
        draw_callout_box(draw, [245, 115, 1150, 165], 1, "Hệ thống 3 Tabs: Bảng 3 (Tổng hợp BC), Bảng 1 (Chưa phát), Bảng 2 (TT khác)", (37, 99, 235, 255), "tl")
        draw_callout_box(draw, [1600, 115, 1860, 165], 2, "Nút 'Xuất File Excel (3 Sheets)'", (16, 185, 129, 255), "tl")
        draw_callout_box(draw, [245, 175, 1860, 245], 3, "Thanh Toolbar bộ lọc: Bưu cục, TG tồn, Trạng thái, Tiền COD, Tìm kiếm", (217, 119, 6, 255), "tl")
        draw_callout_box(draw, [245, 260, 1860, 950], 4, "Bảng dữ liệu kết quả đối soát & phân loại chi tiết", (220, 38, 38, 255), "tl")
        im.save(os.path.join(out_dir, "05_loc_ton_ket_qua_annotated.png"))
        print("Done: 05_loc_ton_ket_qua_annotated.png")

if __name__ == "__main__":
    run()
