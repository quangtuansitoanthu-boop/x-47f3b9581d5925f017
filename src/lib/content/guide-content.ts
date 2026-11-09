export type GuideEditorialStatus = 'verified-software' | 'verified' | 'pending-doctrinal-review';

export interface GuideItem {
  title: string;
  text: string;
}

export type GuideBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'steps'; items: GuideItem[] }
  | { type: 'cards'; items: GuideItem[] }
  | { type: 'bullets'; title?: string; items: string[] }
  | { type: 'callout'; tone: 'note' | 'warning'; title: string; text: string }
  | { type: 'quote'; title: string; lines: string[] }
  | { type: 'link'; href: string; label: string; text: string; buttonLabel?: string; externalActions?: boolean };

export interface GuideTopic {
  id: string;
  title: string;
  keywords: string[];
  blocks: GuideBlock[];
}

export interface GuideFaq {
  id: string;
  question: string;
  keywords: string[];
  answer: string[];
  editorialStatus: GuideEditorialStatus;
}

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  shortTitle: string;
  keywords: string[];
  editorialStatus: GuideEditorialStatus;
  introduction: string[];
  topics: GuideTopic[];
  faqs?: GuideFaq[];
}

export interface GuideSearchTarget {
  id: string;
  sectionId: string;
  kind: 'section' | 'topic' | 'faq';
  title: string;
  context: string;
  keywords: string[];
}

export const guideInstallTarget: GuideSearchTarget = {
  id: 'cai-app',
  sectionId: 'cai-app',
  kind: 'section',
  title: 'Cài đặt ứng dụng lên màn hình',
  context: 'Cài App',
  keywords: ['cài app', 'pwa', 'màn hình chính', 'offline', 'quên cài app', 'ios', 'android'],
};

export const softwareGuideSections: GuideSection[] = [
  {
    id: 'dung-web',
    icon: '📱',
    title: 'Hướng dẫn sử dụng ứng dụng',
    shortTitle: 'Dùng App',
    keywords: ['trang chủ', 'tìm kiếm', 'dark mode', 'chế độ tối', 'epub', 'công phu'],
    editorialStatus: 'verified-software',
    introduction: [
      'Ứng dụng được thiết kế tối ưu, hiển thị đẹp và mượt mà trên điện thoại, có chế độ sáng/tối bảo vệ mắt.',
    ],
    topics: [
      {
        id: 'trang-chu-va-tim-kiem',
        title: 'Trang Chủ — Kho bài viết & sách hay',
        keywords: ['tìm bài', 'danh mục', 'nhân quả', 'kinh phật', 'epub'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn nội dung",
                "text": "Trang chủ hiển thị nội dung và gợi ý; vào Kinh sách để tìm sách theo tên hoặc danh mục, vào Tu tập để chọn kinh, chú và nghi thức."
              },
              {
                "title": "Đọc và đọc tiếp",
                "text": "Mở bài để xem các công cụ phù hợp với sách văn bản hoặc PDF. Dùng Đang đọc dở để tiếp tục từ vị trí được lưu; đổi giao diện sáng/tối bằng nút giao diện."
              },
              {
                "title": "Kiểm tra nội dung mới",
                "text": "Ở cuối Trang chủ, bấm Cập nhật nội dung khi muốn kiểm tra sách, kinh, nghi thức và album mới hoặc đã sửa. Xem dung lượng trước khi xác nhận tải."
              }
            ]
          }
        ],
      },
      {
        id: 'tu-tap-tren-web',
        title: 'Trang Tu Tập — Khóa tụng & công phu hằng ngày',
        keywords: ['bắt đầu công phu', 'lễ phật', 'thiền định', 'lần hạt', 'fab', 'nút nổi', 'mõ', 'nhạc thiền', 'tự động cuộn'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn công cụ hoặc bài tụng",
                "text": "Vào Tu tập để chọn thiền, tràng hạt, Lễ Phật, Giữ giới thanh tịnh, Tiết dục bảo thân, Chép kinh hoặc danh mục kinh, chú và nghi thức. Các mục đang hỗ trợ được hiển thị trên màn hình."
              },
              {
                "title": "Xem trước và bắt đầu",
                "text": "Chọn bài, mở mục lục nếu có và đọc hướng dẫn trước khi Vào chế độ tu tập hoặc Bắt đầu Công phu. Dùng Công cụ để chỉnh chữ, cuộn và âm thanh theo các nút được cung cấp."
              },
              {
                "title": "Kết thúc thời khóa",
                "text": "Dùng nút kết thúc/quay lại và kiểm tra hộp thoại xác nhận. Chỉ ghi nhận số biến, số lạy hoặc thời gian đúng với phần đã thực hành."
              }
            ]
          }
        ],
      },
      {
        "id": "giao-dien-va-chuyen-dong",
        "title": "Giao diện, ngôn ngữ và hiệu ứng chuyển động",
        "keywords": [
          "hiệu ứng chuyển động",
          "gợn nước",
          "giảm chuyển động",
          "cỡ chữ"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở tùy chọn hiển thị",
                "text": "Vào Cá nhân > Cài đặt app, mở Giao diện & ngôn ngữ để đổi giao diện, ngôn ngữ, cỡ chữ và Hiệu ứng chuyển động."
              },
              {
                "title": "Bật hoặc tắt hiệu ứng",
                "text": "Hiệu ứng chuyển động mặc định bật. Tắt để dừng gợn nước ở tràng hạt và thiền; bộ đếm, đồng hồ và âm thanh vẫn dùng các điều khiển riêng. Lựa chọn được lưu trên thiết bị."
              },
              {
                "title": "Tôn trọng cài đặt thiết bị",
                "text": "Nếu hệ thống bật Giảm chuyển động, hiệu ứng vẫn dừng dù công tắc trong app đang bật."
              }
            ]
          }
        ]
      },
      {
        "id": "widget-man-hinh-chinh",
        "title": "Widget màn hình chính",
        "keywords": [
          "widget",
          "lịch",
          "pháp thoại",
          "tu tập",
          "màn hình chính"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Thêm widget",
                "text": "Trên Android hoặc iOS, mở phần thêm widget của màn hình chính, tìm ứng dụng rồi chọn cỡ phù hợp. Các loại được sắp theo thứ tự Lịch, Pháp thoại, Tu tập; cách trình bày danh sách còn tùy launcher hoặc hệ điều hành."
              },
              {
                "title": "Chạm đúng nội dung",
                "text": "Widget Lịch mở lịch/ngày tương ứng; Pháp thoại dùng trình phát chung của app để mở hoặc tiếp tục bài; Tu tập mở công cụ hoặc nội dung được hiển thị. Chạm mở công cụ không tự ghi nhận hoàn thành công phu."
              },
              {
                "title": "Khi nội dung chưa sẵn sàng",
                "text": "Mở app để chọn bài, cập nhật dữ liệu hoặc hoàn tất tải offline. Phát audio cần mạng nếu chưa tải. Thời điểm hệ thống làm mới widget có thể trễ; widget không bảo đảm cập nhật đúng từng phút."
              }
            ]
          }
        ]
      },
      {
        id: 'dong-bo-nut-quay-lai-android',
        title: 'Nút Quay lại (Back) của Android & Trình duyệt',
        keywords: ['quay lai', 'nut back', 'android', 'vuot canh', 'thoat sach', 'muc luc', 'tro ve', 'cu chi'],
        blocks: [
          {
            type: 'paragraph',
            text: 'Ứng dụng hỗ trợ đầy đủ phím Back vật lý và cử chỉ vuốt cạnh màn hình trên điện thoại Android, hoạt động tương đương nút Quay lại (‹--) trên giao diện ứng dụng giúp bạn thao tác liền mạch mà không bị thoát ứng dụng:',
          },
          {
            type: 'cards',
            items: [
              {
                title: 'Khi đọc sách & PDF',
                text: 'Nếu đang đọc một chương sách: Bấm Back sẽ đưa bạn quay về Mục lục sách. Nếu đang ở Mục lục: Bấm Back sẽ đóng sách quay lại danh sách Thư viện. Nếu đang mở bảng Công cụ hoặc phóng to ảnh: Bấm Back sẽ hạ bảng công cụ / đóng ảnh trước.',
              },
              {
                title: 'Khi thực hành Tu tập',
                text: 'Đang xem trước bài kinh: Bấm Back quay về Mục lục chương hoặc danh mục Tu tập. Đang trong khóa tụng: Bấm Back sẽ hiện hộp thoại xác nhận thoát để không mất tiến độ. Đang lần chuỗi hạt ảo: dùng Quay lại hoặc Kết thúc phiên, kiểm tra xác nhận và trạng thái lưu trước khi rời màn hình. Đang trong chế độ Lễ Phật: Bấm Back hoặc nút Thoát sẽ hiện hộp thoại xác nhận số lạy để ghi nhận công đức trước khi rời đi.',
              },
              {
                title: 'Khi nghe Pháp thoại',
                text: 'Khi đang mở xem danh sách bài giảng trong một Album: Bấm nút Back sẽ quay trở lại danh sách các Album bài giảng.',
              },
            ],
          },
        ],
      },
      {
        id: 'doc-offline-khong-can-mang',
        title: 'Đọc Ngoại Tuyến (Offline) — Không cần Internet',
        keywords: ['offline', 'ngoại tuyến', 'không có mạng', 'mất mạng', 'chế độ máy bay'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Nội dung có sẵn và nội dung cần tải",
                "text": "Bản app mới đóng sẵn các nội dung văn bản được hỗ trợ, gồm KINH DUY MA CẬT SỞ THUYẾT (14 phẩm) và KINH NIỆM PHẬT BA LA MẬT (7 phẩm). Sách PDF và album có thể mới gồm bìa, giới thiệu và mục lục; tệp PDF, audio hoặc video cần tải riêng. Nội dung bổ sung phải tải hoàn tất trên thiết bị."
              },
              {
                "title": "Kiểm tra trước khi đi offline",
                "text": "Mở nội dung cần đọc hoặc nghe, kiểm tra đã tải xong rồi thử khi tắt mạng. Ảnh minh họa hoặc một số tài liệu có thể cần tải thêm."
              },
              {
                "title": "Dữ liệu lưu trên máy",
                "text": "Vị trí đọc và các mục được hỗ trợ lưu trên thiết bị. Xóa dữ liệu app, gỡ app hoặc xóa bộ nhớ trình duyệt có thể làm mất bản offline; đăng nhập không tự chuyển các tệp đã tải sang máy khác."
              },
              {
                "title": "Bản tiếng Anh",
                "text": "Khi chuyển sang tiếng Anh, theo dõi tiến trình tải gói sách. Chờ hoàn tất trước khi đọc offline; nếu dừng hoặc lỗi, dùng nút thử lại khi có mạng và đủ dung lượng."
              }
            ]
          }
        ],
      },
      {
        "id": "cap-nhat-noi-dung",
        "title": "Cập nhật nội dung thủ công",
        "keywords": [
          "cập nhật nội dung",
          "sách mới",
          "dung lượng tải"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Kiểm tra khi cần",
                "text": "Kéo xuống cuối Trang chủ và bấm Cập nhật nội dung. App kiểm tra khi bạn bấm; mở trang hướng dẫn không tự kiểm tra hay tải nội dung."
              },
              {
                "title": "Xem dung lượng và xác nhận",
                "text": "Xem dung lượng MB ước tính rồi chọn Tải nội dung. Sách thường, kinh và nghi thức tải đầy đủ; PDF và album Pháp thoại chỉ tải bìa cùng danh sách. Tải tệp PDF trong màn hình đọc, tải audio trong album."
              },
              {
                "title": "Thử lại khi chưa hoàn tất",
                "text": "Mục lỗi vẫn giữ bản đã lưu trước đó. Bấm Kiểm tra lại để thử mục còn thiếu; mục đã tải xong và không đổi phiên bản sẽ được bỏ qua."
              },
              {
                "title": "Phân biệt nội dung và phiên bản app",
                "text": "Nút này cập nhật nội dung được hỗ trợ, không thay mã ứng dụng. Giao diện hoặc công cụ mới có thể cần cập nhật ứng dụng qua cửa hàng hoặc gói cài phù hợp với thiết bị."
              }
            ]
          }
        ]
      }
    ],
  },
  {
    id: 'doc-sach',
    icon: '📖',
    title: 'Đọc sách, PDF và trích dẫn',
    shortTitle: 'Đọc Sách',
    keywords: ['pdf', 'hai trang', 'thumbnail', 'mục lục', 'sepia', 'highlight', 'ghi chú', 'tts', 'offline'],
    editorialStatus: 'verified-software',
    introduction: [
      'Giao diện đọc sách thông minh: tự nhớ trang đã đọc, phóng to chữ, nghe đọc tự động và ghi nhớ những câu tâm đắc.',
    ],
    topics: [
      {
        id: 'doc-pdf',
        title: 'Đọc sách văn bản và tài liệu PDF',
        keywords: ['two page', 'hai trang song song', 'outline', 'thumbnail', 'zoom', 'vừa màn hình', 'sepia'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Chế độ một hoặc hai trang', text: 'Trên máy tính hay máy tính bảng, bật chế độ 2 trang để đọc như lật cuốn sách thật; trên điện thoại sẽ tự động hiển thị 1 trang gọn đẹp.' },
              { title: 'Mục lục & Chuyển bài nhanh', text: 'Nhấn vào Mục lục để chọn nhanh các phẩm/chương, hoặc dùng 2 nút mũi tên ‹ Bài trước / Bài tiếp › ở đầu trang.' },
              { title: 'Tự động ẩn thanh công cụ', text: 'Khi bạn lướt cuộn đọc (cả sách thường lẫn sách PDF trên điện thoại), thanh trên cùng sẽ tự động trượt ẩn đi giúp chữ tràn viền đọc thoáng mắt; chỉ cần vuốt nhẹ ngược lên là thanh menu hiện lại ngay.' },
              { title: 'Đánh dấu trang & Danh sách đánh dấu (PDF)', text: 'Thanh nổi dưới đáy trang PDF cho phép bấm 🔖 để đánh dấu trang hiện tại hoặc mở danh sách các trang đã đánh dấu để nhảy nhanh tới trang cần đọc. Chữ và danh sách hiển thị sáng rõ, tương phản cao trên cả nền sáng lẫn nền tối (Dark Mode).' },
              { title: 'Đổi cỡ chữ & màu nền', text: 'Có thể tăng giảm kích cỡ chữ A- / A+, chọn nền Be nhạt chống mỏi mắt hoặc nền Đen ban đêm cực kỳ êm dịu.' },
            ],
          },
        ],
      },
      {
        id: 'chi-tiet-thanh-cong-cu-doc',
        title: 'Hướng dẫn trọn bộ các nút trong bảng “⚙ Công cụ”',
        keywords: ['công cụ đọc', 'cỡ chữ', 'phông chữ', 'chữ đậm', 'khoảng cách dòng', 'nền giấy', 'đánh dấu', 'nghe bài', 'chia sẻ', 'tải về', 'cuộn tự động'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: '1. Cỡ chữ (A− / A+)', text: 'Bấm A− để thu nhỏ chữ hoặc A+ để phóng to chữ đến kích thước mắt bạn nhìn rõ nhất (từ 13px đến 45px).' },
              { title: '2. Phông chữ', text: 'Chọn kiểu phông yêu thích: Bookerly (phông sách kinh điển), Merriweather, Literata hoặc San Francisco.' },
              { title: '3. Trình bày (Chữ đậm B & Khoảng cách dòng)', text: 'Nhấn nút B để bật/tắt chữ đậm toàn bài giúp nét chữ dày dặn hơn; chọn 1.6×, 1.9× hoặc 2.2× để giãn khoảng cách dòng thưa hoặc khít.' },
              { title: '4. Nền giấy đọc sách', text: 'Gồm 4 màu nền tùy chọn: Trắng (sáng rõ), Be nhạt (nền kem ấm mắt, chống mỏi khi đọc lâu), Xám (trang nhã) và Tối (đen dịu cho ban đêm).' },
              { title: '5. Lưu lại (Dấu trang 🔖)', text: 'Bấm để đánh dấu vị trí trang đang đọc dở. Dải ruy băng vàng sẽ hiện ở góc trên, lần sau mở ra bạn chỉ cần bấm vào dải ruy băng để nhảy ngay tới đoạn đó.' },
              { title: '6. Nghe bài (🔊 Giọng đọc TTS)', text: 'Bấm 🔊 để máy tự động đọc toàn bài cho bạn nghe. Có thể chọn Giọng Nữ, Giọng Nam và tăng giảm tốc độ đọc (0.8× chậm rãi, 1.0× chuẩn, 1.2× nhanh).' },
              { title: '7. Chia sẻ (📤)', text: 'Bấm nút Chia sẻ để sao chép đường dẫn (link) bài đọc gửi cho người thân, đạo hữu hoặc chia sẻ trực tiếp lên Zalo, Facebook.' },
              { title: '8. Tải về (Tải file sách EPUB)', text: 'Với các bộ sách nhiều tập, nút Tải về cho phép xuất trọn bộ thành file sách điện tử (.epub) để bạn đưa vào máy đọc sách Kindle, Kobo hoặc ứng dụng Books trên điện thoại.' },
              { title: '9. Cuộn tự động (⬇️)', text: 'Bấm Cuộn để trang sách tự trôi từ từ theo tầm mắt mà bạn không cần chạm tay vào màn hình. Có thể chọn tốc độ: Rất chậm, Chậm, Vừa hoặc Nhanh.' },
              { title: '10. Đóng (✕) & Quay lại', text: 'Nhấn dấu ✕, nút Quay lại (‹--) ở góc trên hoặc dùng phím Back / vuốt cạnh màn hình trên điện thoại để quay về Mục lục hoặc danh sách bài viết.' },
            ],
          },
        ],
      },
      {
        id: 'ghi-chu-va-trich-dan',
        title: 'Tô sáng câu hay & mục Trích dẫn của tôi',
        keywords: ['highlight', 'annotation', 'ghi chú cá nhân', 'my quotes', 'trích dẫn của tôi', 'bôi đen'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Lưu đoạn tâm đắc",
                "text": "Bôi chọn văn bản rồi dùng Lưu trích dẫn hoặc Ghi chú khi xuất hiện. PDF cần có lớp văn bản để chọn; ảnh quét không phải lúc nào cũng chọn được chữ."
              },
              {
                "title": "Xem và giữ bản lưu",
                "text": "Mở Trích dẫn của tôi để xem lại, sửa ghi chú hoặc dùng các tùy chọn được hiển thị. Đăng nhập và kiểm tra đồng bộ trước khi đổi máy; dữ liệu chỉ trên thiết bị hoặc chưa đồng bộ vẫn có thể mất nếu xóa app."
              }
            ]
          }
        ],
      },
      {
        id: 'pdf-nghe-va-offline',
        title: 'Nghe đọc tự động (TTS) & Đọc khi không có mạng',
        keywords: ['tts', 'đọc thành tiếng', 'nghe trang này', 'indexeddb', 'mất mạng', 'lưu offline', '80 mb'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Nghe đọc bằng TTS",
                "text": "Bấm Nghe bài nếu nội dung hỗ trợ đọc thành tiếng. Giọng và chất lượng phụ thuộc giọng đọc đã cài trên thiết bị; có thể cần tải giọng trong cài đặt hệ thống. PDF ảnh quét có thể không có văn bản để đọc."
              },
              {
                "title": "Lưu PDF offline",
                "text": "Mở sách PDF rồi chọn Lưu đọc Offline. Đợi tải xong trước khi tắt mạng. Cập nhật danh sách sách chỉ tải bìa và thông tin PDF, không tải toàn bộ tệp."
              },
              {
                "title": "Nội dung và công cụ khác nhau",
                "text": "Sách văn bản có điều chỉnh chữ và cuộn tự động; PDF có các công cụ trang, phóng to và đánh dấu riêng. Chỉ sử dụng các nút được hiển thị cho tài liệu đang mở."
              }
            ]
          }
        ],
      },
    ],
  },
  {
    id: 'cong-cu-tu-tap',
    icon: '📿',
    title: 'Công cụ và tiến độ tu tập',
    shortTitle: 'Tu Tập',
    keywords: ['lễ phật', 'sám hối', 'lạy phật', 'chiêm bái', 'chư phật', 'đếm lạy', '108 lạy', 'tràng hạt', 'rosary', 'tọa thiền', 'timer', 'mục tiêu', 'gợi ý', 'heatmap', 'cộng tu'],
    editorialStatus: 'verified-software',
    introduction: [
      'Bộ công cụ hỗ trợ công phu chuyên sâu: chế độ lễ Phật sám hối chiêm bái chư Phật, chuỗi tràng hạt ảo niệm Phật, hẹn giờ tọa thiền chuông tĩnh tâm, lịch Thập trai và bảng theo dõi tiến độ hằng ngày.',
    ],
    topics: [
      {
        id: 'che-do-le-phat',
        title: 'Chế độ Lễ Phật & Sám Hối (Chiêm bái & Đếm lạy thông minh)',
        keywords: [
          'lễ phật',
          'sám hối',
          'lạy phật',
          'đếm lạy',
          'chiêm bái',
          'chư phật',
          'bồ tát',
          'chuông lễ phật',
          'mõ gõ',
          'nhạc thiền',
          'wake lock',
          'sổ công phu',
          '108 lạy',
          '21 lạy',
          'tam quy',
        ],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn tôn tượng và mục tiêu",
                "text": "Mở Lễ Phật & Sám Hối trong Tu tập. Vuốt hoặc dùng mũi tên để chọn một trong 14 tôn tượng; mở phần thông tin để đọc hồ sơ gồm 6 mục, có sự tích cảm ứng. Nội dung hồ sơ hiện bằng tiếng Việt. Chọn mục tiêu và âm thanh phù hợp; mục tiêu không phải số lạy đã thực hiện."
              },
              {
                "title": "Bắt đầu và đếm lạy",
                "text": "Bấm Bắt đầu Lễ Phật. Sau mỗi lạy, bấm nút “Chạm để đảnh lễ một lạy” ở cuối màn hình. Mỗi lần bấm tăng một lạy, kèm chuông hoặc mõ nếu đã bật. App không tự nhận biết động tác lạy."
              },
              {
                "title": "Kiểm tra trước khi lưu",
                "text": "Bấm Hoàn tất để xem số đã đếm. Có thể chỉnh số thực tế, chọn Tiếp tục lễ Phật để quay lại mà giữ số đếm, hoặc Thoát không lưu."
              },
              {
                "title": "Ghi vào sổ công phu",
                "text": "Xác nhận ghi nhận để lưu số lạy và tôn tượng vào Sổ công phu. Thời khóa mới bắt đầu từ 0. Việc giữ sáng màn hình phụ thuộc hỗ trợ và trạng thái thiết bị."
              }
            ]
          },
          {
            "type": "link",
            "href": "/tu-tap?mode=le-phat",
            "label": "Mở Lễ Phật & Sám Hối",
            "text": "Chọn tôn tượng, mục tiêu và âm thanh cho thời khóa.",
            "buttonLabel": "Vào Lễ Phật"
          }
        ],
      },
      {
        "id": "trang-hat-ao",
        "title": "Tràng Hạt Ảo — Thủ công & Nhịp mõ tự động",
        "keywords": [
          "digital rosary",
          "vuốt hạt",
          "rung",
          "haptic",
          "108 hạt",
          "nhịp mõ tự động",
          "30 nhịp",
          "40 nhịp",
          "60 nhịp",
          "80 nhịp"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn cách lần hạt",
                "text": "Mở Chuỗi hạt, chọn danh hiệu, số hạt và mục tiêu bằng bộ chọn hiện có. Thủ công: chạm hoặc vuốt sau mỗi câu niệm. Tự động gõ mõ: chọn số hạt của phiên rồi bấm Bắt đầu; không cần chạm để chuyển từng hạt."
              },
              {
                "title": "Chọn nhịp mõ",
                "text": "Rất chậm: 2 giây một nhịp (30 nhịp/phút); Chậm: 1,5 giây (40 nhịp/phút); Vừa: 1 giây (60 nhịp/phút); Tinh tấn: 0,75 giây (80 nhịp/phút). Chọn nhịp phù hợp với hơi thở và câu niệm của mình."
              },
              {
                "title": "Tạm dừng và hoàn thành",
                "text": "Mỗi tiếng mõ tương ứng một biến. Chọn Số biến trong phiên với các mức đến 10.800 biến. Bấm Tạm dừng để nghỉ, Tiếp tục để hành trì tiếp. Khi đủ số biến đã đặt, nhịp mõ kết thúc, có ba tiếng chuông xả niệm rồi chuyển sang phần kết thúc và hồi hướng. Không bấm lặp để cộng thêm số đếm."
              }
            ]
          },
          {
            "type": "paragraph",
            "text": "Chế độ nâng cao tự động gõ mõ, quý phật tử nhiếp tâm sâu sắc vào câu niệm phật, câu chú hoặc danh hiệu bổn tôn của quý vị vào tiềm thức để dễ bước vào cảnh giới \"Bất niệm tự niệm\""
          },
          {
            "type": "paragraph",
            "text": "Lắng nghe từng tiếng mõ và trở về câu niệm khi tâm tán loạn. Âm thanh nền và rung phụ thuộc khả năng của thiết bị, trình duyệt và việc hệ điều hành ngắt audio; nhịp chỉ đếm theo âm thanh thực sự được phát, không cộng bù theo thời gian đã tạm dừng."
          }
        ]
      },
      {
        "id": "so-quan-chieu-ca-nhan",
        "title": "Sổ Quán Chiếu — Nhìn lại Thân, Khẩu, Ý",
        "keywords": [
          "sổ soi tâm",
          "sổ quán chiếu",
          "nhật ký riêng tư",
          "việc thiện lành",
          "biệt danh"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Dành vài phút cuối ngày",
                "text": "Trong Sổ quán chiếu, ghi riêng điều cần sám hối và việc thiện lành đã làm. Nhìn lại Thân, Khẩu, Ý với tâm chân thành và ghi nhận điều mình muốn chuyển hóa."
              },
              {
                "title": "Lưu riêng tư trên máy",
                "text": "Lưu riêng tư là lựa chọn mặc định. Nội dung nhật ký riêng không được đưa vào đồng bộ server. Việc lưu phụ thuộc bộ nhớ thiết bị; nếu ứng dụng báo lỗi lưu, hãy giữ nội dung và thử lại trước khi rời màn hình."
              },
              {
                "title": "Đặt biệt danh trước khi chia sẻ",
                "text": "Biệt danh cộng đồng có thể chỉnh sửa. Bảng tin chỉ hiển thị biệt danh; không dùng tên tài khoản, email hoặc avatar cá nhân. Chỉ phần sám hối hoặc việc thiện anh/chị chọn và xác nhận chia sẻ mới được gửi lên cộng đồng."
              }
            ]
          }
        ]
      },
      {
        "id": "cong-dong-sam-hoi-tuy-hy",
        "title": "Cộng Đồng — Sám hối & Tùy hỷ công đức",
        "keywords": [
          "cộng đồng",
          "phát lồ",
          "tùy hỷ",
          "cầu nguyện",
          "động viên",
          "bài của tôi"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn đúng bảng tin",
                "text": "Phát Lồ Sám Hối hiển thị lời sám hối; Tùy Hỷ Thiện Lành hiển thị việc thiện được chia sẻ. Bài của tôi giúp xem bài mình đã gửi và những lời động viên, tùy hỷ đã nhận. Bấm xem thêm để mở trang kế tiếp."
              },
              {
                "title": "Gửi một lời nguyện mẫu",
                "text": "Chọn lời cầu nguyện hoặc lời tán thán trong bộ chọn rồi xác nhận gửi. Không có bình luận tự do. Mỗi tài khoản chỉ gửi lời động viên hoặc tùy hỷ một lần trên mỗi bài, kể cả khi đổi biệt danh hoặc dùng thiết bị khác. Nút Đã gửi/Đã tùy hỷ cho biết tương tác đã được ghi nhận."
              },
              {
                "title": "Chia sẻ và gỡ bài",
                "text": "Đọc kỹ lời dẫn trong hộp thoại trước khi chia sẻ. Bài đăng là nội dung công khai; tránh tự ghi thông tin riêng của mình hoặc người khác. Trong Bài của tôi, có thể xác nhận gỡ bài của chính mình. Bài đã gửi không làm nhật ký riêng còn lại trở thành công khai."
              }
            ]
          },
          {
            "type": "paragraph",
            "text": "Hoan hỷ tán thán việc thiện của người khác được hưởng trọn phần phước đức to lớn ngang bằng."
          }
        ]
      },
      {
        "id": "khoa-le-hang-ngay",
        "title": "Khóa Lễ Hằng Ngày — Hành trì liền mạch",
        "keywords": [
          "khóa lễ",
          "thời khóa",
          "lễ phật",
          "tọa thiền",
          "niệm phật",
          "hồi hướng tùy chỉnh"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Tạo thời khóa riêng",
                "text": "Tại màn Tu tập chính, mở Thời khóa gợi ý → Thời khóa của tôi để tạo Thời Khóa Sáng, Thời Khóa Tối hoặc đặt tên theo ý mình. Thêm, bỏ và sắp xếp các bước Lễ Phật, Tọa thiền, Niệm Phật và Hồi hướng; đặt số lạy, thời gian, câu niệm và số biến phù hợp."
              },
              {
                "title": "Chọn và sửa bài hồi hướng",
                "text": "Các mẫu lấy từ chính nội dung đã đóng trong ứng dụng: NGHI THỨC TRÌ TỤNG CHÚ ĐẠI BI, NGHI THỨC TRÌ TỤNG THẦN CHÚ THỦ LĂNG NGHIÊM và KINH ĐỊA TẠNG BỒ TÁT BỔN NGUYỆN. Anh/chị có thể sửa bản riêng, thêm danh tánh người thân hoặc tự viết; bản kinh gốc được giữ nguyên."
              },
              {
                "title": "Theo dõi từng bước",
                "text": "Bắt đầu thời khóa để vào các công cụ hành trì theo thứ tự. Theo dõi số bước, tạm dừng khi cần hoặc chủ động chuyển bước. Đọc xong phần hồi hướng rồi xác nhận hoàn thành; bước bị bỏ qua không được xem như đã thực hành đủ mục tiêu."
              }
            ]
          }
        ]
      },
      {
        "id": "dong-bo-ca-nhan-48-gio",
        "title": "Lưu cá nhân & Đồng bộ sau 48 giờ",
        "keywords": [
          "48 giờ",
          "48 tiếng",
          "đồng bộ cá nhân",
          "lời hồi hướng",
          "tiết kiệm dữ liệu",
          "khôi phục thời khóa"
        ],
        "blocks": [
          {
            "type": "paragraph",
            "text": "Thời khóa, lời hồi hướng tùy chỉnh và biệt danh được lưu ngay trên thiết bị. Nội dung cá nhân có đồng bộ chỉ gửi khi có thay đổi chưa gửi và đã đủ 48 giờ từ lần đồng bộ thành công trước; lần đầu tính từ thay đổi đầu tiên. Không thay đổi thì không gửi request đồng bộ."
          },
          {
            "type": "paragraph",
            "text": "Nếu ứng dụng đang đóng hoặc ngoại tuyến, việc gửi chờ đến lúc ứng dụng hoạt động trở lại và có mạng. Lỗi mạng không xóa bản trên máy. Nhật ký chọn lưu riêng vẫn chỉ ở thiết bị; đăng bài cộng đồng và gửi lời nguyện là thao tác chủ động nên được gửi ngay, không chờ 48 giờ."
          },
          {
            "type": "callout",
            "tone": "note",
            "title": "Khi đổi thiết bị",
            "text": "Bản mới sửa trong vòng 48 giờ có thể chưa có trên server. Dùng chức năng khôi phục một cách chủ động và kiểm tra nội dung trước khi chọn bản cần giữ; ứng dụng không tự ghi đè bản chưa đồng bộ khi có xung đột."
          }
        ]
      },
      {
        id: 'toa-thien-hen-gio',
        title: 'Tọa thiền & Hẹn giờ chuông tĩnh tâm',
        keywords: ['meditation timer', '15 phút', '30 phút', '45 phút', '60 phút', 'chuông', 'đệm 30 giây'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Thiết lập thời thiền",
                "text": "Chọn 15, 30, 45, 60 phút hoặc thời lượng tùy chỉnh. Chọn âm thanh, nhịp mõ và các tùy chọn đang có trước khi bắt đầu."
              },
              {
                "title": "Chuẩn bị và theo dõi",
                "text": "App có thời gian chuẩn bị 30 giây trước giai đoạn thiền. Theo dõi đồng hồ, tạm dừng hoặc tiếp tục bằng các nút trên màn hình."
              },
              {
                "title": "Cảm biến và kết thúc",
                "text": "Cảm biến chuyển động là tùy chọn, phụ thuộc quyền và thiết bị; không bật vẫn có thể thiền theo thời gian. Kiểm tra phần thời gian được ghi nhận khi kết thúc; ứng dụng không đo mức độ định tâm."
              }
            ]
          }
        ],
      },
      {
        id: 'goi-y-va-tien-do',
        title: 'Lịch Thập Trai, Tiến độ & Bản đồ nhiệt (Heatmap)',
        keywords: ['lịch âm', 'ngày vía', 'thập trai', 'recommendations', 'mục tiêu ngày', 'heatmap', 'huy hiệu'],
        blocks: [
          {
            type: 'cards',
            items: [
              { title: 'Nhắc lịch Thập Trai & Ngày Vía', text: 'Trang Tu Tập tích hợp lịch âm, tự động hiển thị biểu ngữ nhắc nhở vào các ngày trai giới (mồng 1, 8, 14, 15, 23, 30...) và ngày vía chư Phật, Bồ Tát.' },
              { title: 'Bản đồ nhiệt & Chuỗi ngày', text: 'Ghi nhận trực quan mức độ chuyên cần qua chuỗi ngày liên tục (streak) và bản đồ nhiệt (heatmap), giúp bạn có thêm động lực tinh tấn mỗi ngày.' },
              { title: 'Chiến dịch Cộng tu', text: 'Bạn có thể ghi danh tham gia cùng đại chúng trong các đợt phát nguyện niệm Phật, trì chú để hồi hướng công đức chung.' },
              { title: 'Tạo thiệp Hồi hướng công đức', text: 'Sau mỗi khóa lễ hoặc cuối ngày, bạn có thể xuất một tấm thiệp hồi hướng trang nghiêm với đầy đủ số biến kinh/chú đã hoàn thành để lưu niệm hoặc chia sẻ.' },
            ],
          },
        ],
      },
      {
        id: 'che-do-thanh-tinh',
        title: 'Tiết dục bảo thân',
        keywords: ['tiết dục bảo thân', 'thanh tịnh tâm', 'thanh tịnh', 'niệm phật', 'trì chú', 'tiếng mõ', 'chuông bát nhã', 'nhân quả', 'ấn quang'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn nội dung thực hành",
                "text": "Mở Tiết dục bảo thân, xem tiến độ và chọn công cụ đang hỗ trợ theo nhu cầu. Đọc hướng dẫn và dùng các nút điểm danh, nghe chú, tạm dừng hoặc kết thúc được hiển thị."
              },
              {
                "title": "Phát nguyện và cộng tu",
                "text": "Nếu tham gia phát nguyện cùng đại chúng, xem nội dung, thời hạn và mục tiêu trước khi xác nhận. Kiểm tra trạng thái cá nhân và tùy chọn chia sẻ đang có; không coi số liệu cộng đồng là bản sao của dữ liệu offline trên máy."
              }
            ]
          }
        ],
      },
      {
        id: 'cai-dat-nhac-nho-tu-tap',
        title: 'Cài đặt Nhắc nhở Tu tập & Thọ Khang Bảo Giám',
        keywords: [
          'nhắc nhở',
          'thọ khang bảo giám',
          'kiêng hành dâm',
          'thập trai',
          'ngày vía',
          'thời khóa',
          'công phu sáng',
          'công phu tối',
          'cài đặt app',
        ],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Mở nhắc nhở",
                "text": "Vào Cá nhân > Cài đặt app > Nhắc nhở tu tập. Bật các nhóm nhắc ngày âm lịch hoặc thời khóa bạn cần, chọn giờ và ngày lặp phù hợp."
              },
              {
                "title": "Nội dung từng thời khóa",
                "text": "Nhập tên công phu cho các lịch sáng, tối hoặc lịch tự thêm; kiểm tra giờ và trạng thái sau khi lưu. Trên iOS, cho phép thông báo khi app đề nghị nếu muốn nhận nhắc nhở; có thể kiểm tra lại trong Cài đặt hệ thống > Thông báo."
              },
              {
                "title": "Quyền thông báo Android",
                "text": "Chỉ cấp quyền thông báo khi muốn dùng nhắc nhở. Nếu app đề nghị quyền Báo thức và lời nhắc, bật trong cài đặt hệ thống để hạn chế báo trễ khi máy ngủ."
              },
              {
                "title": "Sau khi cài hoặc buộc dừng",
                "text": "Mở app ít nhất một lần sau khi cài/cập nhật để khôi phục lịch. Sau Buộc dừng, cần mở lại app; chế độ tiết kiệm pin hoặc hạn chế chạy nền của máy cũng có thể làm chậm thông báo."
              }
            ]
          }
        ],
      },
      {
        "id": "chep-kinh-tren-app",
        "title": "Chép kinh trên app",
        "keywords": [
          "chép kinh",
          "gõ kinh",
          "bản nháp"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn kinh và chuẩn bị",
                "text": "Mở Chép kinh trong Tu tập, chọn kinh và phẩm/chương đang hỗ trợ, đọc hướng dẫn chuẩn bị rồi bắt đầu. Nếu có yêu cầu đăng nhập, làm theo thông báo trên màn hình."
              },
              {
                "title": "Tự gõ từng đoạn",
                "text": "Gõ lại đoạn mẫu bằng bàn phím, kể cả dấu tiếng Việt. Bật Chữ mờ để hiện chữ mẫu ngay trong ô chép; tắt để đối chiếu khung Kinh mẫu. Khi khung mẫu mở, vị trí tham chiếu theo phần đang gõ; có thể thu gọn hoặc mở lại bằng Hiện kinh mẫu. Tài khoản thông thường không được dán hoặc kéo thả; chỉ dẫn trong ngoặc đơn không bắt buộc chép."
              },
              {
                "title": "Kiểm tra và đọc tiếp",
                "text": "Dùng Rà soát đoạn này để kiểm tra và sửa chữ. Đoạn đạt yêu cầu có thể chuyển tiếp; kiểm tra thông báo khi hoàn thành. Bản nháp tự lưu trên thiết bị; chỉ gửi lên tài khoản khi bấm Lưu lên hệ thống và nhận xác nhận thành công. Kiểm tra lưu trước khi đổi máy hoặc xóa dữ liệu."
              }
            ]
          }
        ]
      }
    ],
  },
  {
    id: 'phap-thoai',
    icon: '🎧',
    title: 'Pháp thoại và thư viện nghe',
    shortTitle: 'Pháp Thoại',
    keywords: ['audio', 'persistent player', 'nghe tiếp', 'yêu thích', 'nghe sau', 'giảng sư', 'thời lượng'],
    editorialStatus: 'verified-software',
    introduction: [
      'Kho bài giảng âm thanh phong phú, hỗ trợ phát liên tục nền, tua nhanh/chậm và tải về nghe khi không có mạng internet.',
    ],
    topics: [
      {
        id: 'dieu-khien-phap-thoai',
        title: 'Trình phát âm thanh & Điều khiển tiện lợi',
        keywords: ['mini player', 'tua 10 giây', 'tua 30 giây', 'space', 'phím m', 'media session', 'màn hình khóa'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Chọn bài và tiếp tục nghe",
                "text": "Mở album rồi chọn bài để phát. Trình phát thu nhỏ cho phép điều khiển khi chuyển trang. Khi mở lại, app ghi nhớ vị trí; bấm Phát nếu cần tiếp tục, không mặc định tự phát khi khởi động."
              },
              {
                "title": "Âm thanh và video",
                "text": "Dùng các nút phát/tạm dừng, tua, tốc độ và chuyển bài đang hiển thị. Với album có video, chọn chế độ được cung cấp. Phát nền, màn hình khóa và nút tai nghe phụ thuộc nền tảng, loại nội dung và quyền của thiết bị."
              }
            ]
          }
        ],
      },
      {
        id: 'luu-va-loc-phap-thoai',
        title: 'Bộ sưu tập cá nhân & Tải nghe Offline',
        keywords: ['favorites', 'yêu thích', 'listen later', 'nghe sau', 'recent', 'gần đây', 'speaker', 'giảng sư', 'duration'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Tìm lại album",
                "text": "Dùng tìm kiếm, Yêu thích, Nghe gần đây và biểu tượng dấu trang 🔖 cho Nghe sau để tìm lại nội dung. Các tùy chọn lọc tùy theo danh sách đang mở."
              },
              {
                "title": "Tải audio khi cần",
                "text": "Trong album, chọn tải bài hoặc album theo các nút được hỗ trợ và đợi tải hoàn tất. Việc cập nhật bìa và danh sách album không tự tải audio hoặc video; mỗi thiết bị cần tải riêng nội dung muốn nghe offline."
              }
            ]
          }
        ],
      },
    ],
  },
  {
    id: 'tai-khoan-dong-bo',
    icon: '☁️',
    title: 'Đăng nhập, đồng bộ và nhập bài Facebook',
    shortTitle: 'Đồng Bộ',
    keywords: ['google', 'cloud sync', 'đổi điện thoại', 'xóa trình duyệt', 'facebook', 'import', 'ledger'],
    editorialStatus: 'verified-software',
    introduction: [
      'Đăng nhập giữ dữ liệu đủ điều kiện theo tài khoản; một số tệp offline vẫn chỉ nằm trên thiết bị.',
    ],
    topics: [
      {
        id: 'dang-nhap-va-dong-bo',
        title: 'Đăng nhập và đồng bộ',
        keywords: ['google login', 'facebook login', 'lịch sử tu tập', 'ghi chú', 'tiến độ đọc', 'đổi máy'],
        blocks: [
          {
            "type": "steps",
            "items": [
              {
                "title": "Đăng nhập bằng Google hoặc Facebook",
                "text": "Dùng tài khoản phù hợp để lưu và đồng bộ các dữ liệu được hỗ trợ như công phu, tiến độ đọc và trích dẫn. Trên app iOS còn có Đăng nhập bằng Apple. Các nhà cung cấp không tự liên kết chỉ vì trùng email."
              },
              {
                "title": "Trước khi đổi máy",
                "text": "Mở mạng và kiểm tra trạng thái đồng bộ. Bản PDF, audio, gói offline và dữ liệu chưa đồng bộ vẫn có thể chỉ nằm trên máy; cần tải lại trên thiết bị mới. Không xóa dữ liệu để xử lý lỗi tải."
              }
            ]
          }
        ],
      },
      {
        "id": "an-toan-cong-dong",
        "title": "Báo cáo, chặn và bỏ chặn",
        "keywords": [
          "báo cáo",
          "chặn",
          "bỏ chặn",
          "cộng đồng",
          "kiểm duyệt"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Báo cáo nội dung",
                "text": "Với bình luận hoặc hồ sơ cộng đồng có menu thao tác, chọn Báo cáo, chọn lý do và gửi. Cần đăng nhập và kết nối mạng; chỉ coi đã gửi khi app xác nhận thành công. Nội dung chờ duyệt có thể chưa xuất hiện công khai."
              },
              {
                "title": "Chặn và bỏ chặn",
                "text": "Chọn Chặn người dùng ở menu được cung cấp để ẩn nội dung của người đó đối với tài khoản của bạn. Vào Cá nhân, mở danh sách Người đã chặn và xác nhận Bỏ chặn khi muốn xem lại; thao tác này không tự xóa bình luận của họ."
              },
              {
                "title": "Phân biệt quyền quản trị",
                "text": "Người dùng gửi báo cáo và quản lý danh sách chặn của mình. Hàng đợi kiểm duyệt và quyết định duyệt/ẩn dành cho quản trị viên; cộng tác viên không mặc nhiên có quyền này. Nếu dịch vụ báo lỗi, giữ nguyên thao tác và thử lại sau."
              }
            ]
          }
        ]
      },
      {
        "id": "xoa-tai-khoan",
        "title": "Xóa tài khoản",
        "keywords": [
          "xóa tài khoản",
          "Apple",
          "mã xác nhận",
          "dữ liệu"
        ],
        "blocks": [
          {
            "type": "steps",
            "items": [
              {
                "title": "Xác nhận đúng tài khoản",
                "text": "Đăng nhập tài khoản muốn xóa, vào Cá nhân > Xóa tài khoản. Đọc cảnh báo và nhập đúng mã xác nhận hiển thị; đây không phải thao tác đăng xuất thông thường."
              },
              {
                "title": "Hoàn tất yêu cầu",
                "text": "Cần kết nối mạng. Tài khoản liên kết Apple có thể cần xác thực lại với Apple. Chờ xác nhận thành công; nếu báo lỗi hoặc hủy xác thực, không coi tài khoản đã được xóa."
              },
              {
                "title": "Kiểm tra dữ liệu trên thiết bị",
                "text": "Xóa tài khoản trên hệ thống không thay cho việc tự xóa bản tải xuống, bản xuất hoặc dữ liệu còn lưu ở thiết bị khác. Nếu không truy cập được tài khoản, dùng mục Liên hệ để được hỗ trợ xác minh; không gửi mật khẩu hoặc mã đăng nhập."
              }
            ]
          }
        ]
      },
      {
        id: 'ket-noi-facebook-quan-tri',
        title: 'Kết nối và nhập bài Facebook dành cho quản trị viên',
        keywords: ['facebook connect', 'meta app review', 'user_posts', 'nguồn nhập', 'nhật ký import', 'ledger', 'reconnect'],
        blocks: [
          {
            type: 'steps',
            items: [
              { title: 'Kết nối đúng tài khoản', text: 'Trong Cài đặt quản trị, kết nối Facebook và xác nhận nguồn bài được cấu hình. Google và Facebook không tự liên kết chỉ dựa trên email.' },
              { title: 'Theo dõi nhật ký nhập', text: 'Bảng ledger hiển thị bài đã thấy, đã nhập, lỗi, cần duyệt hoặc đã tách khỏi nguồn; bài nhập vẫn đi qua luồng biên tập hiện có.' },
              { title: 'Kết nối lại khi cần', text: 'Khi quyền hết hạn hoặc bị thu hồi, trạng thái yêu cầu kết nối lại và lịch nhập dừng an toàn thay vì lấy dữ liệu bằng cách khác.' },
            ],
          },
          { type: 'callout', tone: 'warning', title: 'Điều kiện kích hoạt của Meta', text: 'Đăng nhập Facebook và nhập bài tự động chỉ hoạt động đầy đủ sau khi ứng dụng Meta được cấp quyền cần thiết, gồm user_posts Advanced Access. Nếu chưa được duyệt, importer báo chưa có quyền và tuyệt đối không scrape.' },
        ],
      },
    ],
  },
];

export const guideJumpLinks = [
  { id: 'cai-app', icon: '📱', label: 'Cài App' },
  { id: 'dung-web', icon: '📱', label: 'Dùng App' },
  { id: 'huong-dan-nguoi-moi', icon: '🌱', label: 'Người Mới' },
  { id: 'huong-dan-tung-kinh', icon: '📖', label: 'Tụng Kinh' },
  { id: 'huong-dan-tri-chu', icon: '📿', label: 'Trì Chú' },
  { id: 'tho-tuong-tai-gia', icon: '🪔', label: 'Thờ Tượng' },
  { id: 'thuc-hanh-hang-ngay', icon: '📋', label: 'Thực Hành' },
  { id: 'bo-thi-may-nghe-phap', icon: '📻', label: 'Bố Thí Pháp' },
  { id: 'gioi-thieu-tac-gia', icon: '👤', label: 'Tác Giả' },
  { id: 'hoi-dap-thuong-gap', icon: '❓', label: 'Hỏi Đáp' },
] as const;

function normalizeGuideSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLocaleLowerCase('vi')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Giữ đường dẫn cũ đầy đủ; hai phần mới dùng lại nguyên nội dung và ID. */
export function selectGuideSections(sections: GuideSection[], softwareIds: string[], part: string | null): GuideSection[] {
  if (part !== 'tu-hoc' && part !== 'ung-dung') return sections;
  const appFaqIds = new Set(['faq-xoa-trinh-duyet', 'faq-dung-tren-may-tinh']);
  const software = new Set(softwareIds);
  return sections.flatMap(section => {
    if (part === 'tu-hoc' && section.id === 'gioi-thieu-tac-gia') return [];
    if (section.id === 'hoi-dap-thuong-gap') {
      const faqs = section.faqs?.filter(faq =>
        part === 'ung-dung' ? appFaqIds.has(faq.id) : !appFaqIds.has(faq.id)
      ) ?? [];
      return [{ ...section, faqs, keywords: ['faq', ...faqs.flatMap(faq => faq.keywords)] }];
    }
    return software.has(section.id) === (part === 'ung-dung') ? [section] : [];
  });
}

export function createGuideSearchTargets(sections: GuideSection[]): GuideSearchTarget[] {
  const targets: GuideSearchTarget[] = [guideInstallTarget];
  for (const section of sections) {
    targets.push({
      id: section.id,
      sectionId: section.id,
      kind: 'section',
      title: section.title,
      context: section.shortTitle,
      keywords: section.keywords,
    });
    for (const topic of section.topics) {
      targets.push({
        id: topic.id,
        sectionId: section.id,
        kind: 'topic',
        title: topic.title,
        context: section.title,
        keywords: topic.keywords,
      });
    }
    for (const faq of section.faqs ?? []) {
      targets.push({
        id: faq.id,
        sectionId: section.id,
        kind: 'faq',
        title: faq.question,
        context: section.title,
        keywords: faq.keywords,
      });
    }
  }
  return targets;
}

export function searchGuideTargets(targets: GuideSearchTarget[], query: string): GuideSearchTarget[] {
  const needle = normalizeGuideSearch(query);
  if (!needle) return [];
  const terms = needle.split(' ');
  return targets
    .map((target) => {
      const title = normalizeGuideSearch(target.title);
      const searchable = normalizeGuideSearch([target.title, target.context, ...target.keywords].join(' '));
      if (!terms.every((term) => searchable.includes(term))) return null;
      const score = title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : 3;
      return { target, score };
    })
    .filter((entry): entry is { target: GuideSearchTarget; score: number } => entry !== null)
    .sort((a, b) => {
      const kindRank = (kind: GuideSearchTarget['kind']) => kind === 'section' ? 1 : 0;
      return a.score - b.score
        || kindRank(a.target.kind) - kindRank(b.target.kind)
        || a.target.title.localeCompare(b.target.title, 'vi');
    })
    .slice(0, 8)
    .map(({ target }) => target);
}
