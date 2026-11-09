import type { LunarDay } from './lunar-calendar';
import { solarToLunar } from './lunar-calendar';
import lunarEventsEnRaw from '$lib/data/lunar-events-en.json';

export const VIA_DAYS_EN: Record<string, string> = (lunarEventsEnRaw as { viaDays?: Record<string, string> })?.viaDays ?? {};
export const ABSTINENCE_DAYS_EN: Record<string, { reason: string; harm: string }> = (lunarEventsEnRaw as { abstinenceDays?: Record<string, { reason: string; harm: string }> })?.abstinenceDays ?? {};

export interface LunarEventNotificationInfo {
  isEvent: boolean;
  isThapTrai: boolean;
  kiengDam: { harm: string; reason: string } | null;
  lunarDay: number;
  lunarMonth: number;
  lunarYear: number;
  lunarLeap?: boolean;
  viaName: string | null;
  viaKey?: string | null;
}

const VIA_DAYS: Record<string, string> = {
    "1-1": "Vía đức Phật Di Lặc",
    "2-8": "Vía Phật Thích Ca xuất gia",
    "2-15": "Vía Phật Thích Ca nhập diệt",
    "2-19": "Vía đức Quán Thế Âm đản sinh",
    "2-21": "Vía đức Phổ Hiền Bồ Tát",
    "3-6": "Vía Tôn giả Ca Diếp",
    "3-16": "Vía đức Chuẩn Đề Bồ Tát",
    "4-4": "Vía đức Văn Thù Bồ Tát",
    "4-8": "Vía Phật Thích Ca đản sinh",
    "4-15": "Đại lễ Tam hợp (Vesak)",
    "4-20": "Vía Bồ Tát Thích Quảng Đức vị pháp thiêu thân",
    "4-23": "Vía Bồ Tát Phổ Hiền thành đạo",
    "4-28": "Vía đức Phật Dược Sư đản sinh",
    "5-13": "Vía Già Lam Thánh Chúng",
    "6-3": "Vía Đức Hộ Pháp",
    "6-15": "Đức Phật chuyển pháp luân tại vườn Lộc Uyển",
    "6-19": "Vía đức Quán Thế Âm thành đạo",
    "7-13": "Vía đức Đại Thế Chí Bồ Tát đản sinh",
    "7-15": "Lễ Vu Lan Bồn (Vu Lan Báo Hiếu)",
    "7-30": "Vía đức Địa Tạng Bồ Tát thành đạo",
    "8-8": "Vía Tôn giả A Nan Đà",
    "8-22": "Vía đức Phật Nhiên Đăng đản sinh",
    "9-19": "Vía đức Quán Thế Âm xuất gia",
    "9-30": "Vía Phật Dược Sư Lưu Ly thành đạo",
    "10-5": "Vía đức Bồ Đề Đạt Ma",
    "11-11": "Vía Phật Hoàng Trần Nhân Tông",
    "11-17": "Vía đức Phật A Di Đà đản sinh",
    "12-8": "Vía đức Phật Thích Ca thành đạo"
};

const ABSTINENCE_DAYS: Record<string, { reason: string; harm: string }> = {
    "1-1": { reason: "Tết Nguyên Đán, Ngọc Đế xem xét thần, khí, tài lộc, thọ mạng của con người. Nguyệt Sóc", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "1-3": { reason: "Vạn thần nhóm hội – Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "1-5": { reason: "Ngũ Hư kỵ", harm: "" },
    "1-6": { reason: "Lục Hao kỵ, Lôi trai nhật", harm: "Giảm thọ mười hai năm" },
    "1-7": { reason: "Ngày Thượng Hội", harm: "Tổn thọ" },
    "1-8": { reason: "Vía Ngũ Điện Diêm La Thiên Tử – Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "1-9": { reason: "Vía Ngọc Hoàng Thượng Đế", harm: "Giảm thọ mười hai năm" },
    "1-13": { reason: "Ngày kỵ Dương Công", harm: "" },
    "1-14": { reason: "Tam Nguyên Giáng – Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "1-15": { reason: "Tam Nguyên Giáng – Thượng Nguyên Thần Hội – Ngày Rằm – Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "1-16": { reason: "Tam Nguyên Giáng", harm: "Giảm thọ" },
    "1-19": { reason: "Vía Trường Xuân Chân Nhân", harm: "" },
    "1-23": { reason: "Thần Tam Thi báo cáo – Tứ Thiên Vương tuần hành", harm: "" },
    "1-25": { reason: "Ngày Nguyệt Hối. Ngày mở kho trời đất", harm: "Giảm thọ, tổn thọ, con cái bị bệnh tật." },
    "1-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "1-28": { reason: "Các vị nhân thần ngự trong cõi âm", harm: "Bị bệnh" },
    "1-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "1-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo – Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "2-1": { reason: "Nguyệt Sóc – Vía Nhất Điện Tần Quảng Vương", harm: "Giảm thọ mười hai năm" },
    "2-2": { reason: "Vạn thần nhóm họp, vía Phước Đức Thổ Địa Chánh Thần", harm: "Giảm thọ mười hai năm, mắc họa" },
    "2-3": { reason: "Đẩu giáng, vía Văn Xương Đế Quân", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "2-6": { reason: "Lôi Trai Nhật, vía Đông Nhạc Đế Quân", harm: "Giảm thọ" },
    "2-8": { reason: "Thích Ca Mâu Ni Phật xuất gia, vía Tống Đế Vương, vía Trương Đại Đế, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "2-11": { reason: "Dương công kỵ", harm: "" },
    "2-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "2-15": { reason: "Thích Ca Mâu Ni Phật bát Niết Bàn, Nguyệt Vọng, vía Thái Thượng Lão Quân, Tứ Thiên Vương tuần hành", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "2-17": { reason: "Vía Đông Phương Đỗ Tướng Quân", harm: "" },
    "2-18": { reason: "Vía Tứ Điện Ngũ Quan Vương, sinh nhật của Chí Thánh Tiên Sư Khổng Tử", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "2-19": { reason: "Khánh đản Quán Âm Đại Sĩ", harm: "Giảm thọ mười hai năm" },
    "2-21": { reason: "Khánh đản Phổ Hiền Bồ Tát", harm: "" },
    "2-23": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "2-25": { reason: "Ngày Nguyệt Hối", harm: "Giảm thọ" },
    "2-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "2-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Mắc bệnh" },
    "2-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "2-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo", harm: "Giảm thọ" },
    "3-1": { reason: "Nguyệt sóc – Vía Nhị Điện Sở Giang Vương", harm: "Giảm thọ mười hai năm" },
    "3-3": { reason: "Đẩu Giáng – Vía Huyền Thiên Thượng Đế", harm: "Giảm thọ mười hai năm" },
    "3-6": { reason: "Lôi Trai Nhật", harm: "Giảm thọ" },
    "3-8": { reason: "Vía Lục Điện Biện Thành Vương – Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "3-9": { reason: "Ngưu quỷ thần xuất – Dương công kỵ", harm: "Sanh ác thai" },
    "3-12": { reason: "Vía Trung Ương Ngũ Đạo", harm: "" },
    "3-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "3-15": { reason: "Nguyệt vọng – vía Huyền Đàn, vía Hạo Thiên Thượng Đế, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "3-16": { reason: "Khánh đản Chuẩn Đề Bồ Tát", harm: "Giảm thọ mười hai năm" },
    "3-18": { reason: "Vía Trung Nhạc Đại Đế, vía Hậu Thổ Nương Nương, Tam Mao giáng hạ", harm: "" },
    "3-20": { reason: "Ngày mở kho trời đất, vía Tử Tôn Nương Nương", harm: "Tổn thọ" },
    "3-23": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "3-25": { reason: "Ngày Nguyệt Hối", harm: "Giảm thọ" },
    "3-27": { reason: "Đẩu giáng, vía Thất Điện Thái Sơn Vương", harm: "Giảm thọ mười hai năm" },
    "3-28": { reason: "Nhân thần nhóm họp cõi âm, vía Thương Hiệt Chí Thánh tiên sư", harm: "Bị bệnh, giảm tài lộc, giảm thọ mười hai năm" },
    "3-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "3-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "4-1": { reason: "Nguyệt Sóc, vía Bát Điện Đô Thị Vương", harm: "Giảm thọ mười hai năm" },
    "4-3": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "4-4": { reason: "Vạn thần thiện hóa, khánh đản Văn Thù Bồ Tát", harm: "Xảy thai, thai chết yểu" },
    "4-6": { reason: "Lôi Trai Nhật", harm: "Giảm thọ" },
    "4-7": { reason: "Nam Đẩu, Bắc Đẩu, Tây Đẩu cùng giáng hạ. Dương công kỵ.", harm: "Giảm thọ" },
    "4-8": { reason: "Khánh đản Thích Ca Mâu Ni Phật, Vạn thần thiện hóa. Thiện Ác đồng tử giáng hạ. Vía Cửu Điện Bình Đẳng Vương, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm, thai chết yểu, bị bệnh về máu mà chết" },
    "4-14": { reason: "Vía Thuần Dương tổ sư, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "4-15": { reason: "Nguyệt vọng, vía Chung Ly tổ sư, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "4-16": { reason: "Ngày trời đất mở kho", harm: "Tổn thọ" },
    "4-17": { reason: "Vía Thập Điện Chuyển Luân Vương", harm: "Giảm thọ mười hai năm" },
    "4-18": { reason: "Ngày trời đất mở kho, vía Tử Vi Đại Đế", harm: "Giảm thọ" },
    "4-20": { reason: "Vía Nhãn Quang Thánh Mẫu", harm: "" },
    "4-23": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "4-25": { reason: "Nguyệt Hối", harm: "Giảm thọ" },
    "4-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "4-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "4-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "4-30": { reason: "Nguyệt Hối, Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "5-1": { reason: "Nguyệt sóc, vía Nam Cực Trường Sanh Đại Đế", harm: "Giảm thọ mười hai năm" },
    "5-3": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "5-5": { reason: "Địa lạp, Ngũ Đế giảo định quan tước của con người, ngày Cửu Độc, Dương Công kỵ", harm: "Giảm tài lộc, giảm thọ mười hai năm, chết yểu, tai họa bất ngờ" },
    "5-6": { reason: "Ngày Cửu Độc, Lôi trai nhật", harm: "Chết yểu, tai họa bất ngờ" },
    "5-7": { reason: "Ngày Cửu Độc", harm: "Chết yểu, tai họa bất ngờ" },
    "5-8": { reason: "Vía Nam Phương Ngũ Đạo, Tứ Thiên Vương tuần hành", harm: "Tổn thọ" },
    "5-11": { reason: "Ngày mở kho trời đất, vía Đô Thành Hoàng trong thiên hạ", harm: "Tổn thọ" },
    "5-12": { reason: "Vía Bính Linh Công", harm: "Tổn thọ" },
    "5-13": { reason: "Quan Thánh giáng thần", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "5-14": { reason: "Tứ Thiên Vương tuần hành, giờ Tý nửa đêm là lúc trời đất giao hòa", harm: "Trong vòng ba năm vợ chồng đều chết" },
    "5-15": { reason: "Nguyệt vọng, ngày Cửu Độc, Tứ Thiên Vương tuần hành", harm: "Chết yểu, tai họa bất ngờ" },
    "5-16": { reason: "Ngày Cửu Độc, ngày nguyên khí tạo hóa vạn vật trong trời đất", harm: "Trong vòng ba năm vợ chồng đều chết" },
    "5-17": { reason: "Ngày Cửu Độc", harm: "Chết yểu, tai họa bất ngờ" },
    "5-18": { reason: "Vía Trương thiên sư", harm: "" },
    "5-22": { reason: "Vía Hiếu Nga thần", harm: "Giảm thọ mười hai năm" },
    "5-23": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "5-25": { reason: "Ngày Cửu Độc, ngày Nguyệt Hối", harm: "Chết yểu, tai họa bất ngờ" },
    "5-26": { reason: "Ngày Cửu Độc", harm: "Chết yểu, tai họa bất ngờ" },
    "5-27": { reason: "Ngày Cửu Độc, Đẩu giáng", harm: "Chết yểu, tai họa bất ngờ" },
    "5-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "5-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "5-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "6-1": { reason: "Nguyệt Sóc", harm: "Giảm thọ mười hai năm" },
    "6-3": { reason: "Đẩu giáng, Dương công kỵ", harm: "Giảm thọ mười hai năm" },
    "6-4": { reason: "Nam Thiệm Bộ Châu chuyển đại pháp luân", harm: "Tổn thọ" },
    "6-6": { reason: "Ngày mở kho trời đất, Lôi trai nhật", harm: "Tổn thọ" },
    "6-8": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "6-10": { reason: "Khánh đản Kim Túc Như Lai", harm: "" },
    "6-13": { reason: "Vía Tỉnh Tuyền Long Vương", harm: "" },
    "6-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "6-15": { reason: "Nguyệt vọng, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "6-19": { reason: "Quán Âm Đại Sĩ Niết Bàn", harm: "Giảm thọ mười hai năm" },
    "6-23": { reason: "Vía Nam Phương Hỏa Thần, Tứ Thiên Vương tuần hành", harm: "Bị trùng tang" },
    "6-24": { reason: "Vía Lôi Tổ, vía Quan Đế", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "6-25": { reason: "Ngày Nguyệt Hối", harm: "Giảm thọ" },
    "6-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "6-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "6-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "6-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "7-1": { reason: "Nguyệt sóc, Dương công kỵ", harm: "Giảm thọ mười hai năm" },
    "7-3": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "7-5": { reason: "Ngày Trung Hội", harm: "Tổn thọ" },
    "7-6": { reason: "Lôi trai nhật", harm: "Giảm thọ" },
    "7-7": { reason: "Đạo Đức Lạp, Ngũ Đế so sánh thiện ác của con người, vía Khôi Tinh", harm: "Giảm lộc, giảm thọ mười hai năm" },
    "7-8": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "7-10": { reason: "Ngày âm độc, đại kỵ", harm: "" },
    "7-12": { reason: "Vía Trường Chân Đàm chân nhân", harm: "" },
    "7-13": { reason: "Khánh đản Đại Thế Chí Bồ Tát", harm: "Giảm thọ" },
    "7-14": { reason: "Tam Nguyên giáng, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "7-15": { reason: "Nguyệt vọng, Tam Nguyên giáng, Địa quan tra sổ, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "7-16": { reason: "Tam Nguyên Giáng", harm: "Giảm thọ mười hai năm" },
    "7-18": { reason: "Vía Tây Vương Mẫu", harm: "Giảm thọ mười hai năm" },
    "7-19": { reason: "Vía Thái Tuế", harm: "Giảm thọ mười hai năm" },
    "7-22": { reason: "Vía Tăng Phước Tài Thần", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "7-23": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "7-25": { reason: "Nguyệt Hối", harm: "Giảm thọ" },
    "7-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "7-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "7-29": { reason: "Dương công kỵ, Tứ Thiên Vương tuần hành", harm: "" },
    "7-30": { reason: "Khánh đản Địa Tạng Bồ Tát, Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "8-1": { reason: "Nguyệt Sóc, vía Hứa Chân Quân", harm: "Giảm thọ mười hai năm" },
    "8-3": { reason: "Đẩu giáng, vía Bắc Đẩu, vía Tư Mạng Táo Quân", harm: "Giảm tài lộc, giảm thọ mười hai năm, bị hỏa hoạn" },
    "8-5": { reason: "Vía Lôi Thanh Đại Đế", harm: "Giảm thọ mười hai năm" },
    "8-6": { reason: "Lôi trai", harm: "Giảm thọ" },
    "8-8": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "8-10": { reason: "Vía Bắc Đẩu Đại Đế", harm: "" },
    "8-12": { reason: "Vía Tây Phương Ngũ Đạo", harm: "" },
    "8-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "8-15": { reason: "Nguyệt vọng, Thái Âm triều nguyên, Tứ Thiên Vương tuần hành", harm: "Chết đột ngột" },
    "8-16": { reason: "Thiên Tào Lược Loát Chân Quân giáng hạ", harm: "Nghèo nàn, chết yểu" },
    "8-18": { reason: "Ngày trời người tăng phước", harm: "" },
    "8-23": { reason: "Tứ Thiên Vương tuần hành, vía Hán Hoàn Hầu Trương Hiển Vương", harm: "" },
    "8-24": { reason: "Vía Táo Quân phu nhân", harm: "" },
    "8-25": { reason: "Ngày Nguyệt Hối", harm: "Giảm thọ" },
    "8-27": { reason: "Đẩu giáng, vía Chí Thánh Tiên Sư Khổng Tử, Dương công kỵ", harm: "Giảm tài lộc, giảm thọ mười hai năm" },
    "8-28": { reason: "Nhân thần nhóm họp cõi âm, tứ thiên họp mặt nghị sự", harm: "Bị bệnh" },
    "8-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "8-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành, chư thần tra xét", harm: "Giảm thọ" },
    "9-1": { reason: "Nguyệt sóc, vía Nam Đẩu, chín vị tinh quân thuộc Bắc Đẩu giáng hạ", harm: "Giảm lộc, giảm thọ mười hai năm" },
    "9-3": { reason: "Vía Ngũ Ôn Thần", harm: "" },
    "9-8": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "9-9": { reason: "Vía Đẩu Mẫu, vía Phong Đô Đại Đế, Huyền Thiên Thượng Đế phi thăng", harm: "Giảm lộc, giảm thọ mười hai năm" },
    "9-10": { reason: "Đẩu Mẫu giáng hạ", harm: "Giảm thọ mười hai năm" },
    "9-11": { reason: "Nên kiêng cử", harm: "" },
    "9-13": { reason: "Vía Mạnh Bà tôn thần", harm: "" },
    "9-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "9-15": { reason: "Nguyệt vọng, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "9-17": { reason: "Vía Kim Long tứ đại vương", harm: "Bị tai nạn về nước" },
    "9-19": { reason: "Nhật Cung Nguyệt Cung hội hợp, Quán Thế Âm Bồ Tát xuất gia", harm: "Giảm thọ" },
    "9-23": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "9-25": { reason: "Nguyệt Hối, Dương công kỵ", harm: "Giảm thọ" },
    "9-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "9-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "9-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "9-30": { reason: "Khánh đản Dược Sư Lưu Ly Quang Phật, Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Bệnh nguy ngập, giảm thọ" },
    "10-1": { reason: "Nguyệt Hối, Dân Tuế lạp, Tứ Thiên Vương giáng hạ", harm: "Giảm thọ, chết trong vòng một năm" },
    "10-3": { reason: "Đẩu giáng, vía Tam Mao", harm: "Giảm thọ mười hai năm" },
    "10-5": { reason: "Ngày Hạ Hội, khánh đản tổ sư Đạt Ma", harm: "Tổn thọ" },
    "10-6": { reason: "Thiên tào khảo sát", harm: "Giảm thọ mười hai năm" },
    "10-8": { reason: "Ngày Phật nhập Niết Bàn, đại kỵ sắc dục, Tứ Thiên Vương tuần hành", harm: "" },
    "10-10": { reason: "Tứ Thiên Vương giáng hạ", harm: "Trong vòng một năm sẽ chết" },
    "10-11": { reason: "Nên kiêng sắc dục", harm: "" },
    "10-14": { reason: "Tam Nguyên giáng, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "10-15": { reason: "Nguyệt vọng, Tam Nguyên giáng, Hạ Nguyên Thủy Phủ kiểm sổ sách, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "10-16": { reason: "Tam Nguyên giáng", harm: "" },
    "10-23": { reason: "Dương công kỵ, Tứ Thiên Vương tuần hành", harm: "" },
    "10-25": { reason: "Ngày Nguyệt Hối", harm: "Giảm thọ" },
    "10-27": { reason: "Đẩu giáng, Bắc Cực Tử Vi Đại Đế giáng hạ", harm: "Giảm thọ mười hai năm" },
    "10-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "10-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "10-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "11-1": { reason: "Nguyệt Sóc", harm: "Giảm thọ mười hai năm" },
    "11-3": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "11-4": { reason: "Vía Chí Thánh Tiên Sư Khổng Tử", harm: "Giảm lộc, giảm thọ mười hai năm" },
    "11-6": { reason: "Vía Tây Nhạc Đại Đế", harm: "Giảm lộc, giảm thọ mười hai năm" },
    "11-8": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "11-11": { reason: "Ngày trời đất mở kho, vía Thái Ất Cứu Khổ Thiên Tôn", harm: "Giảm thọ mười hai năm" },
    "11-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "11-15": { reason: "Nguyệt vọng, Tứ Thiên Vương tuần hành", harm: "" },
    "11-17": { reason: "Khánh đản A Di Đà Phật", harm: "" },
    "11-19": { reason: "Vía Thái Dương Nhật Cung", harm: "Tai họa oái ăm" },
    "11-21": { reason: "Dương công kỵ", harm: "Tuyệt tự" },
    "11-23": { reason: "Vía Trương Tiên, Tứ Thiên Vương tuần hành", harm: "" },
    "11-25": { reason: "Lược Loát Đại Phu giáng hạ, ngày Nguyệt Hối", harm: "Đại hung" },
    "11-26": { reason: "Vía Bắc Phương Ngũ Đạo", harm: "" },
    "11-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "11-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "11-29": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "11-30": { reason: "Nguyệt Hối – Tư Mạng báo cáo, Tứ Thiên Vương tuần hành", harm: "Giảm thọ" },
    "12-1": { reason: "Nguyệt Sóc", harm: "Giảm thọ mười hai năm" },
    "12-3": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "12-6": { reason: "Ngày mở kho trời đất, Lôi trai nhật", harm: "Giảm thọ" },
    "12-7": { reason: "Lược Loát Đại Phu giáng hạ", harm: "Bệnh ngặt" },
    "12-8": { reason: "Vương hầu lạp, ngày Thích Ca Như Lai thành Phật, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "12-12": { reason: "Thái Tố Tam Nguyên Quân triều chân", harm: "" },
    "12-14": { reason: "Tứ Thiên Vương tuần hành", harm: "" },
    "12-15": { reason: "Nguyệt vọng, Tứ Thiên Vương tuần hành", harm: "Giảm thọ mười hai năm" },
    "12-16": { reason: "Vía Nam Nhạc Đại Đế", harm: "" },
    "12-19": { reason: "Dương công kỵ", harm: "" },
    "12-20": { reason: "Thiên địa giao đạo", harm: "Rút ngắn tuổi thọ" },
    "12-21": { reason: "Ngày vía Thiên Do Thượng Đế", harm: "" },
    "12-23": { reason: "Thần ngũ nhạc giáng hạ, Tứ Thiên Vương tuần hành", harm: "" },
    "12-24": { reason: "Táo Quân chầu trời tâu điều thiện lẽ ác của nhân gian", harm: "Đại họa" },
    "12-25": { reason: "Tam Thanh, Ngọc Đế cùng giáng hạ khảo sát thiện ác.", harm: "" },
    "12-27": { reason: "Đẩu giáng", harm: "Giảm thọ mười hai năm" },
    "12-28": { reason: "Nhân thần nhóm họp cõi âm", harm: "Bị bệnh" },
    "12-29": { reason: "Khánh đản Hoa Nghiêm Bồ Tát, Tứ Thiên Vương tuần hành", harm: "" },
    "12-30": { reason: "Chư thần giáng hạ xem xét thiện ác", harm: "Phạm lỗi hành dâm thì nam lẫn nữ đều chết" }
};

function lunarMonthLength(date: Date, lunar: LunarDay): 29 | 30 {
  const candidate = new Date(date);
  candidate.setDate(date.getDate() + (30 - lunar.day));
  const candidateLunar = solarToLunar(
    candidate.getDate(),
    candidate.getMonth() + 1,
    candidate.getFullYear(),
  );
  return candidateLunar.day === 30 ? 30 : 29;
}

export const HARM_TRANSLATIONS_EN: Record<string, string> = {
  'Giảm thọ mười hai năm': 'Lifespan shortened by twelve years',
  'Giảm thọ': 'Shortened lifespan',
  'Tổn thọ': 'Loss of lifespan',
  'Bị bệnh': 'Afflicted with illness',
  'Mắc bệnh': 'Afflicted with illness',
  'Chết đột ngột': 'Sudden death',
  'Giảm tài lộc, giảm thọ mười hai năm': 'Loss of fortune, lifespan shortened by twelve years',
  'Giảm lộc, giảm thọ mười hai năm': 'Loss of fortune, lifespan shortened by twelve years',
  'Giảm tài lộc': 'Loss of fortune',
  'Giảm lộc': 'Loss of fortune',
  'Nghèo nàn, chết yểu': 'Poverty and untimely death',
  'Sanh ác thai': 'Deformed or ill-omened birth',
  'Trong vòng một năm sẽ chết': 'Death within one year',
  'Giảm thọ, chết trong vòng một năm': 'Shortened lifespan, death within one year',
  'Giảm thọ, tổn thọ, con cái bị bệnh tật.': 'Shortened lifespan, children afflicted with illness',
  'Bị tai nạn về nước': 'Accident involving water',
  'Bệnh nguy ngập, giảm thọ': 'Critical illness, shortened lifespan',
};

export function translateHarmToEn(harm: string): string {
  if (!harm) return '';
  const trimmed = harm.trim();
  if (HARM_TRANSLATIONS_EN[trimmed]) return HARM_TRANSLATIONS_EN[trimmed];
  for (const [vi, en] of Object.entries(HARM_TRANSLATIONS_EN)) {
    if (trimmed.includes(vi)) {
      return en;
    }
  }
  return harm;
}

export function getLunarEvent(date: Date, locale: string = 'vi'): LunarEventNotificationInfo {
  const lunar = solarToLunar(date.getDate(), date.getMonth() + 1, date.getFullYear());
  const monthLength = lunarMonthLength(date, lunar);
  return getLunarEventForLunarDay(lunar, monthLength, locale);
}

/** Shared by the UI and the durable Android calendar rule compiler. */
export function getLunarEventForLunarDay(lunar: LunarDay, monthLength: number, locale = 'vi'): LunarEventNotificationInfo {
  const thapTraiDays = monthLength === 29
    ? [1, 8, 14, 15, 18, 23, 24, 27, 28, 29]
    : [1, 8, 14, 15, 18, 23, 24, 28, 29, 30];

  let eventDay = lunar.day;
  if (
    monthLength === 29
    && lunar.day === 29
    && (VIA_DAYS[`${lunar.month}-30`] || ABSTINENCE_DAYS[`${lunar.month}-30`])
  ) {
    eventDay = 30;
  }

  const key = `${lunar.month}-${eventDay}`;
  const key29 = `${lunar.month}-29`;
  const key30 = `${lunar.month}-30`;
  const isEn = locale === 'en';
  const viaName = lunar.leap ? null : isEn
    ? (VIA_DAYS_EN[key] ?? VIA_DAYS[key] ?? null)
    : (VIA_DAYS[key] ?? null);

  let kiengDam: { harm: string; reason: string } | null = null;
  if (isEn) {
    const enDay = ABSTINENCE_DAYS_EN[key];
    const en29 = ABSTINENCE_DAYS_EN[key29];
    const en30 = ABSTINENCE_DAYS_EN[key30];
    const viRaw = ABSTINENCE_DAYS[key] ?? (monthLength === 29 && lunar.day === 29 ? ABSTINENCE_DAYS[key30] : null);

    if (enDay || en29 || en30) {
      const primary = (monthLength === 29 && lunar.day === 29)
        ? (en29 || en30 || enDay)
        : (enDay || en29);
      const secondary = (monthLength === 29 && lunar.day === 29) ? en30 : null;

      const reason = primary?.reason || secondary?.reason || '';
      let harm = primary?.harm || secondary?.harm || '';
      if (!harm && viRaw?.harm) {
        harm = translateHarmToEn(viRaw.harm);
      } else if (harm) {
        harm = translateHarmToEn(harm);
      }
      if (reason || harm) {
        kiengDam = { reason, harm };
      }
    } else if (viRaw) {
      kiengDam = {
        reason: translateGeneratedReasonToEn(viRaw.reason),
        harm: translateHarmToEn(viRaw.harm),
      };
    }
  } else {
    kiengDam = ABSTINENCE_DAYS[key] ?? null;
  }

  const isThapTrai = thapTraiDays.includes(lunar.day);

  return {
    isEvent: isThapTrai || viaName !== null || kiengDam !== null,
    isThapTrai,
    kiengDam,
    lunarDay: lunar.day,
    lunarMonth: lunar.month,
    lunarYear: lunar.year,
    lunarLeap: lunar.leap,
    viaName,
    viaKey: viaName ? key : null,
  };
}

const GENERATED_REASON_TRANSLATIONS_EN: Record<string, string> = {
  'Ngày Thập Trai, Tứ Thiên Vương và chư thiên tuần hành khảo sát thiện ác': 'Ten Fasting Days observance; the Four Heavenly Kings and celestial beings inspect good and evil deeds',
  'Ngày Canh Thân – thần Tam Thi lên trời tâu các tội ác của con người': 'Canh Than day — the Tam Thi spirits report human wrongdoing to heaven',
  'Ngày Giáp Tý – đứng đầu Lục Thập Hoa Giáp, thiên địa hợp đức, vạn thần triều hội': 'Giap Ty day — first of the sixty-day cycle; heaven and earth are in harmony and all deities assemble',
  'Ngày Canh Thân (thần Tam Thi lên trời tâu các tội ác của con người)': 'Canh Than day (the Tam Thi spirits report human wrongdoing to heaven)',
  'Ngày Giáp Tý (thiên địa hợp đức, vạn thần triều hội)': 'Giap Ty day (heaven and earth are in harmony; all deities assemble)',
};

function translateGeneratedReasonToEn(reason: string): string {
  let translated = reason;
  for (const [source, english] of Object.entries(GENERATED_REASON_TRANSLATIONS_EN)) {
    translated = translated.replace(source, english);
  }
  return translated;
}

export function localizeLunarEvent(
  info: LunarEventNotificationInfo | null,
  locale: string
): LunarEventNotificationInfo | null {
  if (!info) return null;
  if (locale !== 'en') return info;

  const key = `${info.lunarMonth}-${info.lunarDay}`;
  const key30 = `${info.lunarMonth}-30`;
  const enVia = info.lunarLeap ? null : VIA_DAYS_EN[info.viaKey || key] || info.viaName;
  
  const dayEnKieng = ABSTINENCE_DAYS_EN[key];
  const day30EnKieng = ABSTINENCE_DAYS_EN[key30];

  let reason = '';
  let harm = '';

  if (dayEnKieng) {
    reason = dayEnKieng.reason;
    harm = dayEnKieng.harm;
    // Nếu ngày 29 (tháng thiếu gộp ngày 30) mà ngày 29 chưa có harm, lấy harm ngày 30:
    if (!harm && info.lunarDay === 29 && day30EnKieng?.harm) {
      harm = day30EnKieng.harm;
      if (day30EnKieng.reason && !reason.includes(day30EnKieng.reason)) {
        reason = `${reason} — ${day30EnKieng.reason}`;
      }
    }
  } else if (info.lunarDay === 29 && day30EnKieng) {
    reason = day30EnKieng.reason;
    harm = day30EnKieng.harm;
  } else if (info.kiengDam) {
    reason = translateGeneratedReasonToEn(info.kiengDam.reason);
    harm = translateHarmToEn(info.kiengDam.harm);
  }

  // Đảm bảo không bao giờ lọt chữ tiếng Việt trong harm
  if (harm) {
    harm = translateHarmToEn(harm);
  } else if (info.kiengDam?.harm) {
    harm = translateHarmToEn(info.kiengDam.harm);
  }

  return {
    ...info,
    viaName: enVia,
    kiengDam: (reason || harm) ? { reason, harm } : null
  };
}
